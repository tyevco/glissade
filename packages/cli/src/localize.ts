/**
 * `gs localize` (0.42) — the fork/translate/parity orchestrator. Forking a
 * narration into a new locale by hand is where drift creeps in: you clone the
 * script, re-author the timing, hand-write `messages.<locale>.json`, and only
 * discover a missing beat id or an orphaned message when something THROWS deep in
 * a render — after a minute of TTS. `gs localize <base> --to <locale>` does the
 * mechanical fork up front and runs the SAME parity + localize checks the render
 * path runs, BEFORE any synthesis: it clones the segment/pause structure keeping
 * every beat id (so `.start('seg-x')` anchors survive), stubs a translatable
 * `messages.<locale>.json` from the scene's `t()` ids, and reports every drift.
 *
 * This module is the PURE engine (fork + stub + preflight report). The CLI
 * command (file IO, harvesting `t()` ids by loading the scene, `--write`) wraps it.
 * Nothing here synthesizes audio, touches the render path, or calls `evaluate()`.
 */

import { createHash } from 'node:crypto';
import { requireParity, localize, ParityError, LocalizationError, type MessageTable, type LocaleManifest } from '@glissade/core/i18n';
import type { Timeline } from '@glissade/core';
import { isPause, type NarrationScript, type NarrationTiming, type NarrationElement } from '@glissade/narrate';

export class LocalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalizeError';
  }
}

// ── translation-memory staleness (0.6x, --tm) ────────────────────────────────
//
// Carry-by-id (forkNarrationScript / stubMessageTable) NEVER wipes a translator's
// work — but it is BLIND to whether the English SOURCE changed. A reworded EN
// segment silently keeps its now-stale old translation. The TM sidecar closes that
// gap: it records, per translated id, a hash of the EN source text AT THE TIME it
// was translated. On re-localize we re-hash the CURRENT source and compare —
// `reuse` when the source is unchanged (the carried translation is still valid),
// `stale` when it changed (re-translate ONLY these). This is OFF the render path:
// the srcHash never enters any cert / determinism / golden hash.

/**
 * A stable content hash of a source string — the TM staleness key. `sha256` hex via
 * `node:crypto`, matching the CLI's other content hashes (cert / loudness). Pure.
 */
export function srcHashOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** One TM entry: the hash of the SOURCE text when this id was last translated. */
export interface TmEntry {
  readonly srcHash: string;
}

/**
 * The `.tm.<locale>.json` sidecar — a SEPARATE committed artifact (never pollutes
 * the clean `gs narrate` narration input nor the flat `{id:text}` message table).
 * Two id-namespaced sections so a segment id and a `t()` message id can't collide:
 * `segments` keyed on narration beat ids, `messages` on message-table ids. Sorted
 * keys / trailing newline on write → diff-stable, like `stubMessageTable`.
 */
export interface TmSidecar {
  readonly tmVersion: 1;
  readonly segments: Readonly<Record<string, TmEntry>>;
  readonly messages: Readonly<Record<string, TmEntry>>;
}

/** Per-section staleness classification: which carried translations still hold, which went stale. */
export interface TmStaleness {
  /** carried translations whose EN source is UNCHANGED since translated — keep as-is */
  readonly reuse: readonly string[];
  /** carried translations whose EN source CHANGED since translated — re-translate ONLY these */
  readonly stale: readonly string[];
}

/**
 * Classify carried translations against a prior TM section. PURE over its inputs
 * (hash + compare): for every id that currently holds a real translation, compare
 * the stored `srcHash` (source at translate time) against a fresh hash of the
 * CURRENT source text → `reuse` when equal, `stale` when different OR when there is
 * no prior record (a translated id we can't prove is fresh needs review). An id with
 * NO current translation (a fresh/untranslated segment) is neither reuse nor stale.
 *
 * `next` is the sidecar section to persist on `--write`: a full snapshot of the
 * current source hash for EVERY source id (translated or not), so the next
 * re-localize measures drift from this pass.
 */
