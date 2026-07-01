/**
 * gs migrate (0.31): the describe()-driven engine-bump assistant.
 *
 * `describe()` (0.18) already pins version + node/prop taxonomy + import subpaths
 * + builder signatures per release. The DIFF between two manifests IS the
 * migration surface — so a bump from an old engine to the current one is not a
 * scary unreviewable batch, it's a structured, exhaustive report of exactly what
 * moved / was removed / was added / changed, generated FROM the real registry
 * (it cannot claim a move that didn't happen — the no-drift guarantee extends to
 * migration itself).
 *
 *   gs describe --out api-0.30.json          # snapshot THIS engine's API manifest
 *   gs migrate api-0.30.json                  # diff that baseline against the current engine
 *   gs migrate api-0.30.json --json           # machine-readable report (agent codemod input)
 *
 * This MVP is ADVISORY, not a source rewriter: it hands you the precise change
 * list (moved imports, removed symbols, signature changes) + a suggested action
 * per item, so a human or an agent applies the few edits that matter. It never
 * touches your files. (AST repointing is deliberately deferred — see card
 * 9ZF_IerMN4Ch v2: it needs jscodeshift/ts-morph and per-release manifest
 * history; the report here is the input that codemod would consume.)
 */

import type { ApiManifest, DescribedProp } from '@glissade/scene/describe';

export type ChangeKind = 'added' | 'removed' | 'moved' | 'changed';
export type ChangeCategory =
  | 'node'
  | 'prop'
  | 'helper'
  | 'builder'
  | 'valueType'
  | 'easing'
  | 'subpath';

export interface MigrationChange {
  readonly kind: ChangeKind;
  readonly category: ChangeCategory;
  /** The identity of the thing that changed — a node type, `Node.prop`, a helper/method name, a value-type id, a subpath entry. */
  readonly name: string;
  /** `true` when a consumer on the OLD engine could break (removed/moved/incompatible change); `false` for purely additive news. */
  readonly breaking: boolean;
  /** One line: what changed. */
  readonly detail: string;
  /** A suggested fix, when there's an obvious one (e.g. the new import subpath). Present only on breaking, actionable items. */
  readonly action?: string;
}

export interface MigrationReport {
  /** The baseline manifest's version (what you're migrating FROM). */
  readonly from: string;
  /** The current engine's version (what you're migrating TO). */
  readonly to: string;
  readonly changes: readonly MigrationChange[];
  readonly summary: {
    readonly breaking: number;
    readonly additive: number;
    readonly total: number;
  };
}

/** Stable-sorted keys of a plain record (deterministic report order — no Object.keys insertion-order surprises). */
function keys(obj: { readonly [k: string]: unknown } | undefined): string[] {
  return obj ? Object.keys(obj).sort() : [];
}

/** Compare one node's prop against its old shape; push any material changes. */
function diffProp(
  nodeName: string,
  propName: string,
  from: DescribedProp,
  to: DescribedProp,
  out: MigrationChange[],
): void {
  const id = `${nodeName}.${propName}`;
  if (from.type !== to.type) {
    out.push({
      kind: 'changed',
      category: 'prop',
      name: id,
      breaking: true,
      detail: `value type ${from.type} → ${to.type}`,
      action: `a Track on ${id} now expects a ${to.type} value — VERIFY every keyframe`,
    });
  }
  // animatable:false → true is additive (new capability); true → false is breaking
  // (a Track that used to drive this prop no longer resolves).
  if (from.animatable && !to.animatable) {
    out.push({
      kind: 'changed',
      category: 'prop',
      name: id,
      breaking: true,
      detail: `no longer animatable (was driven by target '${from.target ?? id}')`,
      action: `remove or re-home the Track targeting '${from.target ?? id}'`,
    });
  } else if (!from.animatable && to.animatable) {
    out.push({
      kind: 'changed',
      category: 'prop',
      name: id,
      breaking: false,
      detail: `now animatable via target '${to.target ?? id}'`,
    });
  }
}

/**
 * Diff two describe() manifests into a structured, deterministic migration
 * report. Pure: same (from, to) → same report, in stable name order. This is the
 * whole engine — the CLI just loads the two manifests and formats this.
 */
