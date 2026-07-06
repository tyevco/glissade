/**
 * gs narration-lint (§5 narration): catch slow-re-narrate failures — a segment
 * that overran its beat, a caption too dense to read, a caption that overflows
 * its box — at BUILD, not render-hours-later.
 *
 * PURE over the committed `*.narration.timing.json` + the REAL measured caption
 * geometry: no clock, no RNG, no I/O of its own (the CLI reads the files and
 * builds the probe). The only environmental caveat is WHICH measurer feeds the
 * caption-fit rule — the CLI defaults to the Skia measurer with the render's
 * own fonts and drives the REAL caption node (its width/baseFont/autoFit
 * formula + the real `breakLines`), so a lint that passes can't burn-overflow.
 *
 * Tiers (§narration-lint LOCKED):
 *   Tier-1 (HARD, deterministic, CAN fail CI / exit non-zero):
 *     reading-speed  — chars-per-second over committed cue text vs `maxCps`
 *     anchor-budget  — a segment/pause that overran its allotted beat
 *     caption-fit    — a cue that overflows its box / exceeds maxLines, using
 *                      the REAL measured geometry
 *   Tier-2 (WARN-only, NEVER fails CI):
 *     beat-drift     — caption cue boundary drifts from its word timing
 *     silence        — implausible silence (a long unscripted gap / a segment
 *                      that reads suspiciously slow)
 */

import { splitCaption, type NarrationTiming } from '@glissade/narrate';

export type LintRule =
  | 'reading-speed'
  | 'anchor-budget'
  | 'caption-fit'
  | 'beat-drift'
  | 'silence';

export interface Diagnostic {
  /** which rule fired */
  rule: LintRule;
  /** 1 = HARD (can fail CI); 2 = WARN-only (never fails CI) */
  tier: 1 | 2;
  /** 'error' (Tier-1) | 'warn' (Tier-2) — derived from tier, surfaced for tables */
  severity: 'error' | 'warn';
  /** the segment / pause / cue id this is about */
  id: string;
  /** a one-line human message (the table cell) */
  message: string;
  /** measured numbers, for --json consumers and the --fix diff */
  detail?: Record<string, number | string>;
}

/**
 * The caption-fit probe: drive the REAL caption node with a cue's text and
 * report its measured geometry. The CLI builds this from the loaded scene +
 * the Skia measurer; a pure unit test can stub it. Returns null when the scene
 * has no caption node (caption-fit then doesn't run).
 */
export interface CaptionProbe {
  /** scene height (px) — the box the caption must stay inside, bottom-anchored */
  readonly sceneH: number;
  /** the caption node's configured max line count before it's "too tall" */
  readonly maxLines: number;
  /**
   * Lay out `text` on the real caption node (real width/font/autoFit + the real
   * breakLines) and report the wrapped line count and the lowest ink pixel's
   * absolute Y on the scene (so a block that runs off the bottom is caught).
   */
  measure(text: string): { lines: number; bottomY: number };
}

export interface LintOptions {
  /** max chars-per-second over a cue before reading-speed fires; default 17 */
  maxCps?: number;
  /** the caption-fit probe (real geometry); omit to skip caption-fit */
  caption?: CaptionProbe;
  /** include Tier-2 (warn-only) diagnostics; default true */
  warnings?: boolean;
  /**
   * Caller-supplied caption mode (e.g. the render config is burning captions).
   * MAY escalate caption-fit to Tier-1 — but the committed script's own
   * `captionMode` (on the timing manifest) is the authoritative signal and
   * takes precedence. Omit to defer entirely to the manifest.
   */
  captionMode?: 'burn' | 'sidecar';
}

/** Every cue the burned track + sidecars actually show, with its window. */
interface Cue {
  segId: string;
  index: number;
  text: string;
  start: number;
  end: number;
}

function cuesOf(timing: NarrationTiming): Cue[] {
  const out: Cue[] = [];
  for (const s of timing.segments) {
    const split = splitCaption(s, (timing.captionSplit && 'maxChars' in timing.captionSplit ? timing.captionSplit.maxChars : undefined));
    split.forEach((c, i) => {
      out.push({ segId: s.id, index: i, text: c.text, start: c.start, end: c.end });
    });
  }
  return out;
}

/** A stable cue id: the segment id, suffixed `#n` when a segment splits. */
function cueId(c: Cue, total: number): string {
  return total > 1 ? `${c.segId}#${c.index}` : c.segId;
}

/** Visible characters in a cue (whitespace collapsed) — the reading-load proxy. */
function readingChars(text: string): number {
  return text.replace(/\s+/g, ' ').trim().length;
}

/**
 * Lint the committed narration timing. Pure: same inputs (timing + the probe's
 * measurements) → same diagnostics, in any order. Tier-1 diagnostics are
 * errors a caller can exit non-zero on; Tier-2 are warnings that never gate CI.
 */
