// @glissade/core/i18n — the 0.14 localization core: build-time + prepare-time
// sugar that resolves a scene's strings against a per-locale message table.
//
// Nothing here runs on the evaluate() path: `t()` is build-time sugar (like
// `clip`), `localize()` is a PURE doc→doc resolver, and `requireParity()` is a
// PURE id-set diff. The no-flag (base-locale) render path resolves the BASE
// files and is byte-identical to today — every locale is opt-in. Lives on a
// tree-shakeable sub-path off the base index so the resolver bytes never land
// on the embed budget.

import type { Timeline } from './timeline.js';
import type { Track } from './track.js';

// ---- piece 1: requireParity — a PURE cross-locale id-set diff ----

/** A locale's id manifest: the message ids it declares (narrate owns producing it). */
export interface LocaleManifest {
  locale: string;
  ids: readonly string[];
}

export class ParityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParityError';
  }
}

/**
 * Assert every supplied locale declares the SAME id set — the cross-language
 * analogue of `narration().require`. Throws a `ParityError` listing, per locale,
 * every id that is MISSING (present in the union but not this locale) or EXTRA
 * (present here but in no shared reference). A pure function of its inputs — no
 * time, no filesystem. The reference set is the UNION of every locale's ids, so
 * the report names each gap exactly once per affected locale.
 *
 * Ship-alone-able: the smallest blast radius of the four pieces. One manifest
 * (or zero) is trivially in parity.
 */
export function requireParity(...manifests: LocaleManifest[]): void {
  if (manifests.length < 2) return;

  // the reference id set: the union across every locale (sorted for stable reports)
  const union = new Set<string>();
  for (const m of manifests) for (const id of m.ids) union.add(id);

  const problems: string[] = [];
  for (const m of manifests) {
    const have = new Set(m.ids);
    const missing = [...union].filter((id) => !have.has(id)).sort();
    // an "extra" id is one this locale declares that no OTHER locale declares —
    // i.e. it is the sole reason that id is in the union (still a parity break)
    const extra = [...have]
      .filter((id) => manifests.every((other) => other === m || !other.ids.includes(id)))
      .sort();
    if (missing.length > 0 || extra.length > 0) {
      const parts: string[] = [];
      if (missing.length > 0) parts.push(`missing ${missing.map((id) => `'${id}'`).join(', ')}`);
      if (extra.length > 0) parts.push(`extra ${extra.map((id) => `'${id}'`).join(', ')}`);
      problems.push(`  ${m.locale}: ${parts.join('; ')}`);
    }
  }

  if (problems.length > 0) {
    throw new ParityError(
      `locale parity mismatch across ${manifests.length} locales:\n${problems.join('\n')}`,
    );
  }
}

// ---- piece 2: localize — a PURE doc→doc message resolver ----

/** A flat message table: id → localized string (the `messages.<locale>.json` shape). */
export type MessageTable = Record<string, string>;

export interface LocalizeOptions {
  /** the locale being resolved (carried for error context only; no behavior depends on it). */
  locale: string;
}

export class LocalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalizationError';
  }
}

/** The node-id of a track target ('<nodeId>/<prop.path>' → '<nodeId>'). */
function nodeIdOf(target: string): string {
  const slash = target.indexOf('/');
  return slash >= 0 ? target.slice(0, slash) : target;
}

/**
 * Resolve a timeline document against a message `table`, returning a NEW doc
 * (the input is never mutated). For every STRING track whose target node-id is a
 * key in `table` — caption + narration-derived text tracks live in the doc as
 * exactly these string tracks — every key's `value` is replaced with the table's
 * localized string. Tracks whose node-id is absent from the table pass through
 * untouched, byte-identical.
 *
 * Pure: no playhead, no time, no filesystem. The base-locale table (or an empty
 * table) leaves the doc structurally identical to the input.
 */
export function localize(doc: Timeline, table: MessageTable, _opts: LocalizeOptions): Timeline {
  let changed = false;
  const tracks = doc.tracks.map((tr): Track => {
    if (tr.type !== 'string') return tr;
    const id = nodeIdOf(tr.target);
    if (!(id in table)) return tr;
    const localized = table[id]!;
    changed = true;
    return {
      ...tr,
      keys: (tr.keys as Track<string>['keys']).map((k) =>
        k.value === localized ? k : { ...k, value: localized },
      ),
    };
  });
  if (!changed) return { ...doc };
  return { ...doc, tracks };
}

// ---- piece 3: t() — build-time sugar over the AMBIENT message table ----

let ambientTable: MessageTable | undefined;

/**
 * Install the ambient message table consulted by `t()`. Called ONCE before
 * scene construction (the render entry injects it from `--locale`). Pass
 * `undefined` to clear it (the base-locale / no-flag path leaves it unset).
 */
export function setMessageTable(table: MessageTable | undefined): void {
  ambientTable = table;
}

/** The currently installed ambient message table (undefined when none is set). */
export function getMessageTable(): MessageTable | undefined {
  return ambientTable;
}

/**
 * Resolve a free-standing message `id` against the ambient table — build-time
 * sugar for static Text-node text (text that is NOT animated by a doc track,
 * so `localize()` can't reach it): `new Text({ text: t('hero.title') })`.
 *
 * HARD-FAILS (throws) on an unknown id, mirroring `require()` — a stale or
 * mistyped id is a build error, never a silent empty string. When NO ambient
 * table is installed (the base / no-flag path), `t(id)` returns `id` verbatim,
 * so an un-localized build renders its keys as authored and stays byte-identical.
 */
export function t(id: string): string {
  if (ambientTable === undefined) return id;
  const value = ambientTable[id];
  if (value === undefined) {
    throw new LocalizationError(
      `t('${id}'): no message for id '${id}' in the active message table ` +
        `(have: ${Object.keys(ambientTable).map((k) => `'${k}'`).join(', ') || '<empty>'})`,
    );
  }
  return value;
}
