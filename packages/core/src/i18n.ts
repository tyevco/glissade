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

// A structural mirror of node's AsyncLocalStorage<T> — typed locally so this
// module never STATICALLY imports `node:async_hooks` (the standalone i18n bundle
// is measured browser-target by check-size; a static node-builtin import fails to
// resolve there). The real class is loaded via a dynamic import in
// `runWithMessageTable` (the sole render-path entry that needs it), mirroring how
// fontIngest lazily imports `node:fs`. Off the evaluate/embed path entirely.
interface AsyncLocalStorageLike<T> {
  run<R>(store: T, fn: () => R): R;
  getStore(): T | undefined;
}

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
  // 0.15 FIX 4: a within-manifest duplicate ({en:['a','a','b']}) is swallowed by
  // the Set-based union/diff below (the dup collapses, so the id-set still matches
  // every other locale). Catch it FIRST, per manifest, before the cross-locale diff
  // — and run even for a single (or zero) manifest, where the union diff never fires.
  for (const m of manifests) {
    if (new Set(m.ids).size !== m.ids.length) {
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const id of m.ids) {
        if (seen.has(id)) dups.push(id);
        else seen.add(id);
      }
      // de-dup + sort the dup list itself (a triple-dup would otherwise repeat)
      const uniqueDups = [...new Set(dups)].sort();
      throw new ParityError(
        `locale '${m.locale}' declares duplicate id(s): ${uniqueDups.map((id) => `'${id}'`).join(', ')} — ` +
          `each message id must appear once per manifest.`,
      );
    }
  }

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
  /**
   * Message ids ALREADY consumed outside the doc — the free-standing `t()` ids
   * resolved at module-eval / createScene() time (`getConsumedMessageIds()`).
   * `localize` folds these into the "matched keys" set so the orphaned-key check
   * (0.14 FIX 5) doesn't flag a legitimate `t()` key as unmatched. Omit when there
   * is no ambient `t()` usage (then only node-id keys count as matched).
   *
   * 0.15 FIX 2: this set ALSO drives the key-collision guard — a table key that is
   * BOTH a `t()` id (in here) AND a node-id with a string track is ambiguous (the
   * two id-spaces would silently fight over the same key, with the node-track swap
   * winning), so `localize` throws a `LocalizationError` rather than guess.
   */
  consumedIds?: ReadonlySet<string> | undefined;
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
 *
 * 0.14 FIX 5: a table key matching NO consumed id (neither a string-track
 * node-id NOR a `t()` id passed via `opts.consumedIds`) is a stale/typo'd key that
 * would silently never localize anything — so `localize` throws a `LocalizationError`
 * naming every orphaned key (the inverse of `t()`'s hard-fail). A fully-matched
 * table is silent.
 *
 * 0.15 FIX 1 (multi-cue collapse): broadcasting one table string across EVERY key
 * of a string track freezes a single caption over a multi-cue track (>1 distinct
 * keyed value). A multi-cue caption must be regenerated per-locale (locale-tagged
 * narration), never collapsed — so a matched track with >1 distinct key value
 * HARD-THROWS, naming the id. A single-value / single-key track localizes fine.
 *
 * 0.15 FIX 2 (key collision): a table key that is BOTH a node-id-with-a-string-
 * track AND a `t()` id (`opts.consumedIds`) is ambiguous — the two id-spaces would
 * silently fight over the same flat key. `localize` HARD-THROWS on any such key
 * rather than let the node-track swap silently win. The flat `messages.<locale>.json`
 * shape is UNCHANGED; this is a pure additive guard.
 */
export function localize(doc: Timeline, table: MessageTable, opts: LocalizeOptions): Timeline {
  let changed = false;
  // node-ids this localize walk actually consumes (matched a string track)
  const consumed = new Set<string>();
  const tracks = doc.tracks.map((tr): Track => {
    if (tr.type !== 'string') return tr;
    const id = nodeIdOf(tr.target);
    if (!(id in table)) return tr;

    // 0.15 FIX 2: a key consumed by BOTH the node-track space AND the t() space is
    // ambiguous — refuse to silently rewrite the node's track out from under t().
    if (opts.consumedIds?.has(id)) {
      throw new LocalizationError(
        `message table for locale '${opts.locale}' has an AMBIGUOUS key '${id}' — it matches BOTH a ` +
          `string track on node '${id}' AND a free-standing t('${id}') id. The flat table can't serve ` +
          `both id-spaces from one key. Rename one of them so the key resolves a single target.`,
      );
    }

    // 0.15 FIX 1: a multi-cue caption (>1 DISTINCT keyed value) can't be localized
    // by broadcasting one string — that would freeze a single caption over the whole
    // track. Per-locale narration regen is the correct path for multi-cue text.
    const distinctValues = new Set(
      (tr.keys as Track<string>['keys']).map((k) => k.value),
    );
    if (distinctValues.size > 1) {
      throw new LocalizationError(
        `message table for locale '${opts.locale}' targets node '${id}', whose string track has ` +
          `${distinctValues.size} distinct keyed values (a multi-cue caption). Broadcasting one table ` +
          `string would freeze a single caption over the whole track. Regenerate this locale's narration ` +
          `(a locale-tagged '<base>.${opts.locale}.narration.timing.json') instead of localizing the multi-cue track via the message table.`,
      );
    }

    consumed.add(id);
    const localized = table[id]!;
    changed = true;
    return {
      ...tr,
      keys: (tr.keys as Track<string>['keys']).map((k) =>
        k.value === localized ? k : { ...k, value: localized },
      ),
    };
  });

  // orphaned-key guard: every table key must be matched by SOME consumer —
  // either a node-id consumed here, or a `t()` id resolved at module-eval time.
  const orphans = Object.keys(table)
    .filter((key) => !consumed.has(key) && !(opts.consumedIds?.has(key) ?? false))
    .sort();
  if (orphans.length > 0) {
    throw new LocalizationError(
      `message table for locale '${opts.locale}' has ${orphans.length} key(s) that match no node-id ` +
        `and no t() id: ${orphans.map((k) => `'${k}'`).join(', ')} — a stale/typo'd key would silently ship base text. ` +
        `Remove the key, or fix it to match a target id.`,
    );
  }

  if (!changed) return { ...doc };
  return { ...doc, tracks };
}

// ---- piece 3: t() — build-time sugar over the AMBIENT message table ----

/**
 * The ambient localization state `t()` consults: the active table plus the ids it
 * has resolved against it. 0.15 FIX 3 isolates this per async flow so concurrent
 * programmatic renders for DIFFERENT locales don't cross-contaminate.
 */
interface AmbientScope {
  table: MessageTable | undefined;
  consumedIds: Set<string>;
}

// The process-global scope: what `setMessageTable` writes and the CLI one-shot
// reads. Used whenever execution is NOT inside a `runWithMessageTable` flow.
const globalScope: AmbientScope = { table: undefined, consumedIds: new Set<string>() };

// 0.15 FIX 3: parallel embedders that drive several `render()`/`loadSceneModule`
// calls concurrently (one per locale) shared this process-global state, so a `t()`
// in flow A could read flow B's table → wrong-language static Text. An
// AsyncLocalStorage scope gives each flow its own isolated table + consumed set;
// `t()` reads the ALS scope when one is active, falling back to the global scope.
// Lazily instantiated (dynamic node import) the first time `runWithMessageTable`
// is called — unset on the CLI one-shot / browser path, where the global wins.
let ambientStore: AsyncLocalStorageLike<AmbientScope> | undefined;

/** The scope `t()` should read: the ALS-scoped one if active, else the global one. */
function activeScope(): AmbientScope {
  return ambientStore?.getStore() ?? globalScope;
}

/**
 * Install the ambient message table consulted by `t()` on the PROCESS-GLOBAL
 * scope. Called ONCE before scene construction (the render entry injects it from
 * `--locale`). Pass `undefined` to clear it (the base-locale / no-flag path leaves
 * it unset). Resets the consumed-id set (a fresh table = a fresh resolution pass).
 *
 * 0.15 FIX 3: for CONCURRENT renders of different locales, prefer
 * `runWithMessageTable` — this global setter races across interleaved flows.
 */
export function setMessageTable(table: MessageTable | undefined): void {
  globalScope.table = table;
  globalScope.consumedIds = new Set<string>();
}

/**
 * Run `fn` with `table` installed as the ambient message table for the DURATION
 * of `fn`'s async flow only — isolated from the process-global scope and from any
 * other concurrent flow (0.15 FIX 3). `t()` inside `fn` (and anything it awaits)
 * resolves against `table`; `t()` outside it is unaffected. Resolves to `fn`'s
 * result. The render entry can scope the whole `loadSceneModule`→`localize` flow
 * per locale with this so parallel embedders never cross-contaminate. The
 * consumed-id set is collected per scope and is readable with
 * `getConsumedMessageIds()` inside `fn`.
 *
 * Async because the AsyncLocalStorage class is loaded via a dynamic `node` import
 * on first use (so this prepare/render-path module never statically pulls in
 * `node:async_hooks`); the ALS context still spans `fn` and everything it awaits.
 */
export async function runWithMessageTable<T>(
  table: MessageTable | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (ambientStore === undefined) {
    // Loaded lazily via a dynamic import so this module never STATICALLY pulls in
    // `node:async_hooks` (mirrors fontIngest's lazy `node:fs`). The check-size
    // bundler externalizes node builtins for this off-embed subpath, so the
    // browser-target measurement never tries to resolve it.
    const { AsyncLocalStorage } = (await import('node:async_hooks')) as unknown as {
      AsyncLocalStorage: new <S>() => AsyncLocalStorageLike<S>;
    };
    // a concurrent first call may have set it while we awaited — keep the first
    ambientStore ??= new AsyncLocalStorage<AmbientScope>();
  }
  return ambientStore.run({ table, consumedIds: new Set<string>() }, fn) as Promise<T>;
}

/** The currently installed ambient message table (undefined when none is set). */
export function getMessageTable(): MessageTable | undefined {
  return activeScope().table;
}

/**
 * Run `fn` while PRESERVING the process-global ambient scope across it (0.15 FIX 3).
 * `fn` may freely call `setMessageTable` / `loadSceneModule` (which clobbers the
 * global table) — the table + consumed-id set are snapshotted before and restored
 * after, so a no-locale helper (the audio-mix gather) can't leave a leaked or
 * cleared table visible to a concurrent locale's flow. Awaits/returns `fn`'s result.
 */
export function preservingMessageTable<T>(fn: () => Promise<T>): Promise<T> {
  const savedTable = globalScope.table;
  const savedConsumed = globalScope.consumedIds;
  const restore = (): void => {
    globalScope.table = savedTable;
    globalScope.consumedIds = savedConsumed;
  };
  // No async/await here: this module is on the prepare/render path, and core's
  // determinism lint bans async in core src. `.finally` restores on both paths.
  let promise: Promise<T>;
  try {
    promise = fn();
  } catch (err) {
    restore();
    throw err;
  }
  return promise.finally(restore);
}

/**
 * The set of ids `t()` has resolved against the ambient table since the last
 * `setMessageTable` (or, inside a `runWithMessageTable` flow, since that scope
 * began). The render entry passes this to `localize` so a key consumed by a
 * free-standing `t()` (which `localize` can't see — it isn't a doc track) isn't
 * reported as an orphaned table key (0.14 FIX 5).
 */
export function getConsumedMessageIds(): ReadonlySet<string> {
  return activeScope().consumedIds;
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
  const scope = activeScope();
  const ambientTable = scope.table;
  if (ambientTable === undefined) return id;
  const value = ambientTable[id];
  if (value !== undefined) scope.consumedIds.add(id);
  if (value === undefined) {
    throw new LocalizationError(
      `t('${id}'): no message for id '${id}' in the active message table ` +
        `(have: ${Object.keys(ambientTable).map((k) => `'${k}'`).join(', ') || '<empty>'})`,
    );
  }
  return value;
}
