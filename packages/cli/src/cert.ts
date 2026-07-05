/**
 * gs render --certify — the DETERMINISM CERTIFICATE + the content-addressed render
 * cache (0.62). The closed-form of the determinism carry: a cryptographic manifest
 * of EXACTLY the inputs that determine a render's bytes, so a content-addressed
 * cache is provably correct (a HIT serves the SAME bytes a render would).
 *
 * ── THE DETERMINANT SET (video-cert IN set) ──────────────────────────────────
 *   sceneHash          canonical scene doc  (SHARED with diff via canonicalScene)
 *   timelineHash       canonical timeline (tracks) doc  (SHARED with diff)
 *   frameKey           `${i}@${fps}` — integer frame + fps, ONE canonical division
 *   narrationTimingHash  sha256 of the narration.timing.json sidecar bytes
 *   fontDigest         content-hash of the resolved font FACE BYTES (not names)
 *   captionBurnMode    the caption pixel-burn render option ('burn'|'off'|'sidecar')
 *   toolchainHash      INTERIM: hash of installed core+scene+backend-skia+cli
 *                      versions (toolchain.lock does not exist yet — reported gap)
 *   backendHash        INTERIM: @napi-rs/canvas version ⊕ backend caps id (a precise
 *                      Skia build id is not exposed by @napi-rs/canvas — reported gap)
 *   renderConfig       w / h / pixel-format / imageSmoothing
 *
 * OUT (byte-invariant — excluded, or the cache never hits): wall-clock, machine/
 * OS/arch, cwd/paths, hostname, worker-shard-index, env — AND ALL AUDIO
 * determinants. The video-cert MUST NOT depend on any audio input (invariant
 * `video ≠ f(audio)`): an audio-only re-master busts the audio-cert only, so the
 * frame cache HOLDS (preserves the 0.27 remux win). Audio determinants live in the
 * SEPARATE {@link AudioCert}.
 *
 * certHash = sha256(canonical-sorted determinant set). Computable WITHOUT rendering
 * (a pure fn of inputs — the lookup-before-you-spend property). certVersion is
 * fail-loud on an unknown schema.
 *
 * SAFETY ASYMMETRY (toolchainHash granularity, design-lead call): coarse
 * whole-VERSION hashing. A false MISS (cert changes across a byte-identical version
 * bump → a needless re-render) is SAFE + cheap; a false HIT (cert HOLDS across a
 * byte-CHANGING bump → WRONG bytes served) is CATASTROPHIC. Version-as-toolchainHash
 * guarantees no false hold across versions. The cross-version cache-hit optimization
 * is a deliberate FAST-FOLLOW, gated on the determinism carry — NOT this MVP.
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Scene } from '@glissade/scene';
import type { Timeline } from '@glissade/core';

/**
 * The cert schema version — additive-only; a reader fail-louds on an UNKNOWN one.
 *
 * 1→2 (0.63.2 determinism-safety fix): adds `complete` to {@link VideoCertBase}
 * (a cacheability flag — is EVERY font the scene draws content-addressed?). A v1
 * cert has no `complete`, so a v1-era render cache can hold latent FALSE-HIT
 * entries (a system-font scene has an empty fontDigest → a font/system change
 * doesn't move certHash → stale bytes served). The cache is version-namespaced by
 * CERT_VERSION so a v2 read can NEVER serve a v1-era entry (see {@link CertCache}).
 */
export const CERT_VERSION = 2 as const;

export class CertVersionError extends Error {
  constructor(got: unknown) {
    super(
      `unsupported certVersion ${JSON.stringify(got)} — this gs understands certVersion ${CERT_VERSION}. ` +
        `A newer cert schema needs a newer gs (the format is additive; fail loud rather than mis-read).`,
    );
    this.name = 'CertVersionError';
  }
}

/** Fail-loud on an unknown cert schema version (any cert reader calls this first). */
export function assertCertVersion(got: unknown): asserts got is typeof CERT_VERSION {
  if (got !== CERT_VERSION) throw new CertVersionError(got);
}

export interface RenderConfig {
  width: number;
  height: number;
  /** the backend's fixed pixel format (Skia straight-alpha RGBA8). */
  pixelFormat: string;
  /** the imageSmoothing render option (folds into AA bytes). */
  imageSmoothing: boolean;
}

