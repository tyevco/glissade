/**
 * @glissade/core/font-ingest — the font INGESTION front door (DESIGN.md §3.6).
 *
 * This is the heavy, EXPORT/prepare-path-only sibling of the light, embed-safe
 * `fontRegistry.ts`. It owns the byte work that must never reach the runtime
 * document or the browser bundle:
 *
 *   - magic-byte sniffing (ttf / otf / ttc → straight to Skia; woff/woff2 →
 *     decoded in-process to a plain sfnt),
 *   - STATIC variable-axis instancing (a fixed axis tuple → ONE static sfnt,
 *     content-hashed so identical inputs yield byte-identical output), and
 *   - eager `parseCmap` so `registerFont` returns the covered code points and a
 *     build-time `covers(text)` predicate.
 *
 * The single heavy dependency — `subset-font` (a wasm hb-subset wrapper that
 * also decodes woff2 via `fontverter`) — is reached ONLY through a dynamic
 * `import()` inside this module, which lives on its own tsdown entry
 * (`@glissade/core/font-ingest`). `core/index.ts` never imports it, so the
 * decoder + instancer tree-shake completely out of the embed (asserted by the
 * §4.4 leak-guard in scripts/check-size.mjs).
 *
 * Determinism: woff2 → sfnt and axis instancing run ONCE here, at ingest time,
 * never inside evaluate(); the result is a content-hashed static sfnt with a
 * stable identity. No new field flows through FontSpec/DisplayList, so the
 * evaluate() byte output is unchanged.
 */

import { parseCmap } from './cmap.js';
import type { FontFaceRef } from './timeline.js';

/** The four sfnt/woff magic-byte families this front door understands. */
export type FontFormat = 'truetype' | 'opentype' | 'collection' | 'woff' | 'woff2';

/** Raw bytes in any form the ingest accepts; a path is read by the caller's I/O. */
export type FontSource = Uint8Array | ArrayBuffer;

/**
 * A fixed variable-axis tuple to INSTANCE at (e.g. `{ wght: 600 }` or
 * `{ wght: 600, wdth: 100 }`). Each axis is pinned to a single value, producing
 * a static face — the parity-safe case (DESIGN §3.6). Animatable axes are
 * deferred; an axis RANGE is intentionally not accepted here.
 */
export type AxisTuple = Record<string, number>;

export interface RegisterFontInit {
  /** The CSS family name to register under (the §3.6 asset-id convention). */
  family: string;
  /**
   * The font source: raw bytes (`Uint8Array | ArrayBuffer`) OR — node-side only —
   * a string filesystem path, which this subpath fs-reads to bytes for you. The
   * string form is a `registerFont`/`ingestFont` convenience; it lives on the
   * export/prepare-only `@glissade/core/font-ingest` subpath (`node:fs` is fine
   * here, it never reaches the embed bundle).
   */
  src: FontSource | string;
  weight?: number | undefined;
  style?: 'normal' | 'italic' | undefined;
  /**
   * Pin these variable axes to fixed values, instancing the variable font to a
   * single static sfnt at ingest time. Omitted → the face is used as-is.
   */
  axes?: AxisTuple | undefined;
  /** Explicit fallback family chain (mirrors AssetRef.fallback). */
  fallback?: readonly string[] | undefined;
}

/**
 * The result of ingesting one face: the decoded/instanced STATIC sfnt bytes,
 * a content hash (stable identity for caching + the asset url), the parsed
 * coverage, and a `covers()` predicate. `toFaceRef()` / `toAssetRef()` bridge
 * back into the serializable Timeline document the render path consumes.
 */
export interface FontFaceResult {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** The decoded + (optionally) instanced static sfnt bytes (ttf/otf). */
  bytes: Uint8Array;
  /** Detected source format before any decode/instance. */
  sourceFormat: FontFormat;
  /** FNV-1a content hash of `bytes` (hex), stable across runs for equal input. */
  hash: string;
  /** The code points the instanced face's cmap covers. */
  coverage: ReadonlySet<number>;
  fallback: readonly string[];
  /** True iff every code point in `text` is covered by this face. */
  covers(text: string): boolean;
  /** Code points in `text` this face does NOT cover (ascending, de-duped). */
  missing(text: string): number[];
}

