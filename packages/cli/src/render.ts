/**
 * gs render (DESIGN.md §5.1d, §5.7): load a scene module, evaluate each frame,
 * rasterize on Skia, write a PNG sequence — and mux to mp4/webm via FFmpeg
 * when requested and available. No browser anywhere.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync, renameSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { glissadeVersion } from './version.js';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createJiti } from 'jiti';
import { buildFontRegistry, type AudioClip } from '@glissade/core';
import { evaluate, withDeterminismGuards, type DisplayList, type SceneModule } from '@glissade/scene';
import { validateSceneFonts, collectLocalizedTextUsages, locateViolation } from '@glissade/scene/diagnostics';
import { readRenderManifest, writeRenderManifest, frameKeyDigest, canRemux } from './renderManifest.js';
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
   * --incremental (§8.1, 0.41 dirty-beat): re-render ONLY the frames whose per-frame
   * content key changed since the last render, splicing the unchanged runs verbatim
   * out of a retained FFV1 lossless intermediate. Kills the full re-render an edit
   * that shifts timing (move one beat) otherwise forces — every downstream frame's
   * DisplayList shifts, defeating both the whole-frame cache and the remux fast path.
   * Implies the lossless-intermediate pipeline (FFV1 → single final encode); a warm
   * splice is byte-identical to a cold `--incremental` render by construction. Video
   * output only; requires the per-frame key (folds the same context the cache uses).
   */
  incremental?: boolean;
  /**
   * --allow-gpu-shards (§5.6): sharded GPU/shader output isn't reproducible across
   * processes/machines, so a scene containing a ShaderEffect refuses to shard unless
   * this is set.
   */
  allowGpuShards?: boolean;
  /**
   * --preview / --final (0.71 two-tier): the ENCODE tier. 'final' (the default when
   * neither flag is passed) is the byte-exact production encode — bytes are identical
   * to pre-0.71. 'preview' produces a watchable DRAFT: the SAME rasterized frames
   * (crf is not in the frame-key digest, so a preview reuses the final's frame cache
   * — no re-raster), encoded at a higher crf for a faster/lighter h264. The tier is
   * isolated at the encode-artifact layer (renderManifest.videoQuality) so a preview
   * never remux-serves a --final request or vice versa.
   */
  tier?: 'preview' | 'final';
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
   * --certify (0.62): emit the per-frame determinism certificate manifest
   * (`<out>.cert.json`) + the audio-cert, and (when a cert cache is enabled)
   * populate the content-addressed render cache. Additive READ — the render path
   * is byte-identical to a non-certified render (the cert reads the bytes, never
   * alters them). Off by default.
   */
  certify?: boolean;
  /**
   * --cert-cache [<dir>] (0.62): the LOCAL content-addressed render cache keyed by
   * certHash (a PURE fn of inputs — computed WITHOUT rendering). Per-frame: a HIT
   * serves the pinned artifact bytes (SKIPS evaluate+render), a MISS renders +
   * stores {bytes, byteHash}. A HIT is byte-identical to a cold render (certHash
   * captures every byte-determinant). Distinct from `--cache` (the §3.5 RGBA cache
   * keyed by the post-evaluate DisplayList). Off by default.
   */
  certCache?: { dir: string; mode: import('./cert.js').CertCacheMode };
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
 * Per-encoder ENCODE-quality flags for the byte-exact --final (default) tier: crf
 * (x264/vpx), bitrate (openh264), q:v (mpeg4). These are the historical values —
 * the default path is byte-identical to pre-0.71.
 */
const FINAL_VIDEO_QUALITY: Record<string, string[]> = {
  'libx264': ['-crf', '18'],
  'libvpx-vp9': ['-b:v', '0', '-crf', '32'],
  'libvpx': ['-b:v', '2M'],
  'libopenh264': ['-b:v', '4M'],
  'mpeg4': ['-q:v', '3'],
};

/**
 * 0.71 --preview draft overrides: a higher crf → a lighter/faster encode of the
 * SAME frames. Only the crf-family encoders get a draft point; encoders not listed
 * fall back to the final quality (their preview == final, which is fine — identical
 * params legitimately produce identical bytes, so the tiers may share a remux).
 */
const PREVIEW_VIDEO_QUALITY: Record<string, string[]> = {
  'libx264': ['-crf', '30'],
  'libvpx-vp9': ['-b:v', '0', '-crf', '40'],
};

/**
 * Resolve the ffmpeg encode-quality args for an encoder + tier. Pure. crf is an
 * ENCODE param only — it changes the compressed bytes, never the rasterized frames
 * (which is why it is NOT folded into the frame-key digest and a preview can reuse
 * a final's frame cache). The joined string of these args is the manifest
 * `videoQuality` that isolates the tiers in canRemux.
 */
export function videoQualityArgs(encName: string, tier: 'preview' | 'final'): string[] {
  if (tier === 'preview') {
    const draft = PREVIEW_VIDEO_QUALITY[encName];
    if (draft) return draft;
  }
  return FINAL_VIDEO_QUALITY[encName] ?? [];
}