export function classifyTmStaleness(args: {
  /** current source text by id (EN narration segment text, or base-locale message text) */
  readonly source: ReadonlyMap<string, string>;
  /** ids that currently hold a real (non-placeholder) translation */
  readonly translated: ReadonlySet<string>;
  /** the prior sidecar section for this namespace (id → recorded source hash) */
  readonly prior: Readonly<Record<string, TmEntry>>;
}): { readonly reuse: string[]; readonly stale: string[]; readonly next: Record<string, TmEntry> } {
  const reuse: string[] = [];
  const stale: string[] = [];
  const next: Record<string, TmEntry> = {};
  for (const id of [...args.source.keys()].sort()) {
    const cur = srcHashOf(args.source.get(id)!);
    next[id] = { srcHash: cur };
    if (!args.translated.has(id)) continue; // no translation → not reuse, not stale
    const prev = args.prior[id]?.srcHash;
    if (prev !== undefined && prev === cur) reuse.push(id);
    else stale.push(id);
  }
  return { reuse, stale, next };
}

/** Read + normalize a `.tm.<locale>.json` sidecar, tolerating absence / a partial shape. */
export function parseTmSidecar(raw: unknown): TmSidecar {
  const o = (raw ?? {}) as Partial<TmSidecar>;
  const section = (s: unknown): Record<string, TmEntry> => {
    const out: Record<string, TmEntry> = {};
    if (s && typeof s === 'object') {
      for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
        const h = (v as { srcHash?: unknown })?.srcHash;
        if (typeof h === 'string') out[k] = { srcHash: h };
      }
    }
    return out;
  };
  return { tmVersion: 1, segments: section(o.segments), messages: section(o.messages) };
}

/** Serialize a TM sidecar deterministically (sorted keys per section, trailing newline). */
export function serializeTmSidecar(segments: Record<string, TmEntry>, messages: Record<string, TmEntry>): string {
  const sortSection = (rec: Record<string, TmEntry>): Record<string, TmEntry> => {
    const out: Record<string, TmEntry> = {};
    for (const k of Object.keys(rec).sort()) out[k] = { srcHash: rec[k]!.srcHash };
    return out;
  };
  const doc: TmSidecar = { tmVersion: 1, segments: sortSection(segments), messages: sortSection(messages) };
  return JSON.stringify(doc, null, 2) + '\n';
}

/**
 * Fork an authored narration script for a new locale: a structural clone that
 * PRESERVES every segment/pause id (the beat ids `.start()`/`.end()` anchors and
 * SFX/visual cues resolve against — they MUST survive so the translated locale
 * stays anchor-compatible) and carries the source text through as a translate-me
 * placeholder. Pure: the input is never mutated. The `voice` is dropped so the
 * locale picks its own (an English voice on translated text is a mistake) unless
 * `keepVoice` is set.
 */
export function forkNarrationScript(
  base: NarrationScript,
  opts: { keepVoice?: boolean; existing?: NarrationScript } = {},
): NarrationScript {
  // Carry over a translator's already-localized segment text BY ID (0.42.1 — the
  // fix for the silent-wipe footgun: a re-localize must never clobber translated
  // narration). A base segment reuses the existing locale's text when the id
  // matches AND that text differs from the base (a real translation, not a
  // still-placeholder copy); a NEW base segment re-stubs the source text.
  const existingText = new Map<string, string>();
  for (const el of opts.existing?.segments ?? []) {
    if (!isPause(el) && el.text !== '') existingText.set(el.id, el.text);
  }
  const segments: NarrationElement[] = base.segments.map((el) => {
    if (isPause(el)) return { ...el };
    const carried = existingText.get(el.id);
    const withText = carried !== undefined && carried !== el.text ? { ...el, text: carried } : { ...el };
    if (opts.keepVoice) return withText;
    const { voice: _voice, ...rest } = withText; // drop the segment voice for the new locale
    return rest;
  });
  const forked: NarrationScript = { ...base, segments };
  if (!opts.keepVoice) delete forked.voice;
  return forked;
}

/**
 * Derive an authored-script skeleton from a COMMITTED timing manifest — the fork
 * source when the base project kept only `<base>.narration.timing.json` (no
 * authored `<base>.narration.json`). Maps each timed segment/pause back to its
 * script element, preserving ids and text; drops the resolved timing (start/
 * duration/file/words) which a re-narration of the new locale regenerates.
 */
