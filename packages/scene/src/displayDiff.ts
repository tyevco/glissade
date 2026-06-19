/**
 * DisplayList diff + serializable IR snapshots (DESIGN.md §3.3, §7.4) — the
 * determinism-diagnostic substrate. Operates on the already-pure DisplayList IR
 * (no raster, no audio): it turns an opaque golden-hash mismatch into a
 * command-level explanation.
 *
 * `diffDisplayLists(a, b)` returns INDEX-ALIGNED, POSITIONAL command-stream
 * deltas — command index i in `a` is compared to command index i in `b`. This
 * is deliberately simpler than an LCS/Myers alignment: a single insert or
 * remove early in the stream cascades into a run of "changed" entries from that
 * point on (a known v1 ergonomics cliff — see DESIGN §3.3). Smarter alignment
 * is DEFERRED.
 *
 * DrawCommands carry no node id (adding one is an IR change that ripples into
 * every backend + the cacheKey/parity goldens), so this diff is op/field-level,
 * never node-attributed.
 *
 * This module is a DEV / CLI diagnostic tool: it has no module-level side
 * effects and is never reached by `evaluate()`, so it TREE-SHAKES out of the
 * base embed bundle (mirrors `cacheColdAudit`).
 */

import type { DisplayList, DrawCommand, Resource } from './displayList.js';

/**
 * The collapse-replacer shared by the cacheKey serializer
 * (`createDisplayListBuilder().cacheKey`), `cacheColdAudit.hashDisplayList`,
 * and `serializeDisplayList` here. CRITICAL: this is BYTE-PRESERVING — the
 * cacheKey it backs stamps into pushGroup and keys the §3.5 raster cache, so
 * its output must not move. The three call sites previously DUPLICATED this
 * byte-for-byte; it lives here once.
 *
 *  - ArrayBuffer / typed-array views collapse to a `ab:<len>` / `view:<len>`
 *    length marker (opaque binary never belongs in a structural key).
 *  - Functions drop (JSON would already drop them; explicit for parity).
 *
 * NOTE: `-0` is intentionally NOT normalized here. The matrix layer
 * (`matrix.ts`) already normalizes `-0 → 0` at the source, and adding a `-0`
 * pass to THIS replacer would change the cacheKey bytes for any list that ever
 * carried a raw `-0` — silently invalidating the cache cluster-wide. Byte
 * preservation wins; the regression guard pins the exact key.
 */
export function collapseReplacer(_key: string, value: unknown): unknown {
  if (value instanceof ArrayBuffer) return `ab:${value.byteLength}`;
  if (ArrayBuffer.isView(value)) return `view:${(value as ArrayBufferView).byteLength}`;
  if (typeof value === 'function') return undefined;
  return value;
}

/**
 * One index-aligned, positional delta between two DisplayList command streams.
 *
 * This is the natural per-command shape that `gs verify-determinism --bisect`
 * (a later card) will consume to drill a cache-cold divergence down to the
 * exact op/field. Keep it stable.
 */
export interface CommandDelta {
  /** Positional command index in BOTH lists (or the longer one for add/remove). */
  index: number;
  /**
   *  - `change`  — same index present in both, but the commands differ.
   *  - `add`     — present in `b` only (b is longer past this index).
   *  - `remove`  — present in `a` only (a is longer past this index).
   */
  kind: 'change' | 'add' | 'remove';
  /** op of the `a` command (undefined for `add`). */
  opA?: DrawCommand['op'];
  /** op of the `b` command (undefined for `remove`). */
  opB?: DrawCommand['op'];
  /**
   * Field-level changes when both ops match (op changed → a single `op` field).
   * Each entry names the changed prop path with its `from`/`to` JSON values.
   */
  fields: FieldChange[];
}

export interface FieldChange {
  /** dotted field path within the command, e.g. `paint.color`, `m`, `text`, `filters`. */
  path: string;
  from: unknown;
  to: unknown;
}

export interface DisplayDiff {
  /** true when the two lists are byte-identical (the §3.3 determinism contract holds). */
  equal: boolean;
  /** per-command positional deltas, in index order (empty iff `equal`). */
  deltas: CommandDelta[];
  /** size mismatch, when the canvases differ (rare, but a real divergence). */
  size?: { from: DisplayList['size']; to: DisplayList['size'] };
}

/** A flat, stable JSON value for one command with its resource ids INLINED to content. */
function commandView(cmd: DrawCommand, resources: readonly Resource[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cmd)) {
    out[k] = v;
  }
  // Inline referenced resources by CONTENT so a diff reflects geometry/asset
  // identity, not list-local interned ids (which two diverging lists won't
  // share). Mirrors the cacheKey's id→content inlining.
  if (cmd.op === 'clip' || cmd.op === 'fillPath' || cmd.op === 'strokePath') {
    out['path'] = resources[(cmd as { path: number }).path];
  } else if (cmd.op === 'drawImage') {
    out['image'] = resources[cmd.image];
  }
  return out;
}

const stable = (v: unknown): string => JSON.stringify(v, collapseReplacer);