/** The manifest `videoQuality` string for an encoder + tier (isolates tiers in canRemux). */
export function videoQualityKey(encName: string, tier: 'preview' | 'final'): string {
  return videoQualityArgs(encName, tier).join(' ');
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
 *
 * 0.15 FIX 5 (osFamilies brand-warn gap): when an OS family name COLLIDES with a
 * family glissade actually registered from `doc.assets`, the OS-catalog fold must
 * NOT re-add it as an "OS-only" exemption — a registered family is a declared
 * brand font that must stay subject to glyph-coverage validation, not be waved
 * through as a system family. We therefore skip any osCatalog entry that collides
 * with a registered family (the `registered` seed already carries it, and core's
 * `validateFonts` runs coverage for registered families regardless of exemption).
 * The exemption is for GENUINELY-OS-only families, never registered ones that
 * happen to share a name.
 */
export function buildFontExemptSet(
  registered: ReadonlySet<string>,
  opts: { allowSystemFonts: boolean; strict: boolean; osCatalog: ReadonlySet<string> },
): ReadonlySet<string> {
  const exempt = new Set<string>(registered);
  if (opts.allowSystemFonts && !opts.strict) {
    // 0.15 FIX 5: a registered/declared family that name-collides with an OS family
    // is NOT folded in as an OS exemption — it stays a brand font under validation.
    for (const f of opts.osCatalog) if (!registered.has(f)) exempt.add(f);
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
 *
 * 0.15 FIX 2: a per-locale loudness dead-end (no `<stem>.<locale>.loudness.json`
 * committed) also aborts the batch — but a bare error mid-fan-out reads like a
 * generic crash, so each per-locale failure is wrapped to NAME the failing locale.
 * It still fails loudly (never swallowed): the wrapped message stays actionable.
 */
export async function renderLocales(
  opts: Omit<RenderOptions, 'locale'>,
  locales: readonly string[],
): Promise<{ locale: string; result: { frames: number; out: string } }[]> {
  const results: { locale: string; result: { frames: number; out: string } }[] = [];
  for (const locale of locales) {
    let result: { frames: number; out: string };
    try {
      result = await render({
        ...opts,
        out: localeOutPath(opts.out, locale, opts.format),
        locale,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // a per-locale dead-end (loudness/assets) mustn't read like a generic batch
      // crash. The 0.14 UnknownLocaleError and the FIX 2 loudness error already
      // NAME the locale, so rethrow those as-is (preserving the type). Only wrap an
      // error that DOESN'T already mention the locale, so it stays actionable.
      if (err instanceof Error && msg.includes(`'${locale}'`)) throw err;
      throw new Error(`--locales: locale '${locale}' failed — ${msg}`, { cause: err });
    }
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

/**
 * Resolve the `@glissade/core` version the SCENE will bind to (anchored at the
 * scene's own directory, so it's the copy in the user's project), by resolving
 * core's entry and walking up to its package root — `@glissade/core/package.json`
 * isn't an exported subpath, so it can't be required directly. Returns undefined
 * if it can't be resolved (an unusual layout) — the caller then skips the check.
 */
function resolveSceneCoreVersion(scenePath: string): string | undefined {
  try {
    const require = createRequire(pathToFileURL(scenePath));
    let dir = dirname(require.resolve('@glissade/core'));
    for (let i = 0; i < 8; i++) {
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string; version?: string };
        if (pkg.name === '@glissade/core') return pkg.version;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // unresolvable (exports quirk / odd hoist) — never block a render on the diagnostic
  }
  return undefined;
}

/**
 * Warn (once, loudly) on a `@glissade/*` version SKEW between the running `gs`
 * (cli) and the `@glissade/core` the scene resolves. glissade is lockstep, and
 * the subpath side-effect registries (`/expr`'s sampler, Yoga `layout`) register
 * per-package-INSTANCE — so under a skew a correctly-imported `@glissade/core/expr`
 * or `layout` still fails with a misleading "expr tracks need import …" / "no
 * LayoutEngine registered". Naming the skew up front turns a confusing failure
 * into an actionable one. A warning, never a throw: legitimate edge layouts exist,
 * and the check must never break a render (video-canary 0.41 adopt finding).
 */
function warnOnVersionSkew(scenePath: string): void {
  const cliVer = glissadeVersion();
  if (cliVer === '0.0.0') return; // unresolved/source dev — no meaningful comparison
  const coreVer = resolveSceneCoreVersion(scenePath);
  if (coreVer === undefined || coreVer === cliVer) return;
  process.stderr.write(
    `warning: @glissade version skew — gs (@glissade/cli@${cliVer}) is rendering a scene that resolves ` +
      `@glissade/core@${coreVer}.\n` +
      `  glissade is LOCKSTEP: subpath features register per-package-instance (the /expr sampler, Yoga layout), so ` +
      `under a skew a\n  correctly-imported '@glissade/core/expr' or 'layout' can still fail with "need import" / ` +
      `"no LayoutEngine registered".\n` +
      `  Align every @glissade/* dependency to ${cliVer} (e.g. npm i @glissade/core@${cliVer} @glissade/scene@${cliVer}).\n`,
  );
}

export async function loadSceneModule(
  modulePath: string,
  locale?: string,
  messageTableOverride?: import('@glissade/core/i18n').MessageTable,
): Promise<SceneModule> {
  // 0.14 localization core: install the ambient message table BEFORE the module
  // is imported — `t('id')` runs at module-eval / createScene() time, so the
  // table must be set first. No --locale leaves the ambient table unset, so
  // `t(id)` returns `id` verbatim → the base path is byte-identical to today.
  // 0.42: a caller (gs localize's id-harvest) may inject a recording table override.
  const { setMessageTable } = await import('@glissade/core/i18n');
  if (messageTableOverride !== undefined) {
    setMessageTable(messageTableOverride);
  } else if (locale !== undefined && locale !== '') {
    const { loadMessageTable } = await import('./locale.js');
    setMessageTable(loadMessageTable(modulePath, locale));
  } else {
    setMessageTable(undefined);
  }

  const abs = isAbsolute(modulePath) ? modulePath : resolve(process.cwd(), modulePath);
  // pre-flight the path so a typo'd module fails with ONE clean line instead of
  // Node's module-not-found + a phantom `_index.js` require stack. jiti resolves
  // ESM-style `.js` specifiers to `.ts` sources (and extensionless paths), so
  // accept any variant that exists on disk.
  const candidates = [abs, abs.replace(/\.js$/, '.ts'), abs.replace(/\.ts$/, '.js'), `${abs}.ts`, `${abs}.js`];
  if (!candidates.some((c) => existsSync(c))) {
    throw new SceneModuleError(modulePath, 'scene module not found (check the path)');
  }
  // Surface a version skew (cli vs the scene's @glissade/core) BEFORE evaluate, so a
  // dual-package registry miss reads as "align versions" not a phantom "need import".
  warnOnVersionSkew(candidates.find((c) => existsSync(c)) ?? abs);
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

/** What `prepareSkiaRenderEnv` needs to make a Skia render FAITHFUL (fonts+axes,
 *  Yoga, assets) — the setup that `gs render` and any parity/preview render must
 *  share so a headless render is byte-faithful to `gs render` by construction. */
export interface PrepareRenderEnvOptions {
  scene: ReturnType<SceneModule['createScene']>;
  /** the (localized/resolved) render document — its `assets` drive font/media loading. */
  doc: import('@glissade/core').Timeline;
  /** the backend the scene will draw into (image/video assets are bound to it). */
  backend: SkiaBackend;
  /** module path for resolving relative asset URLs. */
  modulePath: string;
  /** --strict: throw on an unregistered family / uncovered glyph (default dev-warn). */
  strictFonts?: boolean;
  /** --allow-system-fonts: exempt the true-OS catalog from the unregistered-family check. */
  allowSystemFonts?: boolean;
  /** active locale (drives the post-localize font validation of string-track values). */
  locale?: string;
}

/** The side-data `render()` needs downstream after the environment is prepared. */
export interface SkiaRenderEnv {
  /** sha256 of every referenced font/image/video asset's bytes (folds into the cache key). */
  assetDigests: Map<string, string>;
  /** opened video frame sources — the caller MUST close these when done. */
  videoSources: import('./videoSource.js').FfmpegVideoFrameSource[];
  /** families glissade actually registered from `doc.assets` (case-folded). */
  registeredFamilies: Set<string>;
}

/**
 * Prepare the Skia render environment so `evaluate(scene, doc, t)` → `backend.render`
 * is FAITHFUL: line-break measurer, Yoga (flexbox scenes), font faces registered
 * under their families (variable-font axes included, so `fontAxes` reaches the
 * glyphs), font validation, and image/video asset decode bound to the backend.
 *
 * This is the SINGLE SOURCE OF TRUTH for render setup — `gs render` AND `gs parity`
 * both call it, so a parity render cannot silently diverge from a real render (e.g.
 * report a false-perfect SSIM on a variable-font scene by rendering BOTH legs at the
 * default weight because neither registered the face). Extracted verbatim from the
 * `render()` body; the ordering (yoga → asset-validate → font-register → validate →
 * asset-decode) is preserved so `gs render` stays byte-identical.
 */
export async function prepareSkiaRenderEnv(o: PrepareRenderEnvOptions): Promise<SkiaRenderEnv> {
  const { scene, doc, backend, modulePath } = o;
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
      const path = resolveAsset(face.url, modulePath);
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
  const includeOsCatalog = !!o.allowSystemFonts && !o.strictFonts;
  const osCatalog = includeOsCatalog
    ? new Set<string>(
        (await import('@napi-rs/canvas')).GlobalFonts.families.map((f) => f.family.toLowerCase()),
      )
    : new Set<string>();
  const osFamilies = buildFontExemptSet(registeredFamilies, {
    allowSystemFonts: !!o.allowSystemFonts,
    strict: !!o.strictFonts,
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
    o.locale !== undefined && o.locale !== ''
      ? collectLocalizedTextUsages(scene, doc)
      : [];
  await validateSceneFonts(
    scene,
    doc,
    async (url) => {
      try {
        const buf = await readFile(resolveAsset(url, modulePath));
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      } catch {
        return undefined;
      }
    },
    { mode: o.strictFonts ? 'strict' : 'dev', osFamilies, extraUsages: localizedUsages },
  );

  for (const [assetId, ref] of Object.entries(doc.assets ?? {})) {
    if (ref.kind === 'font') {
      // faces already registered above
    } else if (ref.kind === 'image') {
      const { loadImage } = await import('@napi-rs/canvas');
      if (ref.url.startsWith('data:')) {
        // Inline base64 image (a Lottie mesh raster round-trips as `data:image/png;
        // base64,…`). resolveAssetPath would treat `data:` as a file path and fail;
        // decode the payload to a Buffer and hand it straight to loadImage instead.
        const b64 = ref.url.slice(ref.url.indexOf(',') + 1);
        const buf = Buffer.from(b64, 'base64');
        assetDigests.set(`image:${assetId}`, digestBytes(buf));
        backend.setImageAsset(assetId, await loadImage(buf));
      } else {
        const imgPath = resolveAsset(ref.url, modulePath);
        assetDigests.set(`image:${assetId}`, digestBytes(await readFile(imgPath)));
        backend.setImageAsset(assetId, await loadImage(imgPath));
      }
    } else if (ref.kind === 'video') {
      if (!ffmpegAvailable()) {
        throw new Error(`video asset '${assetId}' needs FFmpeg on PATH for frame extraction (§5.4)`);
      }
      const { FfmpegVideoFrameSource } = await import('./videoSource.js');
      const videoPath = resolveAsset(ref.url, modulePath);
      assetDigests.set(`video:${assetId}`, digestBytes(await readFile(videoPath)));
      const source = new FfmpegVideoFrameSource(videoPath);
      await source.warm(0, source.duration); // v1: whole-source warm, trivially correct
      backend.setVideoAsset(assetId, source);
      videoSources.push(source);
    }
  }

  return { assetDigests, videoSources, registeredFamilies };
}

/**
 * 0.63.2 pre.1 — the DRAWN-FONT pre-pass that feeds the cert `complete` flag.
 *
 * Evaluates the EXACT certified frame grid (`firstFrame..lastFrame` at `t=i/fps` —
 * the SAME frames the cert cache keys) and collects the font family of every
 * `fillText` the render actually DRAWS (lower-cased, to match `registeredFamilies`'
 * case-folding). This is the eval-time truth, so it catches STATIC text AND
 * TRACK-DRIVEN captions — a captionNode whose `text` is empty at construction but
 * populated by a `Track<string>` at eval time, which a construction-time scene-walk
 * would MISS (→ empty fontDigest + `complete:true` for a text-drawing scene = the
 * silent false-HIT this fix closes). It scans the FULL certified range (never a
 * subset — a caption that draws only in an unsampled frame would under-mark → a
 * false-HIT, the catastrophic direction).
 *
 * RENDER-NEUTRAL: `evaluate(scene, doc, t)` is a PURE function of time (the
 * determinism contract) — this pre-pass only reads DisplayLists, never touches the
 * backend, so re-evaluating the same frames in the render loop afterward yields
 * byte-identical bytes (the 415 goldens + the render-neutrality test prove it). Runs
 * under the SAME determinism guards as the render loop. Early-exits the instant a
 * drawn family is NOT registered (`complete` is already decidably false) — a pure,
 * deterministic optimization (the completeness verdict is order-independent).
 */
function collectDrawnFontFamilies(
  scene: ReturnType<SceneModule['createScene']>,
  doc: import('@glissade/core').Timeline,
  fps: number,
  firstFrame: number,
  lastFrame: number,
  registeredFamilies: ReadonlySet<string>,
): Set<string> {
  const drawn = new Set<string>();
  for (let f = firstFrame; f <= lastFrame; f++) {
    const dl = withDeterminismGuards('throw', () => evaluate(scene, doc, f / fps));
    for (const cmd of dl.commands) {
      if (cmd.op !== 'fillText') continue;
      const family = cmd.font.family.toLowerCase();
      drawn.add(family);
      // already incomplete → the verdict can't change; stop (deterministic).
      if (!registeredFamilies.has(family)) return drawn;
    }
  }
  return drawn;
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

  // DEV diagnostic (§5.5, card knEFdGXC99rw): evaluate under the determinism
  // guards, and on a violation name the FIRST node whose cold re-eval disagrees
  // (via the shipped `auditCacheCold` locator) so the throw is click-to-line
  // instead of a hand-bisect across the episode. The locator is ONLY invoked on
  // the throw branch — a clean render never re-evaluates, paying nothing. Reads
  // `doc` at call time so a later document override (captions/localize) is what
  // the locator re-evaluates too.
  const guardedEval = (t: number): DisplayList =>
    withDeterminismGuards('throw', () => evaluate(scene, doc, t), () => locateViolation(mod.createScene, doc, t));

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
  // a range past the timeline end renders the frozen last frame per extra frame —
  // legit as freeze-tail padding, but usually a typo'd range, so say so loudly.
  const lastTimelineFrame = Math.max(0, Math.ceil(duration * fps) - 1);
  if (lastFrame > lastTimelineFrame) {
    process.stderr.write(
      `warning: frame range ends at ${lastFrame} but the timeline ends at frame ${lastTimelineFrame} ` +
        `(${duration}s @ ${fps}fps) — the ${lastFrame - lastTimelineFrame} extra frame(s) repeat the frozen last frame\n`,
    );
  }

  // --format png-seq forces a PNG sequence even if `out` looks like a video name
  const isVideo = opts.format !== 'png-seq' && /\.(mp4|webm)$/i.test(opts.out);
  // a single frame to a *.png path writes THAT one file, not a directory of frames
  const singleFile = !isVideo && total === 1 && /\.png$/i.test(opts.out);
  // multiple frames can't land in one .png — that used to silently mkdir 'foo.png/'
  if (!isVideo && !singleFile && total > 1 && /\.png$/i.test(opts.out)) {
    throw new Error(
      `--out '${opts.out}' is a .png path but the render covers ${total} frames — ` +
        'pass --frame <n> for one still, or use a directory / .mp4 out',
    );
  }
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
  // Prepare the faithful Skia render environment (measurer, Yoga, font faces incl.
  // variable-font axes, font validation, image/video decode). SHARED with gs parity
  // via prepareSkiaRenderEnv so a parity render can't drift from a real render.
  const { assetDigests, videoSources, registeredFamilies } = await prepareSkiaRenderEnv({
    scene,
    doc,
    backend,
    modulePath: opts.modulePath,
    ...(opts.strictFonts !== undefined ? { strictFonts: opts.strictFonts } : {}),
    ...(opts.allowSystemFonts !== undefined ? { allowSystemFonts: opts.allowSystemFonts } : {}),
    ...(opts.locale !== undefined ? { locale: opts.locale } : {}),
  });
  // §3.5 persistent whole-frame raster cache (opt-in; default 'off' = baseline).
  // The key folds the DisplayList-snapshot bytes + the glissade version + the
  // backend caps id (the INJECTED CacheKeyContext — components with no source in
  // `scene`). A HIT loads the stored RGBA back into the SAME backend (putPixels)
  // and runs the IDENTICAL encodePng, so it is byte-identical to a cold render.
  let frameCache: import('./frameCache.js').FrameCache | undefined;
  let keyCtx: import('./frameCache.js').CacheKeyContext | undefined;
  const cacheOn = !!(opts.cache && opts.cache.mode !== 'off');
  // The per-frame key powers BOTH the cache and 0.41 incremental's diff, so build
  // keyCtx whenever either is active (incremental doesn't need the raster cache).
  if (cacheOn || opts.incremental) {
    const { capsId, combineAssetDigests } = await import('./frameCache.js');
    const version = glissadeVersion();
    const caps = capsId(backend.caps);
    keyCtx = {
      version,
      capsId: caps,
      // fold the BYTES of every referenced image/video/font so an in-place asset
      // edit (same id/url) invalidates the key instead of serving stale pixels.
      assetsDigest: combineAssetDigests(assetDigests),
    };
  }
  if (cacheOn) {
    const { FrameCache } = await import('./frameCache.js');
    frameCache = new FrameCache({
      dir: opts.cache!.dir,
      mode: opts.cache!.mode,
      ...(opts.cache!.maxSize !== undefined ? { maxSize: opts.cache!.maxSize } : {}),
    });
    const version = keyCtx!.version;
    const caps = keyCtx!.capsId;
    // §3.5 disk layer-cache tier: persist cache:true group rasters across renders
    // so an expensive static subtree survives a re-narration (which flips the
    // whole-frame key but leaves the backdrop's sub-DisplayList untouched). Salt
    // the compositor's layer key with version ⊕ caps ⊕ frame size.
    const { LayerCache } = await import('./layerCache.js');
    backend.setLayerStore(
      new LayerCache({
        dir: join(opts.cache!.dir, 'layers'),
        mode: opts.cache!.mode,
        salt: `${version}|${caps}|${scene.size.w}x${scene.size.h}`,
      }),
    );
  }

  // ── 0.62 determinism CERTIFY + content-addressed render cache (opt-in) ────
  // Additive READ: build the frame-INDEPENDENT video-cert base ONCE, then per
  // frame compute certHash (PURE fn of inputs — no render). With a cert cache: a
  // HIT serves pinned bytes (skips evaluate+render); a MISS renders + stores. The
  // render bytes are UNCHANGED vs a non-certified render. certActive=false → the
  // exact current baseline (goldens byte-identical).
  const certActive = !!(opts.certify || (opts.certCache && opts.certCache.mode !== 'off'));
  let certBase: import('./cert.js').VideoCertBase | undefined;
  let certCache: import('./cert.js').CertCache | undefined;
  const frameCerts: import('./cert.js').FrameCertRecord[] = [];
  if (certActive) {
    const cert = await import('./cert.js');
    const { capsId } = await import('./frameCache.js');
    // 0.63.2 pre.1: the DL-sample pre-pass over the certified grid — resolves the
    // fonts the render actually DRAWS (static + track-driven captions) so `complete`
    // is truthful. Render-neutral (a pure eval read); runs before the frame loop
    // because `complete` gates the per-frame cache decision inside it.
    const drawnFontFamilies = collectDrawnFontFamilies(scene, doc, fps, firstFrame, lastFrame, registeredFamilies);
    certBase = await cert.buildVideoCertBase({
      scene,
      doc,
      assetDigests,
      registeredFamilies,
      drawnFontFamilies,
      capsId: capsId(backend.caps),
      captionBurnMode: captionsMode,
      narrationTimingPath: timingPathFor(opts.modulePath, opts.locale),
      renderConfig: {
        width: scene.size.w,
        height: scene.size.h,
        pixelFormat: 'rgba8-straight',
        imageSmoothing: true,
      },
      root: process.cwd(),
    });
    if (opts.certCache && opts.certCache.mode !== 'off') {
      certCache = new cert.CertCache(opts.certCache);
    }
  }

  // ── 0.27 audio-only REMUX fast path (video + cache) ──────────────────────
  // A prior render leaves a manifest of the ordered per-frame content-key digest
  // beside the output. A key-only pre-pass (evaluate + hash, NO raster) recomputes
  // it; if it matches and the encode params + output are unchanged, the video is
  // byte-identical — skip the frame loop and `-c:v copy` remux the new audio below.
  const tier: 'preview' | 'final' = opts.tier ?? 'final';
  let videoOut: { outAbs: string; container: 'mp4' | 'webm'; encName: string; encNote?: string; videoQuality: string } | undefined;
  let remuxDigest: string | undefined;
  let remuxKeys: string[] | undefined; // the pre-pass key vector (persisted so 0.41 incremental survives a remux)
  if (isVideo) {
    const outAbs = resolve(opts.out);
    const container: 'mp4' | 'webm' = /\.webm$/i.test(outAbs) ? 'webm' : 'mp4';
    const { pickEncoder } = await import('./encoders.js');
    const enc = pickEncoder('video', container);
    videoOut = { outAbs, container, encName: enc.name, videoQuality: videoQualityKey(enc.name, tier), ...(enc.note ? { encNote: enc.note } : {}) };
    // PREFLIGHT the stale-loudness guard (0.33): every input it reads exists at
    // t=0, but it used to first run inside planFinalAudio — AFTER the whole frame
    // loop — so a stale mixHash surfaced only after ~30 min of doomed rendering
    // (a consumer lost ~2.5 h across six episodes to exactly this). Resolve — and
    // throw — here, before frame 1; planFinalAudio re-resolves cheaply later.
    await resolveLoudnessGainDb(opts, [...compiled.audio]);
    if (frameCache && keyCtx && opts.cache!.mode !== 'off') {
      const prev = readRenderManifest(outAbs);
      if (prev && existsSync(outAbs)) {
        const { frameCacheKey } = await import('./frameCache.js');
        const keys: string[] = [];
        for (let f = firstFrame; f <= lastFrame; f++) {
          const dl = guardedEval(f / fps);
          keys.push(frameCacheKey(dl, keyCtx));
        }
        const digest = frameKeyDigest(keys);
        if (canRemux(prev, { frameKeyDigest: digest, container, videoCodec: enc.name, videoQuality: videoOut.videoQuality, fps, firstFrame, frames: total }, true)) {
          remuxDigest = digest;
          remuxKeys = keys;
        }
      }
    }
  }

  // 0.41 dirty-beat incremental: if the video didn't collapse to a pure audio-only
  // remux, hand off to the splice path — it re-renders only the changed frame runs
  // and reuses the retained FFV1 intermediate for the rest. Needs the per-frame key
  // (keyCtx) and a multi-frame video; a GPU/shader scene falls through (its output
  // isn't reproducible across the child-process boundary the splice renders in).
  if (opts.incremental && isVideo && !remuxDigest && keyCtx && total > 1 && videoOut) {
    const { sceneHasGpuNodes, renderIncremental } = await import('./shards.js');
    if (sceneHasGpuNodes(scene) && !opts.allowGpuShards) {
      process.stderr.write('note: --incremental skipped — scene has GPU/shader nodes (not reproducible across the splice child process); pass --allow-gpu-shards to override\n');
    } else {
      backend.dispose();
      for (const source of videoSources) source.close();
      return renderIncremental({
        opts, scene, doc, compiled, keyCtx, fps, duration, firstFrame, lastFrame,
        container: videoOut.container, timingPathFor, writeCaptionSidecars, writeCueSidecars,
      });
    }
  }

  const frameKeys: string[] = []; // per-frame content keys, collected for the manifest
  if (!remuxDigest) {
    const certMod = certActive ? await import('./cert.js') : undefined;
    for (let f = firstFrame; f <= lastFrame; f++) {
      let pngBytes: Buffer | undefined;
      // 0.62 cert-cache: certHash is PURE (no evaluate). A HIT serves pinned bytes
      // and SKIPS evaluate+render entirely — the lookup-before-you-spend property.
      // 0.63.2 SAFETY: an INCOMPLETE cert (certBase.complete === false — a font the
      // scene draws is not content-addressed) NEVER reads the cache. Its certHash
      // can collide across a font/system change (empty/partial fontDigest), so a
      // cache read could serve STALE bytes (a false-HIT). Skip get → always re-render.
      let certHash: string | undefined;
      if (certActive && certBase && certMod) {
        certHash = certMod.computeCertHash(certBase, certMod.frameKeyFor(f, fps));
        if (certBase.complete) {
          const hit = certCache?.get(certHash);
          if (hit) pngBytes = hit.bytes;
        }
      }
      if (pngBytes === undefined) {
        // §5.5: the CLI/CI export path rejects any wall-clock/random/timer call inside evaluate()
        const dl = guardedEval(f / fps);
        if (frameCache && keyCtx) {
          const { frameCacheKey } = await import('./frameCache.js');
          const key = frameCacheKey(dl, keyCtx);
          frameKeys.push(key);
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
      }
      // 0.62: record the per-frame cert + populate the content-addressed cache. The
      // byteHash IS the determinism carry keyed by cert (spot-audited by --verify-cache).
      if (certActive && certBase && certMod && certHash !== undefined) {
        // 0.63.2 SAFETY: an incomplete cert never WRITES the cache either — it must
        // not seed a future false-HIT. The per-frame record is still emitted (the
        // manifest documents the render; `complete:false` lives in the cert base).
        if (certBase.complete) certCache?.put(certHash, pngBytes);
        frameCerts.push({
          i: f,
          frameKey: certMod.frameKeyFor(f, fps),
          certHash,
          byteHash: certMod.byteHashOf(pngBytes),
        });
      }
      const file = singleFile ? resolve(opts.out) : join(framesDir, `frame-${String(f).padStart(5, '0')}.png`);
      writeFileSync(file, pngBytes);
      opts.onProgress?.(f - firstFrame + 1, total);
    }
  }
  backend.dispose();
  if (frameCache && !remuxDigest) {
    const s = frameCache.getStats();
    process.stderr.write(
      `cache (${opts.cache!.mode}): ${s.hits} hit${s.hits === 1 ? '' : 's'}, ${s.misses} miss${s.misses === 1 ? '' : 'es'}` +
        (s.stored ? `, ${s.stored} stored` : '') +
        (s.evicted ? `, ${s.evicted} evicted (LRU cap ${frameCache.maxSize} B)` : '') +
        ` → ${opts.cache!.dir}\n`,
    );
  }
  // the digest to record in the manifest (loop path only; remux reuses the prior)
  const newDigest = frameCache && !remuxDigest && frameKeys.length === total ? frameKeyDigest(frameKeys) : undefined;
  for (const source of videoSources) source.close();

  // 0.62 --certify: emit the per-frame video-cert manifest + the SEPARATE audio-cert
  // beside the output. The video-cert has NO audio determinant (invariant
  // video≠f(audio)); the audio-cert keys the audio artifact independently.
  if (certActive && opts.certify && certBase && frameCerts.length > 0) {
    const cert = await import('./cert.js');
    const manifest: import('./cert.js').VideoCertManifest = {
      certVersion: cert.CERT_VERSION,
      kind: 'video',
      fps,
      base: certBase,
      frames: frameCerts,
    };
    const manifestPath = cert.certManifestPathFor(resolve(opts.out));
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    // the audio-cert (per-stream split): narration audio + music + sfx + loudness,
    // NONE of which the video-cert depends on. Built from the sibling audio sidecars.
    const audioCert = await buildAudioCert(opts, compiled.audio ?? []);
    const audioPath = `${resolve(opts.out).replace(/\/$/, '')}.audio-cert.json`;
    writeFileSync(audioPath, `${JSON.stringify(audioCert, null, 2)}\n`);
    process.stderr.write(
      `certify: ${frameCerts.length} frame cert${frameCerts.length === 1 ? '' : 's'} → ${manifestPath}` +
        (certCache ? ` (cache: ${JSON.stringify(certCache.getStats())} → ${opts.certCache!.dir})` : '') +
        `\n`,
    );
  } else if (certCache && !opts.certify) {
    process.stderr.write(
      `cert-cache (${opts.certCache!.mode}): ${JSON.stringify(certCache.getStats())} → ${opts.certCache!.dir}\n`,
    );
  }

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

  const outAbs = videoOut!.outAbs;
  const container = videoOut!.container;
  mkdirSync(dirname(outAbs), { recursive: true });
  emitSidecars(outAbs);
  emitCues(outAbs);
  if (videoOut!.encNote) process.stderr.write(`note: ${videoOut!.encNote}\n`);

  // audio inputs follow input 0 in BOTH paths (frames-as-video, or the prior
  // video on remux), so the audio maps are identical — only the video source differs.
  const { audioInputs, audioArgs } = await planFinalAudio(opts, [...compiled.audio], duration, container);

  if (remuxDigest) {
    // REMUX FAST PATH: the video stream is byte-identical to the prior render
    // (matching frame-key digest), so copy it and mux ONLY the fresh audio. ffmpeg
    // can't write to its own input, so render to a sibling temp then atomically swap.
    const remuxArgs = [
      '-y',
      '-i', outAbs,
      ...audioInputs,
      ...audioArgs,
      '-map', '0:v:0',
      '-c:v', 'copy',
      ...(container === 'webm' ? [] : ['-movflags', '+faststart']),
      '-t', String(duration),
    ];
    const encodeDir = mkdtempSync(join(dirname(outAbs), '.gs-remux-'));
    const tmpOut = join(encodeDir, `out.${container}`);
    const result = spawnSync('ffmpeg', [...remuxArgs, tmpOut], { stdio: ['ignore', 'ignore', 'pipe'] });
    rmSync(framesDir, { recursive: true, force: true }); // created but unused on this path
    if (result.status !== 0) {
      rmSync(encodeDir, { recursive: true, force: true });
      throw new Error(`ffmpeg remux failed (exit ${result.status}):\n${result.stderr?.toString().slice(-2000)}`);
    }
    renameSync(tmpOut, outAbs);
    rmSync(encodeDir, { recursive: true, force: true });
    // manifest digest is unchanged (video is identical) — rewrite so mtime tracks
    writeRenderManifest(outAbs, {
      v: 1, frameKeyDigest: remuxDigest, container, videoCodec: videoOut!.encName, videoQuality: videoOut!.videoQuality, fps, firstFrame, frames: total,
      ...(remuxKeys && remuxKeys.length === total ? { frameKeys: remuxKeys } : {}),
    });
    process.stderr.write(`cache: ${total}/${total} frames unchanged (audio-only) — video copy + remux → ${outAbs}\n`);
    return { frames: total, out: outAbs };
  }

  // FULL ENCODE: quality flags are per-encoder + per-tier (crf x264/vpx, bitrate
  // openh264, q:v mpeg4). --final (default) keeps the historical values byte-for-byte;
  // --preview raises the crf for a lighter draft of the SAME frames.
  const codec = [
    '-c:v', videoOut!.encName,
    ...videoQualityArgs(videoOut!.encName, tier),
    ...(container === 'webm' ? [] : ['-pix_fmt', 'yuv420p', '-movflags', '+faststart']),
  ];
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
  // record the manifest so the next render of this output can remux (audio-only reuse)
  // or 0.41 dirty-beat incremental (frameKeys = the per-frame vector to diff against).
  if (newDigest) {
    writeRenderManifest(outAbs, {
      v: 1, frameKeyDigest: newDigest, container, videoCodec: videoOut!.encName, videoQuality: videoOut!.videoQuality, fps, firstFrame, frames: total,
      frameKeys,
    });
  }
  return { frames: total, out: outAbs };
}

/**
 * Build the SEPARATE audio-cert (the per-stream split): narration-audio + music +
 * sfx + loudness. NONE of these are in the video-cert — an audio-only re-master
 * busts THIS cert but leaves the video-cert (and its frame cache) untouched
 * (invariant `video ≠ f(audio)`, preserving the 0.27 remux win). Hashes the sibling
 * audio sidecars' bytes + the loudness mode + the compiled audio clip descriptors.
 */
async function buildAudioCert(
  opts: RenderOptions,
  audioClips: readonly AudioClip[],
): Promise<import('./cert.js').AudioCert> {
  const cert = await import('./cert.js');
  const stem = opts.modulePath.replace(/\.[jt]sx?$/, '');
  const sib = (suffix: string): string => cert.narrationTimingHash(`${stem}${suffix}`);
  // narration AUDIO artifact: hash the voice source-of-truth sidecar (the timing
  // manifest references the take). music/sfx: their sidecars. A change to any of
  // these moves the audio-cert only.
  const narrationAudioHash = cert.narrationTimingHash(
    opts.locale ? `${stem}.${opts.locale}.narration.timing.json` : `${stem}.narration.timing.json`,
  );
  const musicHash = sib('.music.timing.json');
  const sfxHash = sib('.sfx.timing.json');
  const loudness = `${opts.loudness ?? 'auto'}|${cert.narrationTimingHash(`${stem}.loudness.json`)}`;
  // fold the compiled clip descriptors so an in-doc audio edit (offset/gain) moves it too.
  const clipsDigest = cert.byteHashOf(Buffer.from(JSON.stringify(audioClips)));
  const base = { narrationAudioHash, musicHash, sfxHash, loudness: `${loudness}|clips:${clipsDigest}` };
  return {
    certVersion: cert.CERT_VERSION,
    kind: 'audio',
    ...base,
    certHash: cert.computeAudioCertHash(base),
  };
}

/** Options for `gs render --verify <cert>` / `--verify-cache`. */
export interface VerifyCertOptions {
  modulePath: string;
  /** the video-cert manifest path. */
  certPath: string;
  /** spot-audit: re-render at most N sampled frames (default: all). */
  sample?: number;
  locale?: string;
  strictFonts?: boolean;
  allowSystemFonts?: boolean;
}

export interface VerifyCertResult {
  checked: number;
  ok: number;
  /** frames whose re-render byteHash did NOT match the certified byteHash (a determinism break). */
  mismatches: { i: number; expected: string; got: string }[];
  /** true iff the re-derived video-cert base matches the manifest's base. */
  baseMatches: boolean;
}

/**
 * `gs render --verify <cert>` (self-verify = the determinism carry keyed by cert)
 * and `--verify-cache` (spot-audit a SAMPLE). Re-renders the certified frames from
 * the SAME scene inputs and asserts each re-render's byteHash matches the cert's —
 * a mismatch is a determinism break (the b4e6060006 alarm). Also re-derives the
 * video-cert base and confirms it reconciles with the manifest (an input drifted).
 */
export async function verifyCert(opts: VerifyCertOptions): Promise<VerifyCertResult> {
  const cert = await import('./cert.js');
  const manifest = cert.loadVideoCertManifest(opts.certPath);
  const fps = manifest.fps;

  const mod = await loadSceneModule(opts.modulePath, opts.locale);
  const scene = mod.createScene();
  const { resolveRenderDoc } = await import('./machines.js');
  let doc = resolveRenderDoc(mod, scene, {});
  if (opts.locale) {
    const { loadMessageTable } = await import('./locale.js');
    const table = loadMessageTable(opts.modulePath, opts.locale);
    if (table) {
      const { localize, getConsumedMessageIds } = await import('@glissade/core/i18n');
      doc = localize(doc, table, { locale: opts.locale, consumedIds: getConsumedMessageIds() });
    }
  }
  // hide caption node for non-burn modes so re-render matches the certified burn mode
  const { hideCaptionsDoc, timingPathFor } = await import('./captions.js');
  if (manifest.base.captionBurnMode !== 'burn' && scene.resolveTarget('captions/opacity') !== undefined) {
    doc = hideCaptionsDoc(doc);
  }

  const backend = new SkiaBackend(scene.size.w, scene.size.h);
  const { assetDigests, registeredFamilies } = await prepareSkiaRenderEnv({
    scene,
    doc,
    backend,
    modulePath: opts.modulePath,
    ...(opts.strictFonts !== undefined ? { strictFonts: opts.strictFonts } : {}),
    ...(opts.allowSystemFonts !== undefined ? { allowSystemFonts: opts.allowSystemFonts } : {}),
    ...(opts.locale !== undefined ? { locale: opts.locale } : {}),
  });

  // re-derive the video-cert base and reconcile with the manifest (input-drift check).
  // Re-run the same DL-sample pre-pass over the FULL certified grid (manifest.frames
  // is the contiguous certified range) so the re-derived `complete` matches by
  // construction — NOT the --sample subset (that only limits the byteHash re-render).
  const { capsId } = await import('./frameCache.js');
  const certifiedFrames = manifest.frames.map((f) => f.i);
  const firstFrame = certifiedFrames.length > 0 ? Math.min(...certifiedFrames) : 0;
  const lastFrame = certifiedFrames.length > 0 ? Math.max(...certifiedFrames) : -1;
  const drawnFontFamilies = collectDrawnFontFamilies(scene, doc, fps, firstFrame, lastFrame, registeredFamilies);
  const rederivedBase = await cert.buildVideoCertBase({
    scene,
    doc,
    assetDigests,
    registeredFamilies,
    drawnFontFamilies,
    capsId: capsId(backend.caps),
    captionBurnMode: manifest.base.captionBurnMode,
    narrationTimingPath: timingPathFor(opts.modulePath, opts.locale),
    renderConfig: manifest.base.renderConfig,
    root: process.cwd(),
  });
  const baseMatches = JSON.stringify(rederivedBase) === JSON.stringify(manifest.base);

  // choose the frames to re-render (all, or an evenly-spaced sample for --verify-cache)
  let frames = manifest.frames;
  if (opts.sample !== undefined && opts.sample > 0 && opts.sample < frames.length) {
    const step = frames.length / opts.sample;
    const picked: typeof frames = [];
    for (let k = 0; k < opts.sample; k++) picked.push(frames[Math.floor(k * step)]!);
    frames = picked;
  }

  const mismatches: { i: number; expected: string; got: string }[] = [];
  let okCount = 0;
  for (const rec of frames) {
    // §5.5 (card knEFdGXC99rw): name the first divergent node on a violation
    // (locator only runs on the throw branch — no happy-path cost).
    const dl = withDeterminismGuards(
      'throw',
      () => evaluate(scene, doc, rec.i / fps),
      () => locateViolation(mod.createScene, doc, rec.i / fps),
    );
    backend.render(dl);
    const png = backend.encodePng();
    const got = cert.byteHashOf(png);
    if (got === rec.byteHash) okCount++;
    else mismatches.push({ i: rec.i, expected: rec.byteHash, got });
  }
  backend.dispose();
  return { checked: frames.length, ok: okCount, mismatches, baseMatches };
}

/**
 * Collect the timeline + auto-mixed (narration/music/sfx) audio clips for a
 * scene — the shared front half of the mix used by both `planFinalAudio` (the
 * render/shard path) and `buildMixWav` (the measure-loudness path), so the mix
 * CONTENT measured at commit-time is byte-for-byte the mix rendered later.
 */
// informational mix notes print ONCE per CLI process — the planner legitimately
// runs twice in one `gs measure-loudness` (build the wav + hash the mix inputs),
// which used to double every note.
const mixNotesSeen = new Set<string>();
function mixNote(line: string): void {
  if (mixNotesSeen.has(line)) return;
  mixNotesSeen.add(line);
  process.stderr.write(`${line}\n`);
}

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
          mixNote('note: narration already in the timeline audio — auto-mix skipped');
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
          mixNote('note: music bed already in the timeline audio — auto-mix skipped');
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
          mixNote('note: sfx already in the timeline audio — auto-mix skipped');
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
  opts: Pick<RenderOptions, 'modulePath' | 'narration' | 'music' | 'sfx' | 'locale'>,
  timelineClips?: AudioClip[],
): Promise<string[]> {
  // --- FIX 3 (0.15 i18n-hardening): self-contained ambient-table region ---
  // This helper loads the scene to compile its timeline audio, which sets/clears
  // the process-global ambient table — a concurrent render's table must not be
  // clobbered or leaked into here. Snapshot/restore around the body. The 0.15
  // FIX 2 locale (when set) selects the localized narration sibling so the mixHash
  // is over the SAME (per-locale) wavs the localized render mixes.
  const { preservingMessageTable } = await import('@glissade/core/i18n');
  return preservingMessageTable(async () => {
    let tl = timelineClips;
    if (tl === undefined) {
      try {
        const mod = await loadSceneModule(opts.modulePath, opts.locale);
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
  });
  // --- FIX 3: end self-contained ambient-table region ---
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
 *
 * 0.15 FIX 2 (localized loudness): a localized render (`--locale zh`) mixes the
 * per-locale narration → a DIFFERENT mixHash than the base measurement. So when a
 * locale is set it reads the per-locale file `<stem>.<locale>.loudness.json` FIRST.
 * When that per-locale file is MISSING it throws an ACTIONABLE per-locale error
 * (naming the file + the `gs measure-loudness … --locale` to run) instead of the
 * generic stale-mixHash message — there is otherwise no supported way to commit a
 * per-locale measurement, so a base file would always read as stale and dead-end.
 */
export async function resolveLoudnessGainDb(
  opts: Pick<RenderOptions, 'modulePath' | 'loudness' | 'narration' | 'music' | 'sfx' | 'locale'>,
  timelineClips?: AudioClip[],
): Promise<{ gainDb: number; limiter?: import('./loudness.js').CommittedLimiter } | null> {
  if ((opts.loudness ?? 'auto') === 'off') return null;
  const { readLoudness, computeMixHash, loudnessPathFor } = await import('./loudness.js');
  const hasLocale = opts.locale !== undefined && opts.locale !== '';
  const measurement = readLoudness(opts.modulePath, opts.locale);
  if (!measurement) {
    // a base render with no committed measurement → no gain (unchanged). But a
    // LOCALIZED render with no PER-LOCALE measurement is a dead-end (the base file
    // can't gate the per-locale mix), so fail actionably — UNLESS there is no base
    // measurement either (the scene opts out of loudness entirely → no gain).
    if (hasLocale && readLoudness(opts.modulePath) !== null) {
      const perLocale = loudnessPathFor(opts.modulePath, opts.locale);
      throw new Error(
        `loudness: no ${perLocale} for locale '${opts.locale!}' — a localized render mixes the per-locale narration, ` +
          `which has a different loudness than the base mix, so it needs its OWN measurement. ` +
          `Run \`gs measure-loudness ${opts.modulePath} --locale ${opts.locale!}\` to commit it ` +
          `(or pass --loudness off to render this locale without normalization).`,
      );
    }
    return null;
  }
  const extraInputs = await collectMixAudioInputs(opts, timelineClips);
  const actual = computeMixHash(opts.modulePath, extraInputs);
  if (actual !== measurement.mixHash) {
    const path = loudnessPathFor(opts.modulePath, opts.locale);
    const reRun = hasLocale
      ? `gs measure-loudness ${opts.modulePath} --locale ${opts.locale!}`
      : `gs measure-loudness ${opts.modulePath}`;
    throw new Error(
      `loudness: ${path} is stale — the mix inputs changed since it was measured ` +
        `(committed mixHash ${measurement.mixHash.slice(0, 23)}…, current ${actual.slice(0, 23)}…). ` +
        `Re-run \`${reRun}\` (or pass --loudness off to render without normalization). ` +
        `Note: 0.33 made the mixHash invocation-path-independent — if your mix inputs ` +
        `did NOT change, one re-measure migrates the committed hash.`,
    );
  }
  return { gainDb: measurement.gain, ...(measurement.limiter ? { limiter: measurement.limiter } : {}) };
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

  // Preflight the mix inputs (0.41.1): a committed narration/sfx timing manifest can
  // reference a cache WAV that isn't on disk (the audio cache is often git-ignored, so a
  // fresh checkout lacks it). Without this the render dies deep in ffmpeg with a bare
  // `hook-….wav: No such file`; name the actual fix instead.
  const missing = mix.inputs.find((p) => !existsSync(p));
  if (missing !== undefined) {
    const isNarrationOrSfx = /(^|[/\\])hook-[^/\\]*\.wav$/i.test(missing) || /\.(narration|sfx)\b/i.test(missing);
    throw new Error(
      `audio input not found: ${missing}\n` +
        (isNarrationOrSfx
          ? '  A committed timing manifest references this cache file, but it is not on disk (the audio cache is usually git-ignored).\n' +
            '  Regenerate it with `gs narrate` (or `gs sfx`), or pass --narration off / --sfx off to skip the mix.'
          : '  Check the audio asset path, or pass --narration off / --music off / --sfx off to skip the mix.'),
    );
  }

  const loud = await resolveLoudnessGainDb(opts, timelineClips);
  const filterComplex = loud !== null ? applyMixGainDb(mix.filterComplex, loud.gainDb, loud.limiter) : mix.filterComplex;
  if (loud !== null) {
    process.stderr.write(
      `note: applying committed publish loudness gain ${loud.gainDb.toFixed(2)} dB${loud.limiter ? ` + true-peak limiter @ ${loud.limiter.ceilingDb} dBTP` : ' (single-pass scalar)'}\n`,
    );
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
  opts: Pick<RenderOptions, 'modulePath' | 'narration' | 'music' | 'sfx' | 'locale'>,
  wavOut: string,
): Promise<boolean> {
  if (!ffmpegAvailable()) {
    throw new Error('gs measure-loudness needs FFmpeg on PATH and none was found.');
  }
  // --- FIX 3 (0.15 i18n-hardening): self-contained ambient-table region ---
  // loadSceneModule(modulePath, locale) sets/clears the process-global ambient
  // table. Snapshot/restore so a concurrent render's table isn't clobbered (and a
  // leaked table can't reach this mix). 0.15 FIX 2: a locale (when set) selects the
  // localized narration sibling so measure-loudness measures the per-locale mix.
  const { preservingMessageTable } = await import('@glissade/core/i18n');
  return preservingMessageTable(async () => {
    const mod = await loadSceneModule(opts.modulePath, opts.locale);
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
  });
  // --- FIX 3: end self-contained ambient-table region ---
}