export function diffManifests(from: ApiManifest, to: ApiManifest): MigrationReport {
  const out: MigrationChange[] = [];

  // A baseline older than a given describe() field WON'T HAVE that field — helpers
  // were added after 0.19, builder/valueTypes/easings could be absent on an even
  // older manifest. The whole point of migrate is deep jumps, so treat EVERY
  // collection as possibly-missing on either side (missing ⇒ empty, never throw).
  const fromNodes = from.nodes ?? {};
  const toNodes = to.nodes ?? {};

  // ── nodes (+ their props) ──────────────────────────────────────────────
  for (const name of keys(fromNodes)) {
    const a = fromNodes[name];
    const b = toNodes[name];
    if (a === undefined) continue;
    if (b === undefined) {
      out.push({
        kind: 'removed',
        category: 'node',
        name,
        breaking: true,
        detail: `node type removed (was imported from ${a.subpath ?? '@glissade/scene'})`,
        action: `this node no longer exists — replace it or pin the last engine that had it`,
      });
      continue;
    }
    if ((a.subpath ?? '') !== (b.subpath ?? '')) {
      const toPath = b.subpath ?? '@glissade/scene';
      out.push({
        kind: 'moved',
        category: 'node',
        name,
        breaking: true,
        detail: `import moved ${a.subpath ?? '@glissade/scene'} → ${toPath}`,
        action: `import { ${name} } from '${toPath}'`,
      });
    }
    for (const p of keys(a.props)) {
      const pa = a.props[p];
      const pb = b.props[p];
      if (pa === undefined) continue;
      if (pb === undefined) {
        out.push({
          kind: 'removed',
          category: 'prop',
          name: `${name}.${p}`,
          breaking: true,
          detail: `prop removed`,
          action: `remove '${p}' from ${name}(...) — it's no longer a recognized prop`,
        });
        continue;
      }
      diffProp(name, p, pa, pb, out);
    }
    for (const p of keys(b.props)) {
      if (a.props[p] === undefined) {
        out.push({
          kind: 'added',
          category: 'prop',
          name: `${name}.${p}`,
          breaking: false,
          detail: `new prop (${b.props[p]?.animatable ? 'animatable' : 'construction-only'})`,
        });
      }
    }
  }
  for (const name of keys(toNodes)) {
    if (fromNodes[name] === undefined) {
      const sp = toNodes[name]?.subpath ?? '@glissade/scene';
      out.push({
        kind: 'added',
        category: 'node',
        name,
        breaking: false,
        detail: `new node type (import from ${sp})`,
      });
    }
  }

  // ── helpers (by name) — the tokenHighlight / motionPath import-move case ─
  const fromHelpers = new Map((from.helpers ?? []).map((h) => [h.name, h]));
  const toHelpers = new Map((to.helpers ?? []).map((h) => [h.name, h]));
  for (const name of [...fromHelpers.keys()].sort()) {
    const a = fromHelpers.get(name)!;
    const b = toHelpers.get(name);
    if (b === undefined) {
      out.push({
        kind: 'removed',
        category: 'helper',
        name,
        breaking: true,
        detail: `helper removed (was imported from ${a.import})`,
        action: `this helper no longer exists — replace it or pin the last engine that had it`,
      });
      continue;
    }
    if (a.import !== b.import) {
      out.push({
        kind: 'moved',
        category: 'helper',
        name,
        breaking: true,
        detail: `import moved ${a.import} → ${b.import}`,
        action: `import { ${name} } from '${b.import}'`,
      });
    }
    if (a.usage !== b.usage) {
      out.push({
        kind: 'changed',
        category: 'helper',
        name,
        breaking: true,
        detail: `signature changed: ${a.usage} → ${b.usage}`,
        action: `update call sites of ${name}(...) to the new shape — VERIFY`,
      });
    }
  }
  for (const name of [...toHelpers.keys()].sort()) {
    if (!fromHelpers.has(name)) {
      out.push({
        kind: 'added',
        category: 'helper',
        name,
        breaking: false,
        detail: `new helper (import from ${toHelpers.get(name)!.import})`,
      });
    }
  }

  // ── builder methods (by name) ──────────────────────────────────────────
  const fromB = new Map((from.builder?.methods ?? []).map((m) => [m.name, m]));
  const toB = new Map((to.builder?.methods ?? []).map((m) => [m.name, m]));
  for (const name of [...fromB.keys()].sort()) {
    const a = fromB.get(name)!;
    const b = toB.get(name);
    if (b === undefined) {
      out.push({
        kind: 'removed',
        category: 'builder',
        name: `tl.${name}`,
        breaking: true,
        detail: `builder method removed`,
        action: `tl.${name}(...) no longer exists — replace it`,
      });
      continue;
    }
    if (a.signature !== b.signature) {
      out.push({
        kind: 'changed',
        category: 'builder',
        name: `tl.${name}`,
        breaking: true,
        detail: `signature changed: ${a.signature} → ${b.signature}`,
        action: `update tl.${name}(...) call sites to the new signature — VERIFY`,
      });
    }
  }
  for (const name of [...toB.keys()].sort()) {
    if (!fromB.has(name)) {
      out.push({
        kind: 'added',
        category: 'builder',
        name: `tl.${name}`,
        breaking: false,
        detail: `new builder method`,
      });
    }
  }

  // ── value types, easings, subpaths (flat string sets) ──────────────────
  diffStringSet('valueType', from.valueTypes ?? [], to.valueTypes ?? [], out);
  diffStringSet('easing', from.easings ?? [], to.easings ?? [], out);
  diffStringSet('subpath', keys(from.subpaths), keys(to.subpaths), out);

  const breaking = out.filter((c) => c.breaking).length;
  return {
    from: from.version,
    to: to.version,
    changes: out,
    summary: { breaking, additive: out.length - breaking, total: out.length },
  };
}

