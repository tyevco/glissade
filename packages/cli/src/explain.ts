/**
 * gs explain <path> [--json] [--cert <manifest>] — a NON-mutating PROVENANCE READER
 * over the determinism certificate `gs render --certify` writes. It reads the cert
 * manifest (never a scene, never a render) and prints, in human-readable form, EXACTLY
 * what bytes a render is a function of: certVersion, sceneHash/timelineHash, fontDigest,
 * backendHash (platform-aware), toolchainHash, the render config, the frame count, and a
 * short per-frame byteHash summary. `--json` emits the structured object.
 *
 * PROVENANCE DISCIPLINE (surface-seat note): every hash is surfaced VERBATIM from the
 * manifest — this reader NEVER re-derives sceneHash/certHash a second way. The manifest's
 * sceneHash was written with the SAME canonical hash the IIFE-reachable `sceneHash(scene)`
 * exposes, so printing the stored value keeps provenance cross-checkable from either side
 * (a browser agent can compute `sceneHash()` on a reconstructed scene and compare to what
 * `gs explain` prints). Adding a re-derivation path would risk a format/compute drift.
 *
 * INPUT RESOLUTION:
 *   1. `<path>` ends in `.cert.json`             → load it directly.
 *   2. `<path>` is an artifact (out/ep.mp4, out/still.png) → the sibling
 *      `<path>.cert.json` (the render convention); fail loud if absent.
 *   3. `<path>` is a raw frame PNG + `--cert <manifest>` → load the manifest, hash the
 *      PNG the SAME way the cert does (sha256 of the PNG bytes = byteHashOf), and report
 *      which frame (if any) it is in the manifest.
 *
 * assertCertVersion runs FIRST (via loadVideoCertManifest) — fail-loud on an unknown /
 * future certVersion is the cert-reader discipline. Pure read of committed inputs → the
 * output carries NO wall-clock / timestamp (deterministic, byte-identical run-to-run).
 */

import { existsSync, readFileSync } from 'node:fs';
import {
  assertCertVersion,
  byteHashOf,
  certManifestPathFor,
  loadVideoCertManifest,
  type AudioCert,
  type FrameCertRecord,
  type VideoCertManifest,
} from './cert.js';

export interface ExplainOptions {
  /** the artifact / `.cert.json` / raw-frame-PNG path to explain. */
  path: string;
  /** emit the structured object instead of the human-readable report. */
  json?: boolean;
  /** a manifest to match a raw frame PNG against (`--cert`). */
  cert?: string;
}

/** A per-frame line in the structured summary (first / last / a matched frame). */
export interface ExplainFrameSummary {
  i: number;
  frameKey: string;
  certHash: string;
  byteHash: string;
}

/**
 * The sibling audio-cert's stored stem hashes (`<out>.audio-cert.json`). Surfaced
 * VERBATIM — the audio-cert stores ONLY these hashes + loudness (NO licenses, NO
 * narration-timing hash), so this reader invents neither.
 */
export interface AudioCertSummary {
  source: string;
  certVersion: number;
  narrationAudioHash: string;
  musicHash: string;
  sfxHash: string;
  loudness: string;
  certHash: string;
}

/** The result of matching a raw frame PNG against a manifest (`--cert`). */
export interface ExplainFrameMatch {
  matched: boolean;
  /** the sha256 of the PNG bytes (computed the SAME way the cert hashes a frame). */
  byteHash: string;
  /** the matching frame (present iff `matched`). */
  frame?: ExplainFrameSummary;
}

/** The structured provenance object (`--json`). Pure fn of the manifest — no timestamps. */
export interface ExplainJson {
  /** the cert manifest actually read. */
  source: string;
  certVersion: number;
  kind: 'video';
  sceneHash: string;
  timelineHash: string;
  narrationTimingHash: string;
  fontDigest: string;
  captionBurnMode: string;
  toolchainHash: string;
  backendHash: string;
  complete: boolean;
  renderConfig: VideoCertManifest['base']['renderConfig'];
  fps: number;
  /** total frames in the manifest. */
  frames: number;
  /** the whole-run duration in seconds (frames / fps), or 0 for an empty manifest. */
  durationSeconds: number;
  firstFrame?: ExplainFrameSummary;
  lastFrame?: ExplainFrameSummary;
  /** the sibling `<out>.audio-cert.json`'s stored stem hashes, when it exists. */
  audioCert?: AudioCertSummary;
  /** present only in the `--cert` raw-frame-PNG match mode. */
  frameMatch?: ExplainFrameMatch;
}