/** The frame-INDEPENDENT video determinants (the IN set minus frameKey). */
export interface VideoCertBase {
  certVersion: typeof CERT_VERSION;
  sceneHash: string;
  timelineHash: string;
  narrationTimingHash: string;
  fontDigest: string;
  captionBurnMode: string;
  toolchainHash: string;
  backendHash: string;
  renderConfig: RenderConfig;
  /**
   * CACHEABILITY flag (NOT a determinant — NOT folded into certHash): does this
   * cert fully capture EVERY font the scene draws? `false` when the scene draws
   * text with a family that is NOT content-addressed (a SYSTEM family, or a
   * partial capture mixing a registered face with a system face) — such a render's
   * fontDigest can't move on a font/system change, so its cert must NEVER read or
   * write the render cache (an incomplete cert always re-renders). A scene with no
   * text has no font determinant → `true`. It sits BESIDE certHash in the manifest.
   */
  complete: boolean;
}

/** A per-FRAME certificate: the base + frameKey → certHash (the cache key). */
export interface Certificate extends VideoCertBase {
  /** `${i}@${fps}` — integer frame index + fps; ONE canonical division at render (t=i/fps). */
  frameKey: string;
  /** sha256(canonical-sorted determinant set incl frameKey) — the cache key. */
  certHash: string;
  /** reserved additive field for the signing FAST-FOLLOW (NOT MVP). */
  signature?: string;
}

/** One frame's line in the emitted manifest. */
export interface FrameCertRecord {
  i: number;
  frameKey: string;
  certHash: string;
  /** sha256 of the emitted PNG bytes (the determinism carry, keyed by cert). */
  byteHash: string;
}

/** The video-cert manifest `gs render --certify` writes beside the output. */
export interface VideoCertManifest {
  certVersion: typeof CERT_VERSION;
  kind: 'video';
  fps: number;
  base: VideoCertBase;
  frames: FrameCertRecord[];
}

/** The SEPARATE audio-cert (per-stream split). Keeps the video-cert audio-free. */
export interface AudioCert {
  certVersion: typeof CERT_VERSION;
  kind: 'audio';
  narrationAudioHash: string;
  musicHash: string;
  sfxHash: string;
  loudness: string;
  certHash: string;
}

// ── canonical determinant serialization + hashing (CLI side) ──────────────────

/** Stable JSON: object keys sorted deeply so field ORDER never affects the hash. */
function canonicalJson(v: unknown): string {
  return JSON.stringify(sortDeep(v));
}
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** sha256 of a byte buffer → hex (the byteHash / sidecar-content hash primitive). */
export function byteHashOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * frameKey — the ONE canonical (integer frame, fps) encoding. t=i/fps is computed
 * ONCE at render from this; the key never stores the float t (a float would be a
 * platform-dependent representation). fps is stringified as-authored.
 */
export function frameKeyFor(i: number, fps: number): string {
  return `${i}@${fps}`;
}

/**
 * certHash = sha256(canonical-sorted { ...determinants, frameKey }). PURE fn of
 * inputs — NO render. This is the cache key for frame `i`. `complete` is a
 * CACHEABILITY flag, NOT a render determinant — it is STRIPPED before hashing so
 * it can never move the content-address (a cert is complete/incomplete for the
 * SAME rendered bytes; the cert cache honors `complete` at the call site instead).
 */
export function computeCertHash(base: VideoCertBase, frameKey: string): string {
  const { complete: _complete, ...determinants } = base;
  return sha256Hex(canonicalJson({ ...determinants, frameKey }));
}

/** Assemble the full per-frame {@link Certificate} for frame `i`. */
export function frameCertificate(base: VideoCertBase, i: number, fps: number): Certificate {
  const frameKey = frameKeyFor(i, fps);
  return { ...base, frameKey, certHash: computeCertHash(base, frameKey) };
}

/** The audio-cert hash (canonical-sorted audio determinant set). */
export function computeAudioCertHash(a: Omit<AudioCert, 'certHash' | 'certVersion' | 'kind'>): string {
  return sha256Hex(canonicalJson(a));
}

// ── the determinant seams (fontDigest / backendHash / toolchainHash / …) ──────

/**
 * fontDigest — a content-hash of the resolved font FACE BYTES (not family names).
 * Reuses the `font:<family>:<url> → sha256(faceBytes)` entries the render env
 * already computes in `prepareSkiaRenderEnv` (assetDigests). Folds the sorted
 * (family:url → byteDigest) pairs. GAP (reported): a scene that references only
 * SYSTEM font families declares no faces, so its glyph bytes are not content-
 * addressed here — fontDigest is empty and the cert trusts the toolchain/backend
 * hash to scope system-font rendering. (--strict rejects unregistered families, so
 * a certified render should declare its faces.)
 */