export function scriptFromTiming(timing: NarrationTiming): NarrationScript {
  const pauses = timing.pauses ?? [];
  // Reconstruct playback order by start time (segments + pauses share the timeline).
  const els: Array<{ start: number; el: NarrationElement }> = [
    ...timing.segments.map((s) => ({ start: s.start, el: { id: s.id, text: s.text } as NarrationElement })),
    ...pauses.map((p) => ({ start: p.start, el: { id: p.id, pause: p.duration, ...(p.bed ? { bed: p.bed } : {}) } as NarrationElement })),
  ];
  els.sort((a, b) => a.start - b.start);
  return {
    narrationVersion: 1,
    ...(timing.captionSplit ? { captionSplit: timing.captionSplit } : {}),
    ...(timing.captionMode ? { captionMode: timing.captionMode } : {}),
    ...(timing.budgets ? { budgets: timing.budgets } : {}),
    segments: els.map((e) => e.el),
  };
}

/**
 * Build a translatable `messages.<locale>.json` stub for a set of `t()` ids. Each
 * id maps to the base-locale string as a translate-from placeholder (so the
 * translator sees the source), or `''` when no base value exists. Existing target
 * translations are CARRIED OVER (a re-localize never blanks work already done —
 * the translation-memory seed). Keys are sorted for a deterministic, diff-stable
 * file. Pure.
 */
export function stubMessageTable(
  ids: Iterable<string>,
  opts: { base?: MessageTable; existing?: MessageTable } = {},
): MessageTable {
  const out: MessageTable = {};
  for (const id of [...new Set(ids)].sort()) {
    out[id] = opts.existing?.[id] ?? opts.base?.[id] ?? '';
  }
  return out;
}

/** One drift the preflight surfaced (a parity gap or a localize failure). */
export interface LocalizeIssue {
  readonly kind: 'parity' | 'localize';
  readonly message: string;
}

/** The result of the pre-TTS preflight — what a render WOULD hit, caught early. */
export interface LocalizePreflight {
  readonly locale: string;
  /** ids harvested from the base (narration beats + scene `t()` / string-track targets) */
  readonly ids: readonly string[];
  /** how many stubbed messages still hold the source text / are empty (untranslated) */
  readonly untranslated: number;
  readonly issues: readonly LocalizeIssue[];
  readonly ok: boolean;
}

/**
 * Run the SAME checks the render path runs — `requireParity` across the base and
 * new-locale id manifests, and a dry `localize()` of the scene document with the
 * stub table — but as a NON-throwing report, so every drift surfaces at once
 * before a minute of TTS instead of one-at-a-time at render. Pure over its loaded
 * inputs (it catches the `ParityError`/`LocalizationError` the primitives throw).
 */
export function runLocalizePreflight(args: {
  locale: string;
  baseManifest: LocaleManifest;
  localeManifest: LocaleManifest;
  doc: Timeline;
  stubTable: MessageTable;
  consumedIds?: ReadonlySet<string>;
}): LocalizePreflight {
  const issues: LocalizeIssue[] = [];
  try {
    requireParity(args.baseManifest, args.localeManifest);
  } catch (e) {
    if (e instanceof ParityError) issues.push({ kind: 'parity', message: e.message });
    else throw e;
  }
  try {
    localize(args.doc, args.stubTable, { locale: args.locale, ...(args.consumedIds ? { consumedIds: args.consumedIds } : {}) });
  } catch (e) {
    if (e instanceof LocalizationError) issues.push({ kind: 'localize', message: e.message });
    else throw e;
  }
  const untranslated = Object.values(args.stubTable).filter((v) => v === '').length;
  return {
    locale: args.locale,
    ids: [...args.localeManifest.ids].sort(),
    untranslated,
    issues,
    ok: issues.length === 0,
  };
}

// ── CLI orchestration (file IO + t()-id harvest; not pure) ───────────────────

const nodeIdOf = (target: string): string => {
  const i = target.indexOf('/');
  return i < 0 ? target : target.slice(0, i);
};

const moduleStemOf = (modulePath: string): string => modulePath.replace(/\.[jt]sx?$/, '');

/** beat ids (segments + pauses, in order) of an authored script — the anchor id set. */
const scriptBeatIds = (script: NarrationScript): string[] => script.segments.map((e) => e.id);

/**
 * Harvest the message-table keys a scene actually uses: every `t()` id (recorded
 * by loading the scene under a table that treats every id as known — a Proxy whose
 * `has` is always true, so no `t()` throws — then reading `getConsumedMessageIds`)
 * plus every `type:'string'` track's node-id (the `localize()` keys). This is the
 * one impure step (loading the module runs its side effects), quarantined here.
 */
