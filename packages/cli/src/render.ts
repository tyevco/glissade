/**
 * gs render (DESIGN.md §5.1d, §5.7): load a scene module, evaluate each frame,
 * rasterize on Skia, write a PNG sequence — and mux to mp4/webm via FFmpeg
 * when requested and available. No browser anywhere.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createJiti } from 'jiti';
import { buildFontRegistry, type AudioClip } from '@glissade/core';
import { evaluate, validateSceneFonts, collectLocalizedTextUsages, withDeterminismGuards, type SceneModule } from '@glissade/scene';
import { collectAssetReferences, validateAssetReferences } from './assetValidation.js';
import { SkiaBackend } from '@glissade/backend-skia';

export interface RenderOptions {
  modulePath: string;
  out: string;
  fps?: number;
  /** seconds; defaults to [0, duration] (programmatic API — the CLI uses frame indices). */
  range?: [number, number];
  /** inclusive FRAME indices [first, last] (§5: export APIs are frame-indexed). Wins over `range`. */
  frameRange?: [number, number];
  /** a single FRAME index — a still through the same path. Wins over `frameRange`/`range`. */
  frame?: number;
  /** force a PNG sequence even when `out` has a video extension. */
  format?: 'png-seq';
  /** InputTrace file: replay → bake → render (v2 §A.6 route 2). */
  trace?: string;
  /** Render one machine state's timeline linearly (route 3). */
  state?: string;
  /** Downgrade a trace hash mismatch to a warning. */
  force?: boolean;
  /** burn (default): captions render in-frame; sidecar/off hide the caption node. */
  captions?: 'burn' | 'sidecar' | 'off';
  /** auto (default): mix a sibling *.music.timing.json bed, ducked under narration. */
  music?: 'auto' | 'off';
  /** auto (default): mix the voice from a sibling *.narration.timing.json. */
  narration?: 'auto' | 'off';
  /** auto (default): mix effect hits from a sibling *.sfx.timing.json. */
  sfx?: 'auto' | 'off';
  /**
   * auto (default): apply a committed `<scene>.loudness.json` publish gain (a
   * pure scalar `volume=<gain>dB` on the final mix node) when one exists, and
   * HARD-THROW if its mixHash no longer matches the mix inputs (a re-narrate must
   * invalidate loudly). 'off' ignores any committed measurement.
   */
  loudness?: 'auto' | 'off';
  /** also write WebVTT chapters from cue markers ('vtt'); cues.json is always written when cues exist. */
  chapters?: 'vtt' | 'off';
  /** cue kinds that become VTT chapters (default just 'chapter'); cues.json keeps all kinds. */
  chapterKinds?: ReadonlySet<string>;
  /** --strict: font validation throws on an unregistered family / missing glyph (§3.6). Default dev-warn. */
  strictFonts?: boolean;
  /**
   * --allow-system-fonts (§3.6, 0.14 FIX 6): exempt true-OS-installed families
   * (the host `GlobalFonts.families` catalog) from the unregistered-family check.
   * OFF by default — the exempt set is otherwise just the families glissade
   * registered from `doc.assets`, so the verdict is host-independent. IGNORED
   * under --strict (strict stays host-independent regardless of this flag).
   */
  allowSystemFonts?: boolean;
  /**
   * --workers N (§5.6): split the frame range into N contiguous sub-ranges, render
   * each in a separate `gs` child process, and join the shard videos. Ignored for
   * a single frame or N <= 1. Only meaningful for a video `out`.
   */
  workers?: number;
  /**
   * --lossless-intermediate (§5.6, §8.1): render shards as FFV1 (lossless) and do a
   * single final encode after the concat — the guaranteed byte-correct join path.
   * Forced on automatically when the picked encoder can't honor precise boundary
   * keyframes (mpeg4 / openh264).
   */
  losslessIntermediate?: boolean;
  /**
   * --allow-gpu-shards (§5.6): sharded GPU/shader output isn't reproducible across
   * processes/machines, so a scene containing a ShaderEffect refuses to shard unless
   * this is set.
   */
  allowGpuShards?: boolean;
  /**
   * --cache (§3.5, 0.12): persistent whole-frame raster cache. `dir` is the
   * `.gscache` directory (shared across runs AND shards); `mode` defaults to 'off'
   * (the exact current equality baseline). `maxSize` caps the LRU (default 2 GB).
   * A hit serves a stored RGBA byte-identical to a cold render — it wins REPEATED
   * renders and the UNCHANGED-PREFIX of a single-segment edit. A full re-narrate
   * shifts every frame's timing → every DisplayList changes → every frame MISSES.
   */
  cache?: { dir: string; mode: import('./frameCache.js').CacheMode; maxSize?: number };
  /**
   * --locale <code> (0.14 localization core): resolve the scene against a
   * per-locale message table (`messages.<code>.json`) and prefer the
   * locale-tagged narration sibling (`<base>.<code>.narration.timing.json`).
   * Omitted (the base path) resolves the BASE files → byte-identical to today.
   */
  locale?: string;
  onProgress?: (frame: number, total: number) => void;
}