export function lintNarration(timing: NarrationTiming, opts: LintOptions = {}): Diagnostic[] {
  const maxCps = opts.maxCps ?? 17;
  const warnings = opts.warnings ?? true;
  const out: Diagnostic[] = [];

  const cues = cuesOf(timing);
  // group cues per segment so a split segment reports a stable `id#n`
  const perSeg = new Map<string, number>();
  for (const c of cues) perSeg.set(c.segId, (perSeg.get(c.segId) ?? 0) + 1);

  // ---- Tier-1: reading speed (chars-per-second over each cue) ----
  for (const c of cues) {
    const chars = readingChars(c.text);
    const window = c.end - c.start;
    if (chars === 0 || window <= 0) continue;
    const cps = chars / window;
    if (cps > maxCps + 1e-6) {
      const id = cueId(c, perSeg.get(c.segId) ?? 1);
      out.push({
        rule: 'reading-speed',
        tier: 1,
        severity: 'error',
        id,
        message: `reads at ${cps.toFixed(1)} cps (${chars} chars in ${window.toFixed(2)}s) — over ${maxCps} cps`,
        detail: { cps: round(cps), maxCps, chars, seconds: round(window) },
      });
    }
  }

  // ---- Tier-1: anchor budgets (a beat that overran its allotted seconds) ----
  // per-segment maxSec wins; otherwise the script-level budgets table (segments
  // AND pauses share the id namespace, like narration() anchors)
  const budgets = timing.budgets ?? {};
  const checkBudget = (id: string, duration: number, maxSec: number | undefined): void => {
    if (maxSec === undefined || !(maxSec > 0)) return;
    if (duration > maxSec + 1e-6) {
      out.push({
        rule: 'anchor-budget',
        tier: 1,
        severity: 'error',
        id,
        message: `beat ran ${duration.toFixed(2)}s, over its ${maxSec.toFixed(2)}s budget (by ${(duration - maxSec).toFixed(2)}s)`,
        detail: { duration: round(duration), maxSec, overBy: round(duration - maxSec) },
      });
    }
  };
  for (const s of timing.segments) {
    checkBudget(s.id, s.duration, s.maxSec ?? budgets[s.id]);
  }
  for (const p of timing.pauses ?? []) {
    checkBudget(p.id, p.duration, budgets[p.id]);
  }

  // ---- caption text-fit (REAL measured geometry) ----
  // Tier-2 (WARN-only) BY DEFAULT — a sidecar project (player-wrapped captions,
  // no fixed box) must not have its CI gated on this. It ESCALATES to Tier-1
  // (CI-failing error) ONLY when the script declared caption-fit intent: either
  // `captionMode:'burn'` (an overflow is unrecoverable once baked into the frame)
  // OR a `captionMaxLines` budget (an explicit per-script fit ceiling). The
  // signal lives in the committed manifest (carried from the script), not a CLI
  // flag — it travels with the content. A lint caller MAY also force the escalation
  // (a render in burn mode) via opts.captionMode, but the script is authoritative.
  const burnDeclared = (timing.captionMode ?? opts.captionMode) === 'burn';
  const linesDeclared = timing.captionMaxLines !== undefined;
  const captionEscalated = burnDeclared || linesDeclared;
  const captionTier: 1 | 2 = captionEscalated ? 1 : 2;
  // a non-escalated caption-fit is a Tier-2 warning — honor `warnings:false`,
  // which suppresses every warn-only diagnostic. An escalated (Tier-1) caption-fit
  // is a hard error and always runs.
  const runCaptionFit = captionEscalated || warnings;
  // a one-line nudge on the warn variant: a burned-caption author who declared
  // nothing still SEES the overflow and is told exactly how to make it a hard gate.
  const nudge =
    ' — caption-fit is warn-only until you declare maxLines or captionMode:"burn" in the script';
  const withNudge = (msg: string): string => (captionEscalated ? msg : msg + nudge);
  if (opts.caption && runCaptionFit) {
    const probe = opts.caption;
    for (const c of cues) {
      const id = cueId(c, perSeg.get(c.segId) ?? 1);
      const { lines, bottomY } = probe.measure(c.text);
      if (lines > probe.maxLines) {
        out.push({
          rule: 'caption-fit',
          tier: captionTier,
          severity: captionEscalated ? 'error' : 'warn',
          id,
          message: withNudge(`caption wraps to ${lines} lines, over maxLines ${probe.maxLines}`),
          detail: { lines, maxLines: probe.maxLines, text: c.text },
        });
      } else if (bottomY > probe.sceneH + 1e-6) {
        // even within maxLines a bottom-anchored block can run off the frame
        out.push({
          rule: 'caption-fit',
          tier: captionTier,
          severity: captionEscalated ? 'error' : 'warn',
          id,
          message: withNudge(
            `caption overflows the frame: its lowest line ends at y=${bottomY.toFixed(0)} of ${probe.sceneH}`,
          ),
          detail: { bottomY: round(bottomY), sceneH: probe.sceneH, lines, text: c.text },
        });
      }
    }
  }

  if (!warnings) return out;

  // ---- Tier-2: silence sanity (long unscripted gaps between cues) ----
  // a big hole that is NOT a declared pause is usually a stale/mis-split
  // manifest; warn only (the author may want the breathing room)
  const pauseSpans = (timing.pauses ?? []).map((p) => ({ start: p.start, end: p.start + p.duration }));
  const isPauseGap = (start: number, end: number): boolean =>
    pauseSpans.some((p) => p.start <= start + 1e-6 && p.end >= end - 1e-6);
  const sorted = [...timing.segments].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const gap = b.start - (a.start + a.duration);
    if (gap > 2 && !isPauseGap(a.start + a.duration, b.start)) {
      out.push({
        rule: 'silence',
        tier: 2,
        severity: 'warn',
        id: `${a.id}→${b.id}`,
        message: `${gap.toFixed(2)}s of unscripted silence between '${a.id}' and '${b.id}' (no pause declared)`,
        detail: { gap: round(gap) },
      });
    }
  }

  // ---- Tier-2: beat-alignment drift (a cue boundary vs its word timing) ----
  // when a segment carries word timings, a split cue should START near the word
  // it begins on; a large drift means the even-divide split misaligned (warn)
  for (const s of timing.segments) {
    if (!s.words || s.words.length === 0) continue;
    const split = splitCaption(s, (timing.captionSplit && 'maxChars' in timing.captionSplit ? timing.captionSplit.maxChars : undefined));
    if (split.length < 2) continue;
    for (let i = 1; i < split.length; i++) {
      const cueStart = split[i]!.start;
      // nearest word boundary to this cue's start
      const nearest = s.words.reduce((best, w) =>
        Math.abs(w.start - cueStart) < Math.abs(best - cueStart) ? w.start : best, s.words[0]!.start);
      const drift = Math.abs(nearest - cueStart);
      if (drift > 0.4) {
        out.push({
          rule: 'beat-drift',
          tier: 2,
          severity: 'warn',
          id: `${s.id}#${i}`,
          message: `caption cue starts ${drift.toFixed(2)}s off the nearest word boundary`,
          detail: { drift: round(drift) },
        });
      }
    }
  }

  return out;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** True when any Tier-1 diagnostic is present — the CI gate / exit-code signal. */