/** Field-level diff of two same-op command views (shallow over top-level props). */
function diffFields(a: Record<string, unknown>, b: Record<string, unknown>): FieldChange[] {
  const changes: FieldChange[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === 'op') continue;
    if (stable(a[k]) !== stable(b[k])) {
      changes.push({ path: k, from: a[k], to: b[k] });
    }
  }
  return changes;
}

/**
 * Index-aligned positional diff of two DisplayLists. Command i in `a` is
 * compared to command i in `b`; trailing commands become `add`/`remove`. A
 * single insert/remove cascades — this is the documented v1 cliff.
 */
export function diffDisplayLists(a: DisplayList, b: DisplayList): DisplayDiff {
  const deltas: CommandDelta[] = [];
  const n = Math.max(a.commands.length, b.commands.length);
  for (let i = 0; i < n; i++) {
    const ca = a.commands[i];
    const cb = b.commands[i];
    if (ca !== undefined && cb !== undefined) {
      const va = commandView(ca, a.resources);
      const vb = commandView(cb, b.resources);
      if (stable(va) === stable(vb)) continue;
      if (ca.op !== cb.op) {
        deltas.push({
          index: i,
          kind: 'change',
          opA: ca.op,
          opB: cb.op,
          fields: [{ path: 'op', from: ca.op, to: cb.op }],
        });
      } else {
        deltas.push({ index: i, kind: 'change', opA: ca.op, opB: cb.op, fields: diffFields(va, vb) });
      }
    } else if (cb !== undefined) {
      deltas.push({ index: i, kind: 'add', opB: cb.op, fields: [] });
    } else if (ca !== undefined) {
      deltas.push({ index: i, kind: 'remove', opA: ca.op, fields: [] });
    }
  }
  const sizeDiffers = a.size.w !== b.size.w || a.size.h !== b.size.h;
  return {
    equal: deltas.length === 0 && !sizeDiffers,
    deltas,
    ...(sizeDiffers ? { size: { from: a.size, to: b.size } } : {}),
  };
}

/** Human-readable, multi-line rendering of a DisplayDiff (CLI command-tree). */
export function formatDisplayDiff(diff: DisplayDiff): string {
  if (diff.equal) return 'DisplayLists are identical.';
  const lines: string[] = [];
  if (diff.size) {
    lines.push(
      `size  ${diff.size.from.w}x${diff.size.from.h} -> ${diff.size.to.w}x${diff.size.to.h}`,
    );
  }
  for (const d of diff.deltas) {
    if (d.kind === 'add') {
      lines.push(`+ [${d.index}] add    ${d.opB ?? '?'}`);
    } else if (d.kind === 'remove') {
      lines.push(`- [${d.index}] remove ${d.opA ?? '?'}`);
    } else {
      const op = d.opA === d.opB ? d.opA : `${d.opA ?? '?'} -> ${d.opB ?? '?'}`;
      lines.push(`~ [${d.index}] ${op}`);
      for (const f of d.fields) {
        lines.push(`      ${f.path}: ${stable(f.from)} -> ${stable(f.to)}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * The `.dl.json` snapshot interchange schema (DESIGN §7.4). Users commit
 * `.dl.json` baselines, so this carries the SAME break-policy obligation as
 * `Timeline.version` and `SidecarDoc.sidecarVersion`: bump on a breaking shape
 * change. Independent of the API version.
 */
export const DL_SNAPSHOT_VERSION = 1 as const;

export interface DlSnapshot {
  /** Interchange schema version (§7.4) — the third versioned interchange document. */
  dlSnapshotVersion: typeof DL_SNAPSHOT_VERSION;
  size: DisplayList['size'];
  commands: DrawCommand[];
  resources: Resource[];
}

/**
 * Serialize a DisplayList to a stable `.dl.json` document string (reusing the
 * byte-preserving collapse-replacer). Round-trips through `parseDisplaySnapshot`.
 */
export function serializeDisplayList(dl: DisplayList): string {
  const snapshot: DlSnapshot = {
    dlSnapshotVersion: DL_SNAPSHOT_VERSION,
    size: dl.size,
    commands: dl.commands,
    resources: dl.resources,
  };
  return JSON.stringify(snapshot, collapseReplacer, 2);
}

export class DlSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DlSnapshotError';
  }
}

/** Parse a `.dl.json` snapshot back into a DisplayList (validates the version). */
export function parseDisplaySnapshot(json: string): DisplayList {
  const doc = JSON.parse(json) as Partial<DlSnapshot>;
  if (doc.dlSnapshotVersion !== DL_SNAPSHOT_VERSION) {
    throw new DlSnapshotError(
      `unsupported dlSnapshotVersion ${String(doc.dlSnapshotVersion)}; this build reads ${DL_SNAPSHOT_VERSION}`,
    );
  }
  if (!doc.size || !Array.isArray(doc.commands) || !Array.isArray(doc.resources)) {
    throw new DlSnapshotError('malformed .dl.json snapshot (need size, commands[], resources[])');
  }
  return { size: doc.size, commands: doc.commands, resources: doc.resources };
}