export function fontDigestFrom(assetDigests: ReadonlyMap<string, string>): string {
  const fontEntries = [...assetDigests.entries()].filter(([k]) => k.startsWith('font:')).sort();
  if (fontEntries.length === 0) return '';
  const h = createHash('sha256');
  for (const [k, v] of fontEntries) {
    h.update(k);
    h.update('\0');
    h.update(v);
    h.update('\0');
  }
  return h.digest('hex');
}

let _backendHash: string | undefined;
/**
 * backendHash — INTERIM (reported gap): the @napi-rs/canvas package version ⊕ the
 * backend caps id. @napi-rs/canvas does NOT expose the underlying Skia BUILD id (a
 * point-release can shift AA bytes without a JS-version bump we can see), so a
 * version+caps hash is the honest interim. The SAFETY asymmetry still holds: a
 * false MISS on a byte-identical Skia bump is cheap; the version bump on any
 * observable @napi-rs/canvas change prevents a false HOLD across a real change.
 */
export function backendHash(capsId: string): string {
  if (_backendHash === undefined) {
    let canvasVersion = 'unknown';
    try {
      const require = createRequire(import.meta.url);
      canvasVersion = (require('@napi-rs/canvas/package.json') as { version?: string }).version ?? 'unknown';
    } catch {
      /* keep 'unknown' */
    }
    _backendHash = sha256Hex(`napi-canvas@${canvasVersion}|${capsId}`);
  }
  return _backendHash;
}

let _toolchainHash: string | undefined;
/**
 * toolchainHash — coarse whole-VERSION hashing (design-lead call). Hashes
 * `toolchain.lock` if it exists; INTERIM (reported gap — it does not exist yet):
 * hashes the installed @glissade/core + scene + backend-skia + cli versions. Every
 * version bump changes the cert, so an old cert always correctly MISSES on a new
 * version (no false hold across versions). NOT an attempt to detect whether a bump
 * actually changed rendering — that (cross-version cache hits) is a FAST-FOLLOW.
 */
export function toolchainHash(root: string): string {
  if (_toolchainHash !== undefined) return _toolchainHash;
  const lock = join(root, 'toolchain.lock');
  if (existsSync(lock)) {
    _toolchainHash = sha256Hex(`lock:${readFileSync(lock, 'utf8')}`);
    return _toolchainHash;
  }
  // INTERIM: installed glissade package versions.
  const require = createRequire(import.meta.url);
  const ver = (pkg: string): string => {
    try {
      return (require(`${pkg}/package.json`) as { version?: string }).version ?? '?';
    } catch {
      return '?';
    }
  };
  const parts = [
    `core@${ver('@glissade/core')}`,
    `scene@${ver('@glissade/scene')}`,
    `backend-skia@${ver('@glissade/backend-skia')}`,
    `cli@${ver('@glissade/cli')}`,
  ];
  _toolchainHash = sha256Hex(`versions:${parts.join('|')}`);
  return _toolchainHash;
}

/** narrationTimingHash — sha256 of the narration.timing.json sidecar bytes, or '' when absent. */
export function narrationTimingHash(timingPath: string | null | undefined): string {
  if (!timingPath || !existsSync(timingPath)) return '';
  return byteHashOf(readFileSync(timingPath));
}

/** Reset memoized toolchain/backend hashes (tests that simulate a version change). */
export function __resetCertMemo(): void {
  _toolchainHash = undefined;
  _backendHash = undefined;
}

// ── the local content-addressed render cache (keyed by certHash) ──────────────

export type CertCacheMode = 'read-write' | 'read-only' | 'off';

const CERT_MAGIC = 0x47534254; // 'GSBT' — gs bytes
const CERT_HEADER = 8; // magic(4) + format-version(4)

/**
 * A LOCAL content-addressed render cache keyed by certHash. `put` stores the frame's
 * final artifact BYTES (the PNG) self-certifyingly; `get` returns `{ bytes, byteHash
 * }` (trust-on-read by certHash). A HIT serves the SAME bytes a render would (the
 * certHash captures every byte-determinant), so a cache HIT is byte-identical to a
 * cold render. `--verify-cache` re-renders a SAMPLE and confirms byteHash — a
 * mismatch is a determinism break (the b4e6060006 alarm). Distinct from the §3.5
 * frame RGBA cache (keyed by the post-evaluate DisplayList): this is keyed by the
 * PURE cert (computable without evaluate) and stores the final artifact.
 *
 * CROSS-VERSION RETIREMENT (0.63.2): the on-disk store is VERSION-NAMESPACED — every
 * entry lives under a `v${CERT_VERSION}/` subdir of `dir`. A v2 read/write only ever
 * touches the `v2/` slot, so the shipped v1 entries (written flat under `dir/`) are
 * ORPHANED and can NEVER be served by a v2 `get()`. This retires the latent
 * FALSE-HIT entries a v1 cache holds (a v1 cert has no `complete`, so a v1 read could
 * otherwise serve stale bytes since certHash is unchanged by the schema bump).
 */