export interface ExplainResult {
  /** the report to print: the human-readable text, or the JSON string under `--json`. */
  report: string;
  /** the structured object (always populated). */
  data: ExplainJson;
}

const frameSummary = (f: FrameCertRecord): ExplainFrameSummary => ({
  i: f.i,
  frameKey: f.frameKey,
  certHash: f.certHash,
  byteHash: f.byteHash,
});

/** The `<out>.audio-cert.json` sidecar path for a `<out>.cert.json` manifest path. */
function audioCertPathFor(certPath: string): string {
  return certPath.endsWith('.cert.json')
    ? `${certPath.slice(0, -'.cert.json'.length)}.audio-cert.json`
    : `${certPath}.audio-cert.json`;
}

/**
 * Read the sibling audio-cert (if present) and surface its STORED stem hashes verbatim.
 * assertCertVersion runs first (fail-loud on an unknown audio-cert schema — the same
 * reader discipline). Returns undefined when no sidecar exists.
 */
function readAudioCert(certPath: string): AudioCertSummary | undefined {
  const audioPath = audioCertPathFor(certPath);
  if (!existsSync(audioPath)) return undefined;
  const a = JSON.parse(readFileSync(audioPath, 'utf8')) as AudioCert;
  assertCertVersion(a.certVersion);
  if (a.kind !== 'audio') throw new Error(`${audioPath} is not an audio-cert (kind='${String(a.kind)}')`);
  return {
    source: audioPath,
    certVersion: a.certVersion,
    narrationAudioHash: a.narrationAudioHash,
    musicHash: a.musicHash,
    sfxHash: a.sfxHash,
    loudness: a.loudness,
    certHash: a.certHash,
  };
}

/**
 * Resolve `<path>` to the cert manifest path to read, per the INPUT RESOLUTION rules.
 * In the raw-frame-PNG `--cert` mode the manifest is `opts.cert`; otherwise it's the
 * path itself (`.cert.json`) or its sibling (`<artifact>.cert.json`). Fails loud when a
 * sibling is expected but absent.
 */
function resolveCertPath(opts: ExplainOptions): { certPath: string; framePng?: string } {
  // Mode 3: a raw frame PNG matched against an explicit manifest.
  if (opts.cert !== undefined && opts.cert !== '' && opts.path.endsWith('.png')) {
    if (!existsSync(opts.cert)) {
      throw new Error(`no cert manifest at '${opts.cert}' (--cert) — pass the .cert.json 'gs render --certify' wrote`);
    }
    return { certPath: opts.cert, framePng: opts.path };
  }
  // Mode 1: an explicit `.cert.json`.
  if (opts.path.endsWith('.cert.json')) {
    if (!existsSync(opts.path)) throw new Error(`no cert manifest at '${opts.path}'`);
    return { certPath: opts.path };
  }
  // Mode 2: an artifact → its sibling `<path>.cert.json`.
  const sibling = certManifestPathFor(opts.path);
  if (!existsSync(sibling)) {
    throw new Error(
      `no cert manifest found for '${opts.path}' (looked for '${sibling}') — ` +
        'render with `gs render --certify` or pass a .cert.json',
    );
  }
  return { certPath: sibling };
}

/**
 * Read a cert manifest and assemble its provenance. Non-mutating. `loadVideoCertManifest`
 * runs `assertCertVersion` first (fail-loud on an unknown/future schema) — the reader
 * discipline — and rejects a non-video manifest.
 */