const MAGIC = {
  /** 0x00010000 (TrueType) */ ttf1: 0x00010000,
  /** 'true' */ trueTag: 0x74727565,
  /** 'OTTO' */ otto: 0x4f54544f,
  /** 'ttcf' */ ttcf: 0x74746366,
  /** 'wOFF' */ woff: 0x774f4646,
  /** 'wOF2' */ woff2: 0x774f4632,
} as const;

function asUint8(src: FontSource): Uint8Array {
  return src instanceof Uint8Array ? src : new Uint8Array(src);
}

/**
 * Resolve a `registerFont`/`ingestFont` `src` to raw bytes. A string is treated
 * as a node-side filesystem PATH and read here via a dynamic `node:fs/promises`
 * import — this subpath is export/prepare-only, so `node:fs` never reaches the
 * embed bundle (the §4.4 leak-guard whitelists this). A `Uint8Array|ArrayBuffer`
 * passes straight through unchanged. An unreadable path throws a clear
 * FontIngestError naming the path (never the downstream "too short" sniff error).
 */
async function resolveSource(src: FontSource | string): Promise<Uint8Array> {
  if (typeof src !== 'string') return asUint8(src);
  let readFile: (p: string) => Promise<Uint8Array>;
  try {
    ({ readFile } = (await import('node:fs/promises')) as {
      readFile: (p: string) => Promise<Uint8Array>;
    });
  } catch (err) {
    throw new FontIngestError(
      `registerFont received a string path ('${src}') but the filesystem is not available ` +
        `here (node-only) — pass Uint8Array bytes instead. (${String((err as Error)?.message ?? err)})`,
    );
  }
  try {
    return await readFile(src);
  } catch (err) {
    throw new FontIngestError(
      `could not read font file '${src}': ${String((err as Error)?.message ?? err)}`,
    );
  }
}

/** Sniff the leading 4 bytes; throws on input that is not a recognized font. */
export function sniffFontFormat(src: FontSource): FontFormat {
  const u8 = asUint8(src);
  if (u8.byteLength < 4) throw new FontIngestError('input is too short to be a font (need ≥ 4 magic bytes)');
  const tag = (u8[0]! << 24) | (u8[1]! << 16) | (u8[2]! << 8) | u8[3]!;
  const t = tag >>> 0;
  switch (t) {
    case MAGIC.ttf1:
    case MAGIC.trueTag:
      return 'truetype';
    case MAGIC.otto:
      return 'opentype';
    case MAGIC.ttcf:
      return 'collection';
    case MAGIC.woff:
      return 'woff';
    case MAGIC.woff2:
      return 'woff2';
    default:
      throw new FontIngestError(
        `unrecognized font magic 0x${t.toString(16).padStart(8, '0')} — expected ttf/otf/ttc/woff/woff2`,
      );
  }
}

export class FontIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FontIngestError';
  }
}

/** FNV-1a (32-bit) over the bytes → 8-hex-char content hash (DESIGN §3.5 family). */
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    // 32-bit FNV prime multiply via shifts (stays in the safe integer range)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function codePointsOf(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) out.push(cp);
  }
  return out;
}

// minimal structural type for the optional `subset-font` dependency (no @types)
type SubsetFontFn = (
  font: Uint8Array,
  text: string,
  opts?: { targetFormat?: 'sfnt' | 'woff' | 'woff2'; variationAxes?: Record<string, number> },
) => Promise<Uint8Array>;

let subsetFontPromise: Promise<SubsetFontFn> | undefined;
async function loadSubsetFont(): Promise<SubsetFontFn> {
  // dynamic import keeps subset-font (and its harfbuzz/woff2 wasm) off every
  // static import graph — this module is the ONLY place it can be reached.
  subsetFontPromise ??= import('subset-font' as string).then(
    (m) => (m.default ?? m) as SubsetFontFn,
    (err) => {
      throw new FontIngestError(
        `font ingestion needs the optional 'subset-font' dependency for woff2 decode / axis instancing — install it. (${String(
          (err as Error)?.message ?? err,
        )})`,
      );
    },
  );
  return subsetFontPromise;
}