export class CertCache {
  readonly dir: string;
  readonly mode: CertCacheMode;
  /** the version-namespaced slot the entries actually live in (`dir/v${CERT_VERSION}`). */
  private readonly slot: string;
  private hits = 0;
  private misses = 0;
  private stored = 0;

  constructor(opts: { dir: string; mode: CertCacheMode }) {
    this.dir = opts.dir;
    this.mode = opts.mode;
    this.slot = join(this.dir, `v${CERT_VERSION}`);
    if (this.mode !== 'off') mkdirSync(this.slot, { recursive: true });
  }

  private pathFor(certHash: string): string {
    return join(this.slot, `${certHash}.gscb`);
  }

  /** HIT → { bytes, byteHash }; MISS / off → undefined. Trust-on-read by certHash. */
  get(certHash: string): { bytes: Buffer; byteHash: string } | undefined {
    if (this.mode === 'off') return undefined;
    const file = this.pathFor(certHash);
    if (!existsSync(file)) {
      this.misses++;
      return undefined;
    }
    try {
      const raw = readFileSync(file);
      if (raw.length < CERT_HEADER || raw.readUInt32BE(0) !== CERT_MAGIC) throw new Error('bad magic');
      const bytes = raw.subarray(CERT_HEADER);
      this.hits++;
      return { bytes, byteHash: byteHashOf(bytes) };
    } catch {
      try {
        unlinkSync(file);
      } catch {
        /* gone */
      }
      this.misses++;
      return undefined;
    }
  }

  /** Store the frame's artifact bytes under certHash (atomic; no-op in read-only/off). */
  put(certHash: string, bytes: Uint8Array): void {
    if (this.mode !== 'read-write') return;
    const file = this.pathFor(certHash);
    if (existsSync(file)) return;
    const header = Buffer.alloc(CERT_HEADER);
    header.writeUInt32BE(CERT_MAGIC, 0);
    header.writeUInt32BE(1, 4);
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    writeFileSync(tmp, Buffer.concat([header, Buffer.from(bytes)]));
    try {
      renameSync(tmp, file);
      this.stored++;
    } catch {
      try {
        unlinkSync(tmp);
      } catch {
        /* gone */
      }
    }
  }

  getStats(): { hits: number; misses: number; stored: number } {
    return { hits: this.hits, misses: this.misses, stored: this.stored };
  }

  /** List every certHash present on disk (for `--verify-cache` sampling). */
  entries(): string[] {
    if (this.mode === 'off' || !existsSync(this.slot)) return [];
    return readdirSync(this.slot)
      .filter((f) => f.endsWith('.gscb'))
      .map((f) => f.slice(0, -'.gscb'.length));
  }

  entryCount(): number {
    return this.entries().length;
  }
}