async function harvestMessageIds(
  modulePath: string,
): Promise<{ ids: string[]; tIds: Set<string>; doc: import('@glissade/core').Timeline }> {
  const recording = new Proxy({} as MessageTable, {
    has: () => true,
    get: (_t, prop) => (typeof prop === 'string' ? prop : undefined),
  });
  const { getConsumedMessageIds } = await import('@glissade/core/i18n');
  const { loadSceneModule } = await import('./render.js');
  const mod = await loadSceneModule(modulePath, undefined, recording);
  mod.createScene(); // runs t() at construction → records the ids
  const tIds = new Set<string>(getConsumedMessageIds());
  const ids = new Set<string>(tIds);
  const doc = mod.timeline;
  for (const tr of doc.tracks ?? []) {
    if (tr.type !== 'string') continue;
    // Skip MULTI-CUE string tracks (>1 distinct keyed value — e.g. a 72-cue caption
    // /typewriter node): `localize()` can't table-localize them (it throws), so
    // offering the node-id as a table target only ever keeps the preflight red. A
    // per-locale multi-cue track comes from a re-narration, not the message table.
    const distinct = new Set((tr.keys ?? []).map((k) => k.value));
    if (distinct.size > 1) continue;
    ids.add(nodeIdOf(tr.target));
  }
  return { ids: [...ids], tIds, doc };
}

export interface LocalizeReport {
  readonly locale: string;
  /** the harvested message-table keys (t() ids + string-track node-ids) */
  readonly messageIds: readonly string[];
  /** the forked narration beat ids (preserved from the base) */
  readonly beatIds: readonly string[];
  /** segment translations carried over from an existing locale narration (re-localize) */
  readonly carriedSegments: number;
  readonly preflight: LocalizePreflight;
  /** files written under --write (empty on a dry run, or when --strict refuses on drift) */
  readonly wrote: readonly string[];
  /** true when --strict refused to write because the preflight had issues */
  readonly refusedWrite: boolean;
  /** the target paths a --write would produce */
  readonly narrationPath: string;
  readonly messagesPath: string;
  /** whether a base authored narration script was found (vs derived from timing / absent) */
  readonly narrationSource: 'script' | 'timing' | 'none';
  /** translation-memory staleness (only meaningful under --tm; `enabled:false` otherwise) */
  readonly tm: LocalizeTmReport;
}

/**
 * The `--tm` staleness surface: per-namespace reuse/stale classification of carried
 * translations plus the sidecar path. When `--tm` is off, `enabled:false` and every
 * bucket is empty (the feature reads/writes nothing — fully non-breaking).
 */
export interface LocalizeTmReport {
  readonly enabled: boolean;
  /** the `.tm.<locale>.json` sidecar path a --write would produce */
  readonly sidecarPath: string;
  /** whether a --write (re)wrote the sidecar this run */
  readonly wroteSidecar: boolean;
  readonly narration: TmStaleness;
  readonly messages: TmStaleness;
  /** total carried translations still valid (source unchanged) across both namespaces */
  readonly reuse: number;
  /** total carried translations gone stale (source changed) across both namespaces */
  readonly stale: number;
  /** the stale ids to re-translate (narration ⧺ messages) — the whole point of --tm */
  readonly staleIds: readonly string[];
}

/**
 * Fork a scene's narration into a new locale + stub its message table, running the
 * render path's parity + localize checks first. Dry-run by default (reports what it
 * WOULD write); `--write` emits `<base>.<locale>.narration.json` +
 * `messages.<locale>.json`. Never synthesizes audio or calls `evaluate()`.
 */
