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

import { requireParity, localize, ParityError, LocalizationError, type MessageTable, type LocaleManifest } from '@glissade/core/i18n';
import type { Timeline } from '@glissade/core';
import { isPause, type NarrationScript, type NarrationTiming, type NarrationElement } from '@glissade/narrate';

export class LocalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalizeError';
  }
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
}

/**
 * Fork a scene's narration into a new locale + stub its message table, running the
 * render path's parity + localize checks first. Dry-run by default (reports what it
 * WOULD write); `--write` emits `<base>.<locale>.narration.json` +
 * `messages.<locale>.json`. Never synthesizes audio or calls `evaluate()`.
 */
export async function localizeCommand(
  modulePath: string,
  opts: { to: string; from?: string; write?: boolean; keepVoice?: boolean; strict?: boolean },
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
  }

  return { locale: to, messageIds: messageIds.sort(), beatIds, carriedSegments, preflight, wrote, refusedWrite, narrationPath, messagesPath, narrationSource };
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
  if (r.refusedWrite) lines.push('  --strict: refused to write (preflight failed); fix the drift above, then re-run');
  else if (r.wrote.length) lines.push(`  wrote: ${r.wrote.join(', ')}`);
  else lines.push(`  (dry run — re-run with --write to emit ${r.narrationPath}${r.messageIds.length ? ` + ${r.messagesPath}` : ''})`);
  return lines.join('\n');
}