/**
 * Build the case-folded set of families EXEMPT from the §3.6 unregistered-family
 * check (FIX 6, 0.14). Seeded from the families glissade actually registered out
 * of `doc.assets` (`registered`, already lower-cased) — NEVER the true-OS
 * `GlobalFonts.families` catalog, which is host-dependent (3 families on a clean
 * Linux CI box, hundreds on a dev macOS) and would make the --strict PASS/FAIL
 * verdict depend on the host. The true-OS `osCatalog` is folded in ONLY when
 * `allowSystemFonts` is set AND `strict` is false — so --strict stays host-
 * independent regardless of the flag. Pure: no I/O, no host queries.
 */
export function buildFontExemptSet(
  registered: ReadonlySet<string>,
  opts: { allowSystemFonts: boolean; strict: boolean; osCatalog: ReadonlySet<string> },
): ReadonlySet<string> {
  const exempt = new Set<string>(registered);
  if (opts.allowSystemFonts && !opts.strict) {
    for (const f of opts.osCatalog) exempt.add(f);
  }
  return exempt;
}

// --- locales fan-out (§0.15): begin self-contained region ---
// `gs render <scene> --locales en,zh,ja` renders the scene ONCE PER locale over
// the existing 0.14 `--locale <code>` path, writing one artifact per locale.
// Pure CLI orchestration — no render-path change, every per-locale render is the
// EXACT 0.14 single-locale render, so the 252 goldens stay byte-identical. The
// loop runs sequentially: `render()` → `loadSceneModule()` calls `setMessageTable`
// at the top of every iteration, fully REPLACING the ambient i18n table, so the
// per-locale ambient state can't leak between iterations (no snapshot/restore
// needed against today's module-global table; if i18n-hardening later threads the
// table via AsyncLocalStorage, this loop composes over it unchanged — each
// `render()` call is still a self-contained locale).

export class LocaleArgsError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'LocaleArgsError';
  }
}

/**
 * Parse the `--locales <a,b,c>` comma-separated list into a de-duplicated,
 * order-preserving array of locale codes. Empty / whitespace-only entries are
 * dropped; an all-empty list is rejected (a `--locales` with nothing to render
 * is a user error, not a silent no-op).
 */
export function parseLocalesList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const code = part.trim();
    if (code === '' || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  if (out.length === 0) {
    throw new LocaleArgsError(`--locales is empty — pass a comma-separated list, e.g. --locales en,zh`);
  }
  return out;
}

/**
 * Derive the per-locale output path from the base `out` and a locale code.
 *
 * Convention: a video/PNG FILE path (`out/episode.mp4`, `out/still.png`) gets a
 * locale segment inserted before the extension → `out/episode.<locale>.mp4`. Any
 * other `out` (a PNG-sequence DIRECTORY, the default `out`) gets a per-locale
 * SUBDIR → `out/<locale>` (so `out/en/frame-00000.png`, `out/zh/frame-00000.png`).
 * `--format png-seq` forces the directory convention even for a video-looking
 * name, matching how `render()` itself treats `out` under that flag.
 */
export function localeOutPath(out: string, locale: string, format?: 'png-seq'): string {
  const isVideoName = format !== 'png-seq' && /\.(mp4|webm)$/i.test(out);
  const isPngFile = format !== 'png-seq' && /\.png$/i.test(out);
  if (isVideoName || isPngFile) {
    return out.replace(/(\.[^.]+)$/, `.${locale}$1`);
  }
  // directory (PNG sequence) output → a per-locale subdirectory
  return join(out, locale);
}

/**
 * §0.15 `--locales` fan-out: render the scene once per locale, writing one
 * artifact per locale to a distinct per-locale path (`localeOutPath`). Each
 * per-locale render IS the 0.14 single-`--locale` render — so `--locales en,zh`
 * ≡ `--locale en` then `--locale zh` with distinct outputs.
 *
 * Fails LOUDLY: a locale in the list with no resolvable assets throws the 0.14
 * `UnknownLocaleError` (naming the bad locale) from inside `render()`, aborting
 * the whole fan-out — locales already rendered keep their artifacts, but the
 * process exits non-zero so a missing-asset locale is never silently skipped.
 */
export async function renderLocales(
  opts: Omit<RenderOptions, 'locale'>,
  locales: readonly string[],
): Promise<{ locale: string; result: { frames: number; out: string } }[]> {
  const results: { locale: string; result: { frames: number; out: string } }[] = [];
  for (const locale of locales) {
    const result = await render({
      ...opts,
      out: localeOutPath(opts.out, locale, opts.format),
      locale,
    });
    results.push({ locale, result });
  }
  return results;
}
// --- locales fan-out: end self-contained region ---

/** A scene module's default export is not a valid `SceneModule`. */
export class SceneModuleError extends Error {
  constructor(modulePath: string, detail: string) {
    super(
      `${modulePath}: ${detail}\n` +
        'A scene module default-exports { createScene(): Scene, timeline: Timeline } (SceneModule).',
    );
    this.name = 'SceneModuleError';
  }
}