// minimal structural type for the optional `fontverter` dependency (no @types).
// `fontverter` is subset-font's own woff/woff2 codec — we reach it DIRECTLY for
// the pure decode (woff2 → sfnt with EVERY glyph kept) so coverage can be read
// from the real cmap. (hb-subset can't decode-without-subsetting: it needs the
// code-point retain set, which is exactly what we don't have until we've decoded.)
type FontverterConvert = (font: Uint8Array, to: 'truetype' | 'woff' | 'woff2') => Promise<Uint8Array>;

let fontverterPromise: Promise<FontverterConvert> | undefined;
async function loadFontverter(): Promise<FontverterConvert> {
  // dynamic import, same rationale as subset-font: the woff2 codec must never
  // reach the embed graph (asserted by the §4.4 leak-guard in check-size.mjs,
  // which already lists `fontverter`). This module is the ONLY place it loads.
  fontverterPromise ??= import('fontverter' as string).then(
    (m) => {
      const convert = (m.default ?? m).convert as FontverterConvert | undefined;
      if (typeof convert !== 'function') {
        throw new FontIngestError(`'fontverter' loaded but exposes no convert() — incompatible version`);
      }
      return convert;
    },
    (err) => {
      throw new FontIngestError(
        `font ingestion needs the optional 'fontverter' dependency for woff/woff2 decode — install it. (${String(
          (err as Error)?.message ?? err,
        )})`,
      );
    },
  );
  return fontverterPromise;
}

/**
 * Build the "retain every code point" string from a font's own cmap — used to
 * run hb-subset purely as a woff2 DECODER / variable-axis INSTANCER without
 * dropping a single glyph (subsetting is the DEFERRED feature). We feed back
 * exactly the code points the source already covers.
 */
function retainAllText(coverage: ReadonlySet<number>): string {
  let s = '';
  for (const cp of coverage) s += String.fromCodePoint(cp);
  return s;
}

/**
 * Ingest one face: sniff → (woff2 decode) → (instance at `axes`) → a static
 * sfnt + content hash + coverage. The heavy path (woff2 / instancing) runs
 * hb-subset; a plain ttf/otf with no axes skips it entirely (zero-dep fast
 * path), keeping the common case off the wasm boundary.
 */
export async function ingestFont(init: RegisterFontInit): Promise<FontFaceResult> {
  // a string `src` is a node-side path — fs-read it to bytes (clear error if
  // unreadable) before any sniff; bytes pass straight through unchanged.
  const input = await resolveSource(init.src);
  const sourceFormat = sniffFontFormat(input);
  const weight = init.weight ?? 400;
  const style = init.style ?? 'normal';
  const fallback = init.fallback ? [...init.fallback] : [];

  const needsDecode = sourceFormat === 'woff' || sourceFormat === 'woff2';
  const needsInstance = init.axes !== undefined && Object.keys(init.axes).length > 0;

  let bytes: Uint8Array;
  if (!needsDecode && !needsInstance) {
    // ttf/otf/ttc straight through — Skia consumes it directly, no wasm needed.
    bytes = input;
  } else {
    let decoded = input;
    // 1) decode (woff/woff2 → sfnt) via fontverter, the pure codec — it inflates
    //    EVERY glyph, so the decoded sfnt's cmap is the real, full coverage. We
    //    must NOT route the decode through hb-subset here: subsetting needs the
    //    retain set up front, and the woff2 bytes are compressed, so parseCmap()
    //    on them is empty — feeding that back drops every glyph (the bug this
    //    fixes). Decode first, then read coverage from the decoded sfnt.
    if (needsDecode) {
      const convert = await loadFontverter();
      // fontverter@2.x sniffs the magic via Buffer.prototype.toString('ascii',0,4),
      // which a plain Uint8Array does NOT honor (its toString ignores the args and
      // returns the comma-joined bytes → never matches 'wOF2'). The public
      // registerFont({ src }) path hands us a plain Uint8Array (asUint8), so we MUST
      // normalize to a node Buffer here (node-only subpath) or every real consumer
      // throws 'Unrecognized font signature'. A path-read happened to give a Buffer,
      // which is why the in-repo test passed but the API path broke (ai-training).
      decoded = await convert(Buffer.from(input), 'truetype');
    }
    if (needsInstance) {
      const subsetFont = await loadSubsetFont();
      // instance to a static face at the pinned axis tuple, retaining every code
      // point the (now-decoded) source covers — subsetting stays the deferred case.
      const coverage = parseCmap(decoded);
      decoded = await subsetFont(decoded, retainAllText(coverage), {
        targetFormat: 'sfnt',
        variationAxes: init.axes!,
      });
    }
    bytes = decoded;
  }

  const coverage = parseCmap(bytes);
  const hash = fnv1a(bytes);

  return {
    family: init.family,
    weight,
    style,
    bytes,
    sourceFormat,
    hash,
    coverage,
    fallback,
    covers(text) {
      return codePointsOf(text).every((cp) => coverage.has(cp));
    },
    missing(text) {
      const miss = new Set<number>();
      for (const cp of codePointsOf(text)) if (!coverage.has(cp)) miss.add(cp);
      return [...miss].sort((a, b) => a - b);
    },
  };
}