/** Diff two flat string lists (value types / easings / subpath entries): removed = breaking, added = additive. */
function diffStringSet(
  category: ChangeCategory,
  from: readonly string[],
  to: readonly string[],
  out: MigrationChange[],
): void {
  const toSet = new Set(to);
  const fromSet = new Set(from);
  for (const name of [...from].sort()) {
    if (!toSet.has(name)) {
      out.push({
        kind: 'removed',
        category,
        name,
        breaking: true,
        detail: `${category} removed`,
        action: `'${name}' is no longer a registered ${category} — replace it`,
      });
    }
  }
  for (const name of [...to].sort()) {
    if (!fromSet.has(name)) {
      out.push({ kind: 'added', category, name, breaking: false, detail: `new ${category}` });
    }
  }
}

const KIND_MARK: { readonly [k in ChangeKind]: string } = {
  moved: '→',
  removed: '✗',
  changed: '~',
  added: '+',
};

/** Render a report as grouped, human-readable text (the default CLI output). */
export function formatReport(r: MigrationReport): string {
  const lines: string[] = [];
  lines.push(`gs migrate: ${r.from} → ${r.to}`);
  if (r.changes.length === 0) {
    lines.push('  no API changes — nothing to migrate. ✓');
    return lines.join('\n');
  }
  lines.push(
    `  ${r.summary.breaking} breaking · ${r.summary.additive} additive · ${r.summary.total} total`,
  );
  const breaking = r.changes.filter((c) => c.breaking);
  const additive = r.changes.filter((c) => !c.breaking);
  if (breaking.length > 0) {
    lines.push('');
    lines.push('BREAKING — action needed:');
    for (const c of breaking) {
      lines.push(`  ${KIND_MARK[c.kind]} [${c.category}] ${c.name}: ${c.detail}`);
      if (c.action !== undefined) lines.push(`      ↳ ${c.action}`);
    }
  }
  if (additive.length > 0) {
    lines.push('');
    lines.push('ADDITIVE — new in this engine:');
    for (const c of additive) {
      lines.push(`  ${KIND_MARK[c.kind]} [${c.category}] ${c.name}: ${c.detail}`);
    }
  }
  return lines.join('\n');
}