export function hasErrors(diags: readonly Diagnostic[]): boolean {
  return diags.some((d) => d.tier === 1);
}

/** A human-readable table (the default terminal output). */
export function formatTable(diags: readonly Diagnostic[]): string {
  if (diags.length === 0) return 'narration-lint: clean — no issues\n';
  const rows = diags.map((d) => {
    const mark = d.tier === 1 ? 'ERROR' : 'warn ';
    return `  ${mark}  ${d.rule.padEnd(13)}  ${d.id.padEnd(16)}  ${d.message}`;
  });
  const errs = diags.filter((d) => d.tier === 1).length;
  const warns = diags.length - errs;
  const summary = `narration-lint: ${errs} error${errs === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}`;
  return `${summary}\n${rows.join('\n')}\n`;
}

/**
 * A git-apply-able unified diff that bumps the committed budgets (and
 * captionSplit, when a caption is too dense) to the values the manifest already
 * shows — the `--fix` SUGGESTION. NEVER writes anything: it prints a diff the
 * author reviews and applies (re-narrate is the real fix; this just unblocks CI
 * when the over-budget value is genuinely the new intent). Targets the SCRIPT
 * (`*.narration.json`), since budgets are committed there.
 */
export function fixDiff(
  diags: readonly Diagnostic[],
  scriptPath: string,
  script: { budgets?: Record<string, number> },
): string {
  // collect the budget bumps the diagnostics imply (anchor-budget only — a
  // reading-speed / overflow fix is editorial, not a number to nudge)
  const bumps = new Map<string, number>();
  for (const d of diags) {
    if (d.rule === 'anchor-budget' && typeof d.detail?.['duration'] === 'number') {
      // round UP to a tenth so a re-narrate with tiny drift doesn't re-flag
      bumps.set(d.id, Math.ceil(d.detail['duration'] * 10) / 10);
    }
  }
  if (bumps.size === 0) return '';

  const before = { ...(script.budgets ?? {}) };
  const after = { ...before };
  for (const [id, sec] of bumps) after[id] = sec;

  // a minimal, readable unified diff of just the budgets object — the author
  // applies with `git apply` or hand-edits. We render the WHOLE budgets block
  // before/after so the patch context is unambiguous.
  const fmt = (b: Record<string, number>): string[] =>
    JSON.stringify({ budgets: b }, null, 2).split('\n');
  const beforeLines = fmt(before);
  const afterLines = fmt(after);
  const body = [
    `--- a/${scriptPath}`,
    `+++ b/${scriptPath}`,
    '@@ budgets @@',
    ...beforeLines.map((l) => `-${l}`),
    ...afterLines.map((l) => `+${l}`),
  ];
  return body.join('\n') + '\n';
}