/** A registered face plus the bytes the render path will hand to the rasterizer. */
export interface IngestedFace extends FontFaceResult {
  /** The `FontFaceRef` this face contributes to a Timeline AssetRef. */
  faceRef(url: string): FontFaceRef;
}

/**
 * `registerFont(...)` — the merged front door. Ingests `init` and records it in
 * `store` (the in-process registry the render path consumes). Returns the
 * ingested face (bytes + coverage + `covers()`); the caller decides whether to
 * persist the static sfnt to disk (content-hashed url) and/or feed Skia.
 */
export async function registerFont(init: RegisterFontInit, store?: FontStore): Promise<IngestedFace> {
  const result = await ingestFont(init);
  const face: IngestedFace = {
    ...result,
    faceRef(url: string): FontFaceRef {
      return {
        url,
        ...(result.weight !== 400 ? { weight: result.weight } : {}),
        ...(result.style !== 'normal' ? { style: result.style } : {}),
      };
    },
  };
  store?.add(face);
  return face;
}

/**
 * A tiny in-process store the export/prepare path fills via `registerFont` and
 * the renderer drains. Groups faces by family and remembers each family's
 * declared fallback chain — the same shape `buildFontRegistry` consumes, so the
 * programmatic and document-driven paths converge on one registry.
 */
export class FontStore {
  private readonly byFamily = new Map<string, IngestedFace[]>();
  private readonly fallbacks = new Map<string, string[]>();

  add(face: IngestedFace): void {
    const list = this.byFamily.get(face.family) ?? [];
    list.push(face);
    this.byFamily.set(face.family, list);
    if (face.fallback.length > 0) this.fallbacks.set(face.family, [...face.fallback]);
  }

  families(): string[] {
    return [...this.byFamily.keys()];
  }

  facesOf(family: string): readonly IngestedFace[] {
    return this.byFamily.get(family) ?? [];
  }

  fallbackOf(family: string): readonly string[] {
    return this.fallbacks.get(family) ?? [];
  }

  /** Every ingested face across every family (the renderer registers these). */
  all(): IngestedFace[] {
    const out: IngestedFace[] = [];
    for (const list of this.byFamily.values()) out.push(...list);
    return out;
  }
}

/**
 * One source entry in a `font()` plan: a file path (or raw bytes) plus the
 * (weight, style) it represents. Paths are resolved to bytes by the ingest
 * caller (`buildFontPlan`'s `read`), keeping this module's pure spec free of I/O.
 */
export interface FontSrcEntry {
  path?: string | undefined;
  bytes?: FontSource | undefined;
  weight?: number | undefined;
  style?: 'normal' | 'italic' | undefined;
}

/** The declarative plan a `font(...).build()` produces — pure data, no I/O. */
export interface FontPlan {
  family: string;
  sources: FontSrcEntry[];
  fallback: string[];
  /** When set, every source is instanced at this fixed axis tuple. */
  axes?: AxisTuple | undefined;
  /** Marks the plan as a variable font (axes are expected / required). */
  variable: boolean;
}