export async function localizeCommand(
  modulePath: string,
  opts: { to: string; from?: string; write?: boolean; keepVoice?: boolean; strict?: boolean; tm?: boolean },
): Promise<LocalizeReport> {
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const { scriptPathFor } = await import('@glissade/narrate/providers');
  const { messagesFileFor, loadMessageTable } = await import('./locale.js');
  const { timingPathFor } = await import('./captions.js');

  const to = opts.to;
  if (!/^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(to)) {
    throw new LocalizeError(`--to '${to}' is not a locale code (expected e.g. 'zh', 'pt-BR')`);
  }

  // 1) harvest message ids (t() + string-track node-ids) from the scene
  const { ids: messageIds, tIds, doc } = await harvestMessageIds(modulePath);

  // 2) read the base narration — authored script preferred, else derive from committed timing
  const scriptPath = scriptPathFor(modulePath);
  const baseTimingPath = timingPathFor(modulePath);
  let baseScript: NarrationScript | undefined;
  let narrationSource: 'script' | 'timing' | 'none' = 'none';
  if (existsSync(scriptPath)) {
    baseScript = JSON.parse(readFileSync(scriptPath, 'utf8')) as NarrationScript;
    narrationSource = 'script';
  } else if (baseTimingPath && existsSync(baseTimingPath)) {
    baseScript = scriptFromTiming(JSON.parse(readFileSync(baseTimingPath, 'utf8')) as NarrationTiming);
    narrationSource = 'timing';
  }

  // 3) the EXISTING locale narration (a re-localize) — read ONCE, drives both drift
  //    detection AND the translated-text carry-over (never wipe a translator's work).
  const narrationPath = moduleStemOf(modulePath) + `.${to}.narration.json`;
  const existingLocale =
    baseScript && existsSync(narrationPath)
      ? (JSON.parse(readFileSync(narrationPath, 'utf8')) as NarrationScript)
      : undefined;

  const forked = baseScript
    ? forkNarrationScript(baseScript, { keepVoice: opts.keepVoice ?? false, ...(existingLocale ? { existing: existingLocale } : {}) })
    : undefined;
  const beatIds = baseScript ? scriptBeatIds(baseScript) : [];
  const localeBeatIds = existingLocale ? scriptBeatIds(existingLocale) : beatIds; // fresh fork mirrors base
  // how many segments carried a real translation over (vs re-stubbed from the base)
  const carriedSegments =
    baseScript && forked
      ? forked.segments.filter((el, i) => !isPause(el) && (el as { text: string }).text !== (baseScript.segments[i] as { text?: string }).text).length
      : 0;

  // 4) message table stub — base placeholders (--from) + carry existing target translations
  const base = opts.from ? loadMessageTable(modulePath, opts.from) : undefined;
  const messagesPath = messagesFileFor(modulePath, to);
  const existingTable = existsSync(messagesPath)
    ? (JSON.parse(readFileSync(messagesPath, 'utf8')) as MessageTable)
    : loadMessageTable(modulePath, to);
  const stubTable = stubMessageTable(messageIds, {
    ...(base ? { base } : {}),
    ...(existingTable ? { existing: existingTable } : {}),
  });

  // 5) preflight — the render path's checks, before any TTS
  const preflight = runLocalizePreflight({
    locale: to,
    baseManifest: { locale: opts.from ?? 'base', ids: beatIds },
    localeManifest: { locale: to, ids: localeBeatIds },
    doc,
    stubTable,
    consumedIds: tIds,
  });

  // 5b) translation-memory staleness (--tm): classify every carried translation
  //     against the .tm.<locale>.json sidecar's recorded SOURCE hashes. Carry-by-id
  //     never wipes a translation but is blind to a reworded EN source — this flags
  //     the ones whose source moved (re-translate ONLY these). Off the render path:
  //     the srcHash never enters a cert / determinism / golden hash.
  const tmSidecarPath = moduleStemOf(modulePath) + `.tm.${to}.json`;
  let tm: LocalizeTmReport = {
    enabled: false, sidecarPath: tmSidecarPath, wroteSidecar: false,
    narration: { reuse: [], stale: [] }, messages: { reuse: [], stale: [] },
    reuse: 0, stale: 0, staleIds: [],
  };
  let tmSidecarContent: string | undefined;
  if (opts.tm) {
    const prior = existsSync(tmSidecarPath)
      ? parseTmSidecar(JSON.parse(readFileSync(tmSidecarPath, 'utf8')))
      : parseTmSidecar(undefined);

    // narration namespace: source = EN base segment text; a translation is "carried"
    // when forkNarrationScript kept target text that differs from the base source.
    const narrSource = new Map<string, string>();
    if (baseScript) for (const el of baseScript.segments) if (!isPause(el)) narrSource.set(el.id, (el as { text: string }).text);
    const narrTranslated = new Set<string>();
    if (baseScript && forked) {
      forked.segments.forEach((el, i) => {
        const b = baseScript.segments[i];
        if (!isPause(el) && b && !isPause(b) && (el as { text: string }).text !== (b as { text: string }).text) narrTranslated.add(el.id);
      });
    }
    const narrCls = classifyTmStaleness({ source: narrSource, translated: narrTranslated, prior: prior.segments });

    // messages namespace: source = base-locale message text (--from); a translation
    // is "carried" when the target value is non-empty AND differs from that source.
    const msgSource = new Map<string, string>();
    if (base) for (const id of messageIds) { const v = base[id]; if (v !== undefined) msgSource.set(id, v); }
    const msgTranslated = new Set<string>();
    for (const id of messageIds) {
      const cur = stubTable[id];
      const src = base?.[id];
      if (cur !== undefined && cur !== '' && src !== undefined && cur !== src) msgTranslated.add(id);
    }
    const msgCls = classifyTmStaleness({ source: msgSource, translated: msgTranslated, prior: prior.messages });

    if (narrSource.size > 0 || msgSource.size > 0) tmSidecarContent = serializeTmSidecar(narrCls.next, msgCls.next);
    const staleIds = [...narrCls.stale, ...msgCls.stale];
    tm = {
      enabled: true, sidecarPath: tmSidecarPath, wroteSidecar: false,
      narration: { reuse: narrCls.reuse, stale: narrCls.stale },
      messages: { reuse: msgCls.reuse, stale: msgCls.stale },
      reuse: narrCls.reuse.length + msgCls.reuse.length,
      stale: staleIds.length,
      staleIds,
    };
  }

  // 6) write (opt-in). --strict refuses to emit on a preflight failure (CI gate,
  //    mirroring the dry-run exit-1). A no-message repo (no t() + no single-cue
  //    string tracks) skips messages.<locale>.json entirely — nothing to localize.
  const wrote: string[] = [];
  const refusedWrite = !!(opts.write && opts.strict && !preflight.ok);
  if (opts.write && !refusedWrite) {
    if (forked) {
      writeFileSync(narrationPath, JSON.stringify(forked, null, 2) + '\n');
      wrote.push(narrationPath);
    }
    if (messageIds.length > 0) {
      writeFileSync(messagesPath, JSON.stringify(stubTable, null, 2) + '\n');
      wrote.push(messagesPath);
    }
    if (opts.tm && tmSidecarContent !== undefined) {
      writeFileSync(tmSidecarPath, tmSidecarContent);
      wrote.push(tmSidecarPath);
      tm = { ...tm, wroteSidecar: true };
    }
  }

  return { locale: to, messageIds: messageIds.sort(), beatIds, carriedSegments, preflight, wrote, refusedWrite, narrationPath, messagesPath, narrationSource, tm };
}