/** Probe a cache entry's stored bytes WITHOUT trusting it (for verify sampling). */
export function readCertCacheBytes(dir: string, certHash: string): Buffer | undefined {
  // read from the version-namespaced slot (matches CertCache's on-disk layout).
  const file = join(dir, `v${CERT_VERSION}`, `${certHash}.gscb`);
  let fd: number | undefined;
  try {
    fd = openSync(file, 'r');
    const sz = statSync(file).size;
    const buf = Buffer.alloc(sz);
    readSync(fd, buf, 0, sz, 0);
    if (buf.length < CERT_HEADER || buf.readUInt32BE(0) !== CERT_MAGIC) return undefined;
    return buf.subarray(CERT_HEADER);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// ── typed shape for building a base (used by render.ts + tests) ───────────────

/** Everything render.ts resolves BEFORE the frame loop to build the video-cert base. */
export interface VideoCertBaseInputs {
  scene: Scene;
  /** the (localized/resolved) render document. */
  doc: Timeline;
  assetDigests: ReadonlyMap<string, string>;
  /**
   * The families glissade actually registered from `doc.assets` (case-folded) —
   * i.e. the families that got a `font:` assetDigest. `prepareSkiaRenderEnv`
   * returns this. Used to decide `complete` (font-completeness).
   */
  registeredFamilies: ReadonlySet<string>;
  capsId: string;
  captionBurnMode: string;
  narrationTimingPath: string | null | undefined;
  renderConfig: RenderConfig;
  /** repo/cwd root for locating toolchain.lock. */
  root: string;
}

/**
 * The set of font families the scene's Text nodes DRAW (a non-empty `.text()`).
 *
 * PROXY check (video-canary blessed): walk the scene for text-drawing nodes and
 * collect their resolved font families. We use a STRUCTURAL (duck-typed) walk over
 * `scene.nodes` — a node with a string `fontFamily` and a callable `text()`
 * returning a non-empty string is a drawing Text node — deliberately NOT
 * `collectTextUsages`'s `instanceof Text` check: the scene module is loaded through
 * jiti, which can resolve `@glissade/scene` to a DIFFERENT class instance than the
 * cert's, so an `instanceof` walk silently returns EMPTY across that boundary and
 * would OVER-mark `complete:true` — re-enabling the exact false-HIT this fix closes.
 * The structural walk is identity-independent, so it is correct across jiti.
 *
 * PROXY (not a precise fillText DL-walk) because `buildVideoCertBase` runs BEFORE
 * the frame loop — the render DisplayLists don't exist yet, so a fillText-font walk
 * would be an intrusive reorder. The proxy OVER-marks incomplete when a Text node
 * never actually draws (reveal=0 / opacity=0 / off-canvas) → a needless cache MISS
 * = a false-MISS = SAFE (the catastrophic direction is a false-HIT, which this
 * cannot produce).
 */
function drawnTextFamilies(scene: Scene): string[] {
  const out: string[] = [];
  for (const node of scene.nodes.values()) {
    const n = node as { fontFamily?: unknown; text?: unknown };
    if (typeof n.fontFamily !== 'string' || typeof n.text !== 'function') continue;
    const value = (n.text as () => unknown)();
    if (typeof value === 'string' && value) out.push(n.fontFamily);
  }
  return out;
}

/**
 * `complete` — does the cert fully capture EVERY font the scene DRAWS? (0.63.2.)
 * `false` when a drawn family is NOT content-addressed (a SYSTEM family, or a
 * partial capture) — its glyph bytes aren't in fontDigest, so a font/system change
 * can't move certHash → such a cert must never read/write the render cache. A scene
 * with no drawn text → `true` (legitimately no font determinant). `registeredFamilies`
 * is case-folded (as `prepareSkiaRenderEnv` emits), so we compare lower-cased.
 */
function fontComplete(drawnFamilies: readonly string[], registeredFamilies: ReadonlySet<string>): boolean {
  for (const family of drawnFamilies) {
    if (!registeredFamilies.has(family.toLowerCase())) return false;
  }
  return true;
}

/**
 * Build the frame-INDEPENDENT video-cert base from the resolved render inputs.
 * sceneHash/timelineHash come from @glissade/scene (the SAME canonicalization diff
 * uses — never a second one), so certKey⟺diff holds by construction.
 */
export async function buildVideoCertBase(inputs: VideoCertBaseInputs): Promise<VideoCertBase> {
  const { sceneHash, timelineHash } = await import('@glissade/scene/diagnostics');
  return {
    certVersion: CERT_VERSION,
    sceneHash: sceneHash(inputs.scene, inputs.doc),
    timelineHash: timelineHash(inputs.doc),
    narrationTimingHash: narrationTimingHash(inputs.narrationTimingPath),
    fontDigest: fontDigestFrom(inputs.assetDigests),
    captionBurnMode: inputs.captionBurnMode,
    toolchainHash: toolchainHash(inputs.root),
    backendHash: backendHash(inputs.capsId),
    renderConfig: inputs.renderConfig,
    complete: fontComplete(drawnTextFamilies(inputs.scene), inputs.registeredFamilies),
  };
}

/** Load + version-check a video-cert manifest from disk (for `gs render --verify`). */
export function loadVideoCertManifest(path: string): VideoCertManifest {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as VideoCertManifest;
  assertCertVersion(raw.certVersion);
  if (raw.kind !== 'video') throw new Error(`${path} is not a video-cert manifest (kind='${String(raw.kind)}')`);
  return raw;
}

/** The default manifest path beside a render output. */
export function certManifestPathFor(out: string): string {
  return `${out.replace(/\/$/, '')}.cert.json`;
}