export function explainCommand(opts: ExplainOptions): ExplainResult {
  const { certPath, framePng } = resolveCertPath(opts);
  const manifest = loadVideoCertManifest(certPath); // assertCertVersion + kind check inside
  const { base, frames, fps } = manifest;
  const audioCert = readAudioCert(certPath);

  const data: ExplainJson = {
    source: certPath,
    certVersion: manifest.certVersion,
    kind: manifest.kind,
    sceneHash: base.sceneHash,
    timelineHash: base.timelineHash,
    narrationTimingHash: base.narrationTimingHash,
    fontDigest: base.fontDigest,
    captionBurnMode: base.captionBurnMode,
    toolchainHash: base.toolchainHash,
    backendHash: base.backendHash,
    complete: base.complete,
    renderConfig: base.renderConfig,
    fps,
    frames: frames.length,
    durationSeconds: fps > 0 ? frames.length / fps : 0,
    ...(audioCert !== undefined ? { audioCert } : {}),
    ...(frames.length > 0 ? { firstFrame: frameSummary(frames[0]!) } : {}),
    ...(frames.length > 0 ? { lastFrame: frameSummary(frames[frames.length - 1]!) } : {}),
  };

  // Mode 3: hash the PNG the SAME way the cert does (sha256 of the emitted PNG bytes)
  // and locate it in the manifest by byteHash.
  if (framePng !== undefined) {
    const byteHash = byteHashOf(readFileSync(framePng));
    const hit = frames.find((f) => f.byteHash === byteHash);
    data.frameMatch = {
      matched: hit !== undefined,
      byteHash,
      ...(hit !== undefined ? { frame: frameSummary(hit) } : {}),
    };
  }

  return { report: opts.json ? JSON.stringify(data, null, 2) : formatExplain(data), data };
}

const orNone = (v: string, none = '(none)'): string => (v === '' ? none : v);

/** The human-readable provenance report. Deterministic — no wall-clock / timestamps. */
export function formatExplain(d: ExplainJson): string {
  const rc = d.renderConfig;
  const lines: string[] = [
    'gs explain — determinism provenance (a pure read of the render cert)',
    `  source:              ${d.source}`,
    `  certVersion:         ${d.certVersion}  (kind: ${d.kind})`,
    `  sceneHash:           ${d.sceneHash}`,
    `  timelineHash:        ${d.timelineHash}`,
    `  fontDigest:          ${orNone(d.fontDigest, '(none — no content-addressed faces)')}`,
    `  backendHash:         ${d.backendHash}`,
    `  toolchainHash:       ${d.toolchainHash}`,
    `  narrationTimingHash: ${orNone(d.narrationTimingHash)}`,
    `  captionBurnMode:     ${d.captionBurnMode}`,
    `  renderConfig:        ${rc.width}x${rc.height} ${rc.pixelFormat}, imageSmoothing=${rc.imageSmoothing ? 'on' : 'off'}`,
    `  complete:            ${d.complete}  (every drawn font content-addressed?)`,
    `  fps:                 ${d.fps}`,
    `  duration:            ${d.durationSeconds}s  (${d.frames} frame${d.frames === 1 ? '' : 's'})`,
  ];
  if (d.frames === 0) {
    lines.push('  frames:              (none in this manifest)');
  } else if (d.firstFrame && d.lastFrame && d.firstFrame.i === d.lastFrame.i) {
    lines.push(`  frame:               #${d.firstFrame.i} (${d.firstFrame.frameKey})  byteHash ${d.firstFrame.byteHash}`);
  } else if (d.firstFrame && d.lastFrame) {
    lines.push(`  frames:              ${d.frames}`);
    lines.push(`    first  #${d.firstFrame.i} (${d.firstFrame.frameKey})  byteHash ${d.firstFrame.byteHash}`);
    lines.push(`    last   #${d.lastFrame.i} (${d.lastFrame.frameKey})  byteHash ${d.lastFrame.byteHash}`);
  }
  if (d.audioCert) {
    const a = d.audioCert;
    lines.push('  audio-cert:          present (sibling .audio-cert.json)');
    lines.push(`    narration ${orNone(a.narrationAudioHash)}`);
    lines.push(`    music     ${orNone(a.musicHash)}`);
    lines.push(`    sfx       ${orNone(a.sfxHash)}`);
    lines.push(`    loudness  ${orNone(a.loudness)}`);
    lines.push(`    certHash  ${a.certHash}`);
  } else {
    lines.push('  audio-cert:          none');
  }
  if (d.frameMatch) {
    lines.push('');
    lines.push('  frame match (--cert):');
    lines.push(`    byteHash ${d.frameMatch.byteHash}`);
    if (d.frameMatch.matched && d.frameMatch.frame) {
      lines.push(`    → frame #${d.frameMatch.frame.i} (${d.frameMatch.frame.frameKey}) of sceneHash ${d.sceneHash}`);
    } else {
      lines.push('    → no matching frame in the manifest');
    }
  }
  return lines.join('\n');
}