/**
 * Fluent author-time builder for a font family (DESIGN §3.6). PURE: it only
 * assembles a `FontPlan`; no bytes are read and no wasm is touched until the
 * plan is ingested. Two shapes:
 *
 *   font('Inter').src('Inter.ttf').weights([400, 600, 700]).fallback(['Arial']).build()
 *   font('InterVar').src('InterVar.woff2').variable().axis('wght', 600).build()
 *
 * `.weights([...])` is sugar for "the same src at each of these weights" only
 * when a single src is given; with explicit per-weight `.src(path, weight)`
 * calls it is ignored in favor of the explicit entries.
 */
export interface FontBuilder {
  src(path: string, opts?: { weight?: number; style?: 'normal' | 'italic' }): FontBuilder;
  bytes(data: FontSource, opts?: { weight?: number; style?: 'normal' | 'italic' }): FontBuilder;
  weights(weights: readonly number[]): FontBuilder;
  fallback(families: readonly string[]): FontBuilder;
  /** Mark this family as variable (axes are pinned via `.axis()`). */
  variable(): FontBuilder;
  /** Pin a variable axis to a fixed value (static instancing). */
  axis(tag: string, value: number): FontBuilder;
  build(): FontPlan;
}

export function font(family: string): FontBuilder {
  const sources: FontSrcEntry[] = [];
  const fallback: string[] = [];
  let weightList: number[] | undefined;
  let axes: AxisTuple | undefined;
  let variable = false;

  const api: FontBuilder = {
    src(path, opts) {
      sources.push({
        path,
        ...(opts?.weight !== undefined ? { weight: opts.weight } : {}),
        ...(opts?.style !== undefined ? { style: opts.style } : {}),
      });
      return api;
    },
    bytes(data, opts) {
      sources.push({
        bytes: data,
        ...(opts?.weight !== undefined ? { weight: opts.weight } : {}),
        ...(opts?.style !== undefined ? { style: opts.style } : {}),
      });
      return api;
    },
    weights(ws) {
      weightList = [...ws];
      return api;
    },
    fallback(families) {
      fallback.push(...families);
      return api;
    },
    variable() {
      variable = true;
      return api;
    },
    axis(tag, value) {
      (axes ??= {})[tag] = value;
      return api;
    },
    build() {
      // `.weights([...])` fans a single weightless src out to one entry per
      // weight; explicit per-entry weights are left untouched.
      let resolved = sources;
      if (weightList && sources.length === 1 && sources[0]!.weight === undefined) {
        const base = sources[0]!;
        resolved = weightList.map((w) => ({ ...base, weight: w }));
      }
      return {
        family,
        sources: resolved,
        fallback,
        variable,
        ...(axes !== undefined ? { axes } : {}),
      };
    },
  };
  return api;
}

/**
 * Ingest a whole `FontPlan` into `store`. `read` resolves a source path to bytes
 * (the I/O seam — the CLI reads files, a bundler plugin could fetch). Every
 * source becomes one ingested face under the plan's family; the family fallback
 * is attached to the first face so the store records it once.
 */
export async function buildFontPlan(
  plan: FontPlan,
  read: (path: string) => Promise<FontSource>,
  store?: FontStore,
): Promise<IngestedFace[]> {
  const out: IngestedFace[] = [];
  for (let i = 0; i < plan.sources.length; i++) {
    const entry = plan.sources[i]!;
    const src = entry.bytes ?? (entry.path !== undefined ? await read(entry.path) : undefined);
    if (src === undefined) throw new FontIngestError(`font('${plan.family}') source #${i} has neither a path nor bytes`);
    const face = await registerFont(
      {
        family: plan.family,
        src,
        ...(entry.weight !== undefined ? { weight: entry.weight } : {}),
        ...(entry.style !== undefined ? { style: entry.style } : {}),
        ...(plan.axes !== undefined ? { axes: plan.axes } : {}),
        // attach the declared fallback once (to the first face)
        ...(i === 0 && plan.fallback.length > 0 ? { fallback: plan.fallback } : {}),
      },
      store,
    );
    out.push(face);
  }
  return out;
}