/** Human-readable report (migrate.ts style). */
export function formatLocalizeReport(r: LocalizeReport): string {
  const lines: string[] = [];
  lines.push(`gs localize → ${r.locale}`);
  lines.push(
    `  narration: ${r.narrationSource === 'none' ? 'none found' : `${r.beatIds.length} beat(s) from the ${r.narrationSource} (ids preserved)`}` +
      (r.carriedSegments > 0 ? `; ${r.carriedSegments} translation(s) carried over` : ''),
  );
  lines.push(
    r.messageIds.length === 0
      ? '  messages:  none localizable (no t() ids / no single-cue string tracks) — narration only'
      : `  messages:  ${r.messageIds.length} id(s) harvested, ${r.preflight.untranslated} still untranslated`,
  );
  if (r.preflight.issues.length === 0) {
    lines.push('  preflight: ✓ parity + localize clean (safe to translate + narrate)');
  } else {
    lines.push(`  preflight: ✗ ${r.preflight.issues.length} issue(s) — fix before narrating:`);
    for (const i of r.preflight.issues) lines.push(`    [${i.kind}] ${i.message.replace(/\n/g, '\n      ')}`);
  }
  if (r.tm.enabled) {
    lines.push(
      r.tm.stale === 0
        ? `  tm:        ${r.tm.reuse} translation(s) current, 0 stale (no re-translation needed)`
        : `  tm:        ${r.tm.reuse} current, ${r.tm.stale} STALE — EN source changed, re-translate only: ${r.tm.staleIds.join(', ')}`,
    );
  }
  if (r.refusedWrite) lines.push('  --strict: refused to write (preflight failed); fix the drift above, then re-run');
  else if (r.wrote.length) lines.push(`  wrote: ${r.wrote.join(', ')}`);
  else lines.push(`  (dry run — re-run with --write to emit ${r.narrationPath}${r.messageIds.length ? ` + ${r.messagesPath}` : ''})`);
  return lines.join('\n');
}