/**
 * Parse the CLI `--range a..b` flag as INCLUSIVE integer FRAME indices (§5:
 * export APIs are frame-indexed; Player APIs are seconds). Decimal or malformed
 * ranges are rejected, since a frame index is an integer.
 */
export function parseFrameRange(flag: string): [number, number] {
  const m = /^(\d+)\.\.(\d+)$/.exec(flag.trim());
  if (!m) {
    throw new Error(`--range must be integer frames 'a..b' (e.g. 0..120), got '${flag}'`);
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (b < a) throw new Error(`--range end (${b}) is before start (${a})`);
  return [a, b];
}

export async function loadSceneModule(modulePath: string, locale?: string): Promise<SceneModule> {
  // 0.14 localization core: install the ambient message table BEFORE the module
  // is imported — `t('id')` runs at module-eval / createScene() time, so the
  // table must be set first. No --locale leaves the ambient table unset, so
  // `t(id)` returns `id` verbatim → the base path is byte-identical to today.
  const { setMessageTable } = await import('@glissade/core/i18n');
  if (locale !== undefined && locale !== '') {
    const { loadMessageTable } = await import('./locale.js');
    setMessageTable(loadMessageTable(modulePath, locale));
  } else {
    setMessageTable(undefined);
  }

  const abs = isAbsolute(modulePath) ? modulePath : resolve(process.cwd(), modulePath);
  const jiti = createJiti(pathToFileURL(process.cwd() + '/').href);
  const loaded = (await jiti.import(pathToFileURL(abs).href, { default: true })) as Partial<SceneModule>;
  if (typeof loaded?.createScene !== 'function' || loaded?.timeline === undefined) {
    throw new SceneModuleError(modulePath, 'default export is not a SceneModule');
  }
  return loaded as SceneModule;
}

export function ffmpegAvailable(): boolean {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

export async function render(opts: RenderOptions): Promise<{ frames: number; out: string }> {
  const mod = await loadSceneModule(opts.modulePath, opts.locale);
  const scene = mod.createScene();
  // machine export routes (v2 §A.6): machines render via --trace/--state or error
  const { resolveRenderDoc } = await import('./machines.js');
  let doc = resolveRenderDoc(mod, scene, {
    ...(opts.trace !== undefined ? { trace: opts.trace } : {}),
    ...(opts.state !== undefined ? { state: opts.state } : {}),
    ...(opts.force !== undefined ? { force: opts.force } : {}),
  });

  // 0.14 localization core: resolve node-id-targeted string tracks (captions +
  // narration-derived text live in the doc as string tracks) against the locale
  // message table. A pure doc→doc swap; no --locale / no table = no-op, so the
  // base path is byte-identical to today.
  if (opts.locale !== undefined && opts.locale !== '') {
    const { loadMessageTable, messagesFileFor, localeNarrationPathFor, UnknownLocaleError } = await import('./locale.js');
    const table = loadMessageTable(opts.modulePath, opts.locale);
    // FIX 4 (0.14 canary): a declared --locale that resolves NEITHER a messages
    // table NOR a locale-tagged narration sibling would silently render the BASE
    // artifact (wrong language, exit 0). Hard-throw instead. A narration-only
    // locale legitimately has no messages file, so only fail when BOTH are absent.
    const narrationPath = localeNarrationPathFor(opts.modulePath, opts.locale);
    if (!table && !existsSync(narrationPath)) {
      throw new UnknownLocaleError(opts.locale, messagesFileFor(opts.modulePath, opts.locale), narrationPath);
    }
    if (table) {
      const { localize, getConsumedMessageIds } = await import('@glissade/core/i18n');
      doc = localize(doc, table, { locale: opts.locale, consumedIds: getConsumedMessageIds() });
    }
  }
  const fps = opts.fps ?? doc.fps ?? 60;

  // --captions sidecar/off: hide the caption node via a document override —
  // only when the scene actually has one (an unbound target would throw).
  const captionsMode = opts.captions ?? 'burn';
  const { hideCaptionsDoc, timingPathFor, writeCaptionSidecars } = await import('./captions.js');
  const { writeCueSidecars } = await import('./cues.js');
  if (captionsMode !== 'burn' && scene.resolveTarget('captions/opacity') !== undefined) {
    doc = hideCaptionsDoc(doc);
  }

  const { compileTimeline } = await import('@glissade/core');
  const compiled = compileTimeline(doc);
  const duration = compiled.duration;
  let firstFrame: number;
  let lastFrame: number;
  if (opts.frame !== undefined) {
    firstFrame = lastFrame = opts.frame;
  } else if (opts.frameRange) {
    [firstFrame, lastFrame] = opts.frameRange;
    lastFrame = Math.max(firstFrame, lastFrame);
  } else {
    const [from, to] = opts.range ?? [0, duration];
    firstFrame = Math.round(from * fps);
    lastFrame = Math.max(firstFrame, Math.ceil(to * fps) - 1);
  }
  const total = lastFrame - firstFrame + 1;

  // --format png-seq forces a PNG sequence even if `out` looks like a video name
  const isVideo = opts.format !== 'png-seq' && /\.(mp4|webm)$/i.test(opts.out);
  // a single frame to a *.png path writes THAT one file, not a directory of frames
  const singleFile = !isVideo && total === 1 && /\.png$/i.test(opts.out);
  if (isVideo && !ffmpegAvailable()) {
    throw new Error(
      `'${opts.out}' needs FFmpeg on PATH and none was found. ` +
        'Render a PNG sequence instead (--out <directory>) or install ffmpeg.',
    );
  }

  // §5.6 sharded export: split the frame range across N child `gs` processes
  // and join the shard videos. Only a real video output with >1 frame shards;
  // a single still / PNG sequence / N<=1 falls through to the linear path.
  const workers = Math.max(1, Math.floor(opts.workers ?? 1));
  if (workers > 1 && isVideo && total > 1) {
    const { renderSharded } = await import('./shards.js');
    return renderSharded({
      opts,
      scene,
      compiled,
      fps,
      duration,
      firstFrame,
      lastFrame,
      container: /\.webm$/i.test(opts.out) ? 'webm' : 'mp4',
      workers,
      timingPathFor,
      writeCaptionSidecars,
      writeCueSidecars,
    });
  }

  const framesDir = isVideo
    ? mkdtempSync(join(tmpdir(), 'glissade-frames-'))
    : singleFile
      ? dirname(resolve(opts.out))
      : resolve(opts.out);
  mkdirSync(framesDir, { recursive: true });

  const backend = new SkiaBackend(scene.size.w, scene.size.h);
  // line breaking measures with the rasterizer that will draw (§3.2)
  scene.setTextMeasurer(backend);

  // flexbox scenes need the wasm engine loaded before evaluation (§3.2)
  const hasLayout = [...scene.nodes.values()].some(
    (n) => (n.constructor as { isLayoutNode?: boolean }).isLayoutNode === true,
  );
  if (hasLayout) {
    const { loadYogaLayoutEngine } = await import('@glissade/scene/layout');
    await loadYogaLayoutEngine();
  }

  // Pre-validate every Image/Video asset reference against the declared
  // timeline assets BEFORE warming/evaluate, so an undeclared (or undefined —
  // the `new Image({ src })` mistake) asset id surfaces the REAL cause instead
  // of the downstream `asset 'undefined' not ready` ColdAssetError (§2.5).
  validateAssetReferences(
    collectAssetReferences(scene.root as unknown as Parameters<typeof collectAssetReferences>[0]),
    Object.keys(doc.assets ?? {}),
  );

  // Warm timeline assets before evaluation (§2.5 readiness precondition).
  const videoSources: import('./videoSource.js').FfmpegVideoFrameSource[] = [];
  const { resolveAssetPath: resolveAsset } = await import('./audioMix.js');

  // §3.6: register EVERY declared face under its family (the asset id IS the
  // family name), not one path per asset, so weight/style variants resolve.
  // A plain ttf/otf path goes straight to Skia via registerFromPath — the
  // byte-identical legacy path that keeps the existing goldens stable. A
  // woff/woff2 face is decoded in-process (the §3.6 front door) before
  // register(Buffer, family), since @napi-rs/canvas cannot read woff2 directly.
  // §3.5 cache: the DisplayList carries only an asset *id*, never the pixels/glyphs,
  // so an in-place edit of an asset (same id/url) would otherwise collide the frame
  // cache key and serve STALE pixels. We sha256 each referenced asset's BYTES as we
  // load them and fold a combined digest into the cache key context below.
  const { createHash } = await import('node:crypto');
  const assetDigests = new Map<string, string>();
  const digestBytes = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

  // Families glissade actually registers from `doc.assets` (FIX 6, 0.14): these
  // — NOT the true-OS catalog — seed the --strict validation's "exempt" set, so
  // the PASS/FAIL verdict is host-independent. Case-folded to match isExemptFamily.
  const registeredFamilies = new Set<string>();
  const fontRegistry = buildFontRegistry(doc.assets);
  if (fontRegistry.faces().length > 0) {
    const { GlobalFonts } = await import('@napi-rs/canvas');
    let ingest: typeof import('@glissade/core/font-ingest') | undefined;
    for (const face of fontRegistry.faces()) {
      registeredFamilies.add(face.family.toLowerCase());
      const path = resolveAsset(face.url, opts.modulePath);
      if (/\.woff2?$/i.test(face.url)) {
        ingest ??= await import('@glissade/core/font-ingest');
        const src = await readFile(path);
        assetDigests.set(`font:${face.family}:${face.url}`, digestBytes(src));
        const result = await ingest.ingestFont({ family: face.family, src });
        GlobalFonts.register(Buffer.from(result.bytes), face.family);
      } else {
        assetDigests.set(`font:${face.family}:${face.url}`, digestBytes(await readFile(path)));
        GlobalFonts.registerFromPath(path, face.family);
      }
    }
  }

  // --- osFamilies (§3.6, 0.14, FIX 6): begin self-contained region ---
  // The OS catalog is host-dependent (3 families on clean Linux, hundreds on
  // macOS); reading it into the exempt set made the --strict verdict host-
  // dependent. Only fold the true-OS catalog when it would actually be USED —
  // i.e. --allow-system-fonts AND not --strict (buildFontExemptSet ignores it
  // otherwise). This also avoids importing the catalog on the common path.
  const includeOsCatalog = !!opts.allowSystemFonts && !opts.strictFonts;
  const osCatalog = includeOsCatalog
    ? new Set<string>(
        (await import('@napi-rs/canvas')).GlobalFonts.families.map((f) => f.family.toLowerCase()),
      )
    : new Set<string>();
  const osFamilies = buildFontExemptSet(registeredFamilies, {
    allowSystemFonts: !!opts.allowSystemFonts,
    strict: !!opts.strictFonts,
    osCatalog,
  });
  // --- osFamilies: end self-contained region ---

  // §3.6 font validation: dev-warn by default, --strict throws on an
  // unregistered non-generic family or an uncovered glyph. FIX 3 (0.14 canary):
  // also validate the POST-localize string-track values (`doc` is already the
  // localized doc here) — `validateSceneFonts`'s scene-walk only sees the authored
  // BASE `node.text()`, which is read BEFORE the localized tracks bind, so a
  // localized CJK message on a Latin-only font would otherwise pass --strict then
  // render tofu. Empty for the base (no --locale) render → byte-identical path.
  const localizedUsages =
    opts.locale !== undefined && opts.locale !== ''
      ? collectLocalizedTextUsages(scene, doc)
      : [];
  await validateSceneFonts(
    scene,
    doc,
    async (url) => {
      try {
        const buf = await readFile(resolveAsset(url, opts.modulePath));
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      } catch {
        return undefined;
      }
    },
    { mode: opts.strictFonts ? 'strict' : 'dev', osFamilies, extraUsages: localizedUsages },
  );

  for (const [assetId, ref] of Object.entries(doc.assets ?? {})) {
    if (ref.kind === 'font') {
      // faces already registered above
    } else if (ref.kind === 'image') {
      const { loadImage } = await import('@napi-rs/canvas');
      const imgPath = resolveAsset(ref.url, opts.modulePath);
      assetDigests.set(`image:${assetId}`, digestBytes(await readFile(imgPath)));
      backend.setImageAsset(assetId, await loadImage(imgPath));
    } else if (ref.kind === 'video') {
      if (!ffmpegAvailable()) {
        throw new Error(`video asset '${assetId}' needs FFmpeg on PATH for frame extraction (§5.4)`);
      }
      const { FfmpegVideoFrameSource } = await import('./videoSource.js');
      const videoPath = resolveAsset(ref.url, opts.modulePath);
      assetDigests.set(`video:${assetId}`, digestBytes(await readFile(videoPath)));
      const source = new FfmpegVideoFrameSource(videoPath);
      await source.warm(0, source.duration); // v1: whole-source warm, trivially correct
      backend.setVideoAsset(assetId, source);
      videoSources.push(source);
    }
  }
  // §3.5 persistent whole-frame raster cache (opt-in; default 'off' = baseline).
  // The key folds the DisplayList-snapshot bytes + the glissade version + the
  // backend caps id (the INJECTED CacheKeyContext — components with no source in
  // `scene`). A HIT loads the stored RGBA back into the SAME backend (putPixels)
  // and runs the IDENTICAL encodePng, so it is byte-identical to a cold render.
  let frameCache: import('./frameCache.js').FrameCache | undefined;
  let keyCtx: import('./frameCache.js').CacheKeyContext | undefined;
  if (opts.cache && opts.cache.mode !== 'off') {
    const { FrameCache, capsId, combineAssetDigests } = await import('./frameCache.js');
    const { glissadeVersion } = await import('./version.js');
    frameCache = new FrameCache({
      dir: opts.cache.dir,
      mode: opts.cache.mode,
      ...(opts.cache.maxSize !== undefined ? { maxSize: opts.cache.maxSize } : {}),
    });
    keyCtx = {
      version: glissadeVersion(),
      capsId: capsId(backend.caps),
      // fold the BYTES of every referenced image/video/font so an in-place asset
      // edit (same id/url) invalidates the key instead of serving stale pixels.
      assetsDigest: combineAssetDigests(assetDigests),
    };
  }

  for (let f = firstFrame; f <= lastFrame; f++) {
    // §5.5: the CLI/CI export path rejects any wall-clock/random/timer call inside evaluate()
    const dl = withDeterminismGuards('throw', () => evaluate(scene, doc, f / fps));
    let pngBytes: Buffer | undefined;
    if (frameCache && keyCtx) {
      const { frameCacheKey } = await import('./frameCache.js');
      const key = frameCacheKey(dl, keyCtx);
      const cached = frameCache.get(key);
      if (cached) {
        // HIT: blit the stored RGBA into the backend, then encode via the EXACT
        // same path a miss takes → byte-identical to a cold render.
        backend.putPixels(cached);
        pngBytes = backend.encodePng();
      } else {
        backend.render(dl);
        pngBytes = backend.encodePng();
        // store the raw RGBA (the canvas getImageData round-trips byte-exactly)
        frameCache.put(key, scene.size.w, scene.size.h, await backend.readPixels());
      }
    } else {
      backend.render(dl);
      pngBytes = backend.encodePng();
    }
    const file = singleFile ? resolve(opts.out) : join(framesDir, `frame-${String(f).padStart(5, '0')}.png`);
    writeFileSync(file, pngBytes);
    opts.onProgress?.(f - firstFrame + 1, total);
  }
  backend.dispose();
  if (frameCache) {
    const s = frameCache.getStats();
    process.stderr.write(
      `cache (${opts.cache!.mode}): ${s.hits} hit${s.hits === 1 ? '' : 's'}, ${s.misses} miss${s.misses === 1 ? '' : 'es'}` +
        (s.stored ? `, ${s.stored} stored` : '') +
        (s.evicted ? `, ${s.evicted} evicted (LRU cap ${frameCache.maxSize} B)` : '') +
        ` → ${opts.cache!.dir}\n`,
    );
  }
  for (const source of videoSources) source.close();

  // burn and sidecar modes both emit .srt/.vtt — the cues come from the same
  // timing manifest as the burned track, so they match by construction
  const emitSidecars = (target: string): void => {
    if (captionsMode === 'off') return;
    const timingPath = timingPathFor(opts.modulePath, opts.locale);
    if (!timingPath) {
      if (captionsMode === 'sidecar') {
        process.stderr.write('note: --captions sidecar: no narration timing manifest found; run gs narrate first\n');
      }
      return;
    }
    const { srt, vtt } = writeCaptionSidecars(timingPath, target);
    process.stderr.write(`captions: ${srt}, ${vtt}\n`);
  };

  // composer cue signaling (§ad-break): cue markers → <stem>.cues.json (+ chapters)
  const emitCues = (target: string): void => {
    const written = writeCueSidecars(target, compiled.markers, duration, opts.chapters === 'vtt', opts.chapterKinds);
    if (written.length) process.stderr.write(`cues: ${written.join(', ')}\n`);
  };

  if (!isVideo) {
    if (singleFile) return { frames: 1, out: resolve(opts.out) }; // one still, no sequence/sidecars
    if (compiled.audio.length > 0) {
      process.stderr.write('note: PNG-sequence output ignores timeline audio; render to .mp4/.webm to mix it\n');
    }
    emitSidecars(framesDir);
    emitCues(framesDir);
    return { frames: total, out: framesDir };
  }

  const outAbs = resolve(opts.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  emitSidecars(outAbs);
  emitCues(outAbs);
  const isWebm = /\.webm$/i.test(outAbs);
  const container = isWebm ? ('webm' as const) : ('mp4' as const);

  // pick encoders from what THIS ffmpeg build actually offers (§5.2)
  const { pickEncoder } = await import('./encoders.js');
  const videoEnc = pickEncoder('video', container);
  if (videoEnc.note) process.stderr.write(`note: ${videoEnc.note}\n`);
  // quality flags are per-encoder: crf (x264/vpx), bitrate (openh264), q:v (mpeg4)
  const VIDEO_QUALITY: Record<string, string[]> = {
    'libx264': ['-crf', '18'],
    'libvpx-vp9': ['-b:v', '0', '-crf', '32'],
    'libvpx': ['-b:v', '2M'],
    'libopenh264': ['-b:v', '4M'],
    'mpeg4': ['-q:v', '3'],
  };
  const codec = [
    '-c:v', videoEnc.name,
    ...(VIDEO_QUALITY[videoEnc.name] ?? []),
    ...(isWebm ? [] : ['-pix_fmt', 'yuv420p', '-movflags', '+faststart']),
  ];

  const { audioInputs, audioArgs } = await planFinalAudio(opts, [...compiled.audio], duration, container);

  const args = [
    '-y',
    '-framerate', String(fps),
    '-start_number', String(firstFrame),
    '-i', join(framesDir, 'frame-%05d.png'),
    ...audioInputs,
    ...audioArgs,
    ...codec,
    '-t', String(duration),
    outAbs,
  ];
  const result = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  rmSync(framesDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed (exit ${result.status}):\n${result.stderr?.toString().slice(-2000)}`);
  }
  return { frames: total, out: outAbs };
}

/**
 * Collect the timeline + auto-mixed (narration/music/sfx) audio clips for a
 * scene — the shared front half of the mix used by both `planFinalAudio` (the
 * render/shard path) and `buildMixWav` (the measure-loudness path), so the mix
 * CONTENT measured at commit-time is byte-for-byte the mix rendered later.
 */
export async function collectAudioClips(
  opts: Pick<RenderOptions, 'modulePath' | 'narration' | 'music' | 'sfx' | 'locale'>,
  timelineClips: AudioClip[],
): Promise<AudioClip[]> {
  const { timingPathFor } = await import('./captions.js');
  const audioClips = [...timelineClips];
  const { bedAlreadyReferenced, buildMusicClip, buildNarrationClips, musicPathFor } = await import('./music.js');

  // narration: the voice itself (0.14: prefer the locale-tagged narration sibling)
  if ((opts.narration ?? 'auto') === 'auto') {
    const narrationPath = timingPathFor(opts.modulePath, opts.locale);
    if (narrationPath) {
      const voice = buildNarrationClips(narrationPath);
      if (voice) {
        const wired = voice.clips.some((c) => bedAlreadyReferenced(audioClips, c.asset.url, opts.modulePath));
        if (wired) {
          process.stderr.write('note: narration already in the timeline audio — auto-mix skipped\n');
        } else {
          audioClips.push(...voice.clips);
          process.stderr.write(`note: auto-mixing ${voice.note}\n`);
        }
      }
    }
  }

  // music: the bed, auto-ducked under the narration windows
  if ((opts.music ?? 'auto') === 'auto') {
    const musicPath = musicPathFor(opts.modulePath);
    if (musicPath) {
      const bed = buildMusicClip(musicPath, timingPathFor(opts.modulePath, opts.locale));
      if (bed) {
        if (bedAlreadyReferenced(audioClips, bed.clip.asset.url, opts.modulePath)) {
          process.stderr.write('note: music bed already in the timeline audio — auto-mix skipped\n');
        } else {
          audioClips.push(bed.clip);
          process.stderr.write(`note: auto-mixing ${bed.note}\n`);
        }
      }
    }
  }

  // sfx: effect hits from a sibling *.sfx.timing.json (gs sfx prepare step)
  if ((opts.sfx ?? 'auto') === 'auto') {
    const { buildSfxClipsFromTiming, sfxTimingPathFor } = await import('./sfx.js');
    const sfxPath = sfxTimingPathFor(opts.modulePath);
    if (sfxPath) {
      const fx = buildSfxClipsFromTiming(sfxPath);
      if (fx) {
        const wired = fx.clips.some((c) => bedAlreadyReferenced(audioClips, c.asset.url, opts.modulePath));
        if (wired) {
          process.stderr.write('note: sfx already in the timeline audio — auto-mix skipped\n');
        } else {
          audioClips.push(...fx.clips);
          process.stderr.write(`note: auto-mixing ${fx.note}\n`);
        }
      }
    }
  }

  return audioClips;
}

/**
 * Resolve the ACTUAL audio files that feed the final mix (timeline clips +
 * auto-mixed narration/music/sfx), as absolute paths. This is what the mixHash
 * must hash the BYTES of: editing a timeline `.wav` or a music stem in place leaves
 * the timing manifests unchanged, so without folding these bytes a stale publish
 * gain would be applied silently. Reuses `collectAudioClips` (the same gather the
 * mix itself uses), then resolves each clip asset URL. De-duplicated + sorted so
 * measure-time and render-time agree regardless of clip order. `timelineClips` is
 * the scene's compiled timeline audio; when omitted it is compiled from the module
 * (so measure-time and the bare-gate path see the SAME timeline clips render does).
 * A module that can't load (e.g. a unit-test stub path) falls back to no timeline
 * clips — the narration/music/sfx siblings still resolve from `modulePath`.
 */
export async function collectMixAudioInputs(
  opts: Pick<RenderOptions, 'modulePath' | 'narration' | 'music' | 'sfx'>,
  timelineClips?: AudioClip[],
): Promise<string[]> {
  let tl = timelineClips;
  if (tl === undefined) {
    try {
      const mod = await loadSceneModule(opts.modulePath);
      const { compileTimeline } = await import('@glissade/core');
      tl = [...compileTimeline(mod.timeline).audio];
    } catch {
      tl = [];
    }
  }
  const clips = await collectAudioClips(opts, tl);
  const { resolveAssetPath } = await import('./audioMix.js');
  const paths = new Set<string>();
  for (const c of clips) {
    try {
      paths.add(resolveAssetPath(c.asset.url, opts.modulePath));
    } catch {
      // a remote/unsupported url can't be byte-hashed locally — fold its url
      // string so a change to the reference still invalidates the measurement.
      paths.add(c.asset.url);
    }
  }
  return [...paths].sort();
}

/**
 * Resolve the committed publish gain (dB) for a render: read `<scene>.loudness.json`
 * (when present and `loudness !== 'off'`), recompute the mixHash over the current
 * mix inputs, and HARD-THROW on a mismatch — a re-narrate/re-sfx must invalidate
 * the measurement loudly rather than silently mis-normalize. Returns null when no
 * measurement is committed or loudness is off (no gain applied).
 *
 * The mixHash folds the BYTES of the actual mix audio inputs (timeline clips +
 * narration/music/sfx) — not just the timing manifests — so an in-place edit of a
 * `.wav`/music stem invalidates the measurement here too (the §5.3 stale-gain
 * gate). `timelineClips` defaults to the scene's compiled timeline audio when
 * omitted, so a bare `{ modulePath }` call still gates correctly.
 */
export async function resolveLoudnessGainDb(
  opts: Pick<RenderOptions, 'modulePath' | 'loudness' | 'narration' | 'music' | 'sfx'>,
  timelineClips?: AudioClip[],
): Promise<number | null> {
  if ((opts.loudness ?? 'auto') === 'off') return null;
  const { readLoudness, computeMixHash, loudnessPathFor } = await import('./loudness.js');
  const measurement = readLoudness(opts.modulePath);
  if (!measurement) return null;
  const extraInputs = await collectMixAudioInputs(opts, timelineClips);
  const actual = computeMixHash(opts.modulePath, extraInputs);
  if (actual !== measurement.mixHash) {
    throw new Error(
      `loudness: ${loudnessPathFor(opts.modulePath)} is stale — the mix inputs changed since it was measured ` +
        `(committed mixHash ${measurement.mixHash.slice(0, 23)}…, current ${actual.slice(0, 23)}…). ` +
        `Re-run \`gs measure-loudness ${opts.modulePath}\` (or pass --loudness off to render without normalization).`,
    );
  }
  return measurement.gain;
}

/**
 * Collect audio clips + auto-mixed siblings and plan the FFmpeg audio graph,
 * returning the `-i`/`-filter_complex`/`-map` argument fragments. Shared by the
 * linear `render()` path and the sharded orchestrator (which mixes audio once,
 * over the concatenated video). Returns empty args when there is nothing to mix.
 *
 * When a committed `<scene>.loudness.json` applies, its publish gain is appended
 * as a PURE `volume=<gain>dB` scalar on the FINAL mix node — a single scalar in
 * the existing graph, NOT a second pass. The scalar gain is bit-deterministic
 * (verified) and golden-hashable; the only non-deterministic stages (mix-to-PCM,
 * measure-time ebur128) are quarantined to commit/measure-time per §5.3.
 *
 * (Note: `collectMixAudioInputs` resolves auto-mixed narration/music/sfx siblings
 * from `modulePath`, so a `timelineClips: []` default still gates those.)
 */
export async function planFinalAudio(
  opts: RenderOptions,
  timelineClips: AudioClip[],
  duration: number,
  container: 'mp4' | 'webm',
): Promise<{ audioInputs: string[]; audioArgs: string[] }> {
  const audioClips = await collectAudioClips(opts, timelineClips);

  const { planAudioMix, applyMixGainDb } = await import('./audioMix.js');
  const { pickEncoder } = await import('./encoders.js');
  const mix = planAudioMix(audioClips, opts.modulePath, duration);
  if (mix?.hasEasedGain) {
    process.stderr.write('note: eased gain keys are approximated linearly in the FFmpeg mix\n');
  }
  if (!mix) return { audioInputs: [], audioArgs: [] };

  const gainDb = await resolveLoudnessGainDb(opts, timelineClips);
  const filterComplex = gainDb !== null ? applyMixGainDb(mix.filterComplex, gainDb) : mix.filterComplex;
  if (gainDb !== null) {
    process.stderr.write(`note: applying committed publish loudness gain ${gainDb.toFixed(2)} dB (single-pass scalar)\n`);
  }

  const audioEnc = pickEncoder('audio', container);
  return {
    audioInputs: mix.inputs.flatMap((p) => ['-i', p]),
    audioArgs: [
      '-filter_complex', filterComplex,
      '-map', '0:v', '-map', '[aout]',
      '-c:a', audioEnc.name,
      ...(container === 'mp4' ? ['-b:a', '192k'] : []),
    ],
  };
}

/**
 * Build the FINAL mixed audio to a WAV file — the measure-loudness input. Uses
 * the SAME `collectAudioClips` + `planAudioMix` as the render path (no loudness
 * gain — measurement is of the un-gained mix), so the measured content is exactly
 * what render will later mix. Returns false when the scene has no audio.
 */
export async function buildMixWav(
  opts: Pick<RenderOptions, 'modulePath' | 'narration' | 'music' | 'sfx'>,
  wavOut: string,
): Promise<boolean> {
  if (!ffmpegAvailable()) {
    throw new Error('gs measure-loudness needs FFmpeg on PATH and none was found.');
  }
  const mod = await loadSceneModule(opts.modulePath);
  const scene = mod.createScene();
  const { compileTimeline } = await import('@glissade/core');
  const compiled = compileTimeline(mod.timeline);
  const duration = compiled.duration;

  const audioClips = await collectAudioClips(opts, [...compiled.audio]);
  const { planAudioMix } = await import('./audioMix.js');
  const mix = planAudioMix(audioClips, opts.modulePath, duration);
  if (!mix) return false;

  // `planAudioMix` indexes audio inputs as [1:a], [2:a], … because the render
  // path puts the PNG video at input 0. There's no video here, so a throwaway
  // `anullsrc` at input 0 keeps the audio indices aligned (we only map [aout],
  // so the dummy is discarded). The mix renders to 16-bit PCM (the same
  // float→Int16 quantize §5.3 / renderSfxr golden-hash) at 48 kHz.
  const args = [
    '-y', '-hide_banner', '-nostats',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    ...mix.inputs.flatMap((p) => ['-i', p]),
    '-filter_complex', mix.filterComplex,
    '-map', '[aout]',
    '-c:a', 'pcm_s16le', '-ar', '48000',
    '-t', String(duration),
    wavOut,
  ];
  const result = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`ffmpeg mix-to-WAV failed (exit ${result.status}):\n${result.stderr?.toString().slice(-2000)}`);
  }
  // touch `scene` so the load-and-validate is part of the measure path
  void scene.size;
  return true;
}
