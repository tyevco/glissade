/**
 * gs scaffold (Era B, card qv_iaQ6KBCRy): a committed narration timing manifest →
 * a generated TypeScript beat-skeleton scene module the author REFINES. Turns
 * "hand-build every beat" into "scaffold-and-refine": glissade emits the tedious
 * ZERO-JUDGMENT wiring (the `narration().require([ids])` drift-guard + the
 * caption/narration plumbing + one anchored beat entry per segment) and HONESTLY
 * LABELS the two things it can't know — the author's episode FRAME and the bespoke
 * body BEATS — as `// TODO` markers.
 *
 * ANTI-WORKSLOP (the design spine, all 3 canary seats gate it): prefer an honest
 * labeled GAP over a confident-WRONG recipe pick. A labeled `// TODO beat:` stub is
 * the SAFE direction (the author fills a visible hole); a wrong recipe forced onto a
 * bespoke beat is silent-wrong output the author must notice + delete = worse than
 * nothing. So a segment only becomes an actual `recipe(...)` call when its id
 * CONFIDENTLY matches a structural convention (title/cold-open/lower-third); every
 * other segment is an honest stub. Same safety asymmetry as MeasurerRequiredError /
 * CaptionFitError — loud honest gap beats silent wrong, one layer up (codegen).
 *
 * DETERMINISTIC BY CONSTRUCTION: the emitted `.ts` is a PURE FUNCTION of the frozen
 * `<base>.narration.timing.json` (stub order = narration order; comment text =
 * verbatim from the manifest; no timestamps / no run-varying data), so re-scaffolding
 * the same narration yields a byte-identical file. Off the render/cert path — the
 * generated module is an ordinary scene the author commits + CI renders.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export interface ScaffoldOptions {
  /** Path to the committed `<base>.narration.timing.json` (or a `<base>.narration.json`). */
  input: string;
  /**
   * Output directory. Defaults to the input's directory — the generated module
   * imports the timing manifest by a `./` relative path, so it must sit beside it.
   */
  out?: string;
  /** Overwrite an existing output file (default false — refuse to clobber refinements). */
  force?: boolean;
  /**
   * Era B v3: emit the author's episode FRAME instead of a `// TODO frame:` marker + the
   * inline caption wiring. The value is the import path of a module exporting the
   * `scaffoldFrame(opts, buildBody)` callback-adapter (the author's ~6-line wrapper over
   * their episode frame — `makeEpisode(opts)` → `buildBody(ep)` → `ep.finish(...)`). The
   * body is authored imperatively against the `ep` handle (ep.push/ep.add/ep.anchor/…),
   * and the frame OWNS the captions/labels/backdrop/duration (finish()), so the framed
   * output drops those. Absent = the frameless v2 output (byte-identical).
   */
  frame?: string;
}

export interface ScaffoldCommandResult {
  out: string;
  /** segment ids that became an actual recipe() (a confident convention match). */
  recipes: { seg: string; recipe: string }[];
  /** segment ids left as an honest `// TODO beat:` stub. */
  stubs: string[];
  /** `-b/-c` pause-split continuations coalesced into their base beat (not double-emitted). */
  continuations: string[];
}

/** The manifest shape the scaffold reads (a subset of narrate's NarrationTiming). */
interface ScaffoldSegment {
  id: string;
  text: string;
}
interface ScaffoldTiming {
  timingVersion?: number;
  segments: ScaffoldSegment[];
}

type RecipeName = 'lower-third' | 'title-card' | 'cold-open';

/**
 * The CONSERVATIVE, DETERMINISTIC id→recipe convention table — a FIXED, TOTAL,
 * ordered rule list (first match wins) applied to the lowercased segment id. Only
 * high-confidence STRUCTURAL conventions map to a recipe; everything else returns
 * null → an honest stub. `stat-reveal` is deliberately absent: a digit in a segment
 * is not a stat card (a real content invariant — stats live inside bespoke beats),
 * so id-convention outranks bare-digit-presence. Ordered so the ranking is stable
 * (no first-match-in-unstable-iteration). The content owner tunes this table; the
 * anti-workslop default is to under-pick (more honest stubs), never over-pick.
 */
const RECIPE_RULES: ReadonlyArray<{ recipe: RecipeName; test: RegExp }> = [
  { recipe: 'title-card', test: /(^|[-_ ])title([-_ ]|$)/ },
  { recipe: 'cold-open', test: /(^|[-_ ])(cold|cold-open|teaser|open)([-_ ]|$)/ },
  // lower-third = a NAME super (speaker/name), NOT footnote/credit — those are
  // frame-owned bookends (the episode frame emits them), so they're honest stubs with
  // a "likely frame-owned" hint (see FRAME_OWNED), never a confident-wrong lower-third.
  { recipe: 'lower-third', test: /(^|[-_ ])(lower-?third|speaker|name)([-_ ]|$)/ },
];

/**
 * Frame-owned bookend conventions (Era B v2, ai-training's gate): a segment whose id
 * matches these is almost always emitted by the AUTHOR's episode frame (makeEpisode's
 * habit stamp / next-episode card / footnote), NOT a body beat. The scaffold still
 * STUBS them (it can't KNOW the frame owns them — honest-gap), but tags the stub
 * "likely frame-owned → route to your `// TODO frame:`" to save the author the delete.
 */
const FRAME_OWNED = /(^|[-_ ])(habit|outro|footnote|credits?|next(-ep)?|end-?card)([-_ ]|$)/;
function isFrameOwned(id: string): boolean {
  return FRAME_OWNED.test(id.toLowerCase());
}

/** Deterministic: same id → same verdict, run-to-run. null = honest stub. */
export function selectRecipe(id: string): RecipeName | null {
  const key = id.toLowerCase();
  for (const rule of RECIPE_RULES) if (rule.test.test(key)) return rule.recipe;
  return null;
}

/**
 * Split-suffix continuation coalescing (Era B v2 + v2.1, ai-training's gate): a
 * `-b/-b2/-c…` id suffix marks ONE beat split across a pause (the convention keeps the
 * first half's id — `<base>` or `<base>-a` — so the `.start()` anchor survives). v2.1
 * ALSO folds a `-a<digit>` WITHIN-GROUP continuation (`<base>-a2` continues `<base>-a`,
 * a second segment of the same split — the send-line reveal case) while `-a` (no digit)
 * stays the base half. Returns the BASE beat id this segment continues (so it shares the
 * base's component + anchor, no double-emit), or null if it's a standalone/base beat.
 * Deterministic: a pure function of the id set. Only coalesces when the base sibling
 * actually exists (else standalone).
 */
export function continuationBaseOf(id: string, ids: ReadonlySet<string>): string | null {
  // v2.1: `<stem>-a<digits>` (an `-a` WITH a trailing digit, e.g. -a2) → continues
  // `<stem>-a` (the first half of the same split group). `-a` with no digit is the base.
  const aDigit = /^(.*)-a\d+$/.exec(id);
  if (aDigit) {
    const base = `${aDigit[1]!}-a`;
    return ids.has(base) ? base : null;
  }
  const m = /^(.*)-([b-z])(\d*)$/.exec(id); // new-letter continuations (a = the base half)
  if (!m) return null;
  const stem = m[1]!;
  if (ids.has(`${stem}-a`)) return `${stem}-a`;
  if (ids.has(stem)) return stem;
  return null; // no base sibling → treat as a standalone beat, not a continuation
}

/** A segment's text, flattened to one line + trimmed, for a `//` line comment. */
function commentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The per-segment classification the emitter AND the CLI summary share (so the "N
 * recipes / M stubs" report can't disagree with what's emitted): a `continuation`
 * (a `-b/-c` pause-split, coalesced into its base beat), a `recipe` (confident
 * id-convention), or an honest `stub` (optionally frame-owned). Deterministic — a pure
 * function of the segment list (ids + order).
 */
export type SegmentPick =
  | { seg: string; text: string; kind: 'continuation'; base: string }
  | { seg: string; text: string; kind: 'recipe'; recipe: RecipeName }
  | { seg: string; text: string; kind: 'stub'; frameOwned: boolean };

export function classifySegments(segments: ReadonlyArray<{ id: string; text: string }>): SegmentPick[] {
  const idSet = new Set(segments.map((s) => s.id));
  return segments.map((s): SegmentPick => {
    const base = continuationBaseOf(s.id, idSet);
    if (base !== null) return { seg: s.id, text: s.text, kind: 'continuation', base };
    const recipe = selectRecipe(s.id);
    if (recipe !== null) return { seg: s.id, text: s.text, kind: 'recipe', recipe };
    return { seg: s.id, text: s.text, kind: 'stub', frameOwned: isFrameOwned(s.id) };
  });
}

/**
 * Era B v3 editorial inference: the FIRST body beat (where a title card would animate
 * OUT as the body begins) — the first pick that is neither a cold-open, a frame-owned
 * bookend, nor a continuation. Id-inferable, so the scaffold fills `titleOutSeg`; null
 * (→ a TODO) when there's no clear body beat.
 */
function inferTitleOutSeg(picks: SegmentPick[]): string | null {
  for (const p of picks) {
    if (p.kind === 'continuation') continue;
    // cold-open + title-card are structural BOOKENDS — the title animates out into the
    // first BODY beat AFTER them, so skip both (and frame-owned bookend stubs).
    if (p.kind === 'recipe' && (p.recipe === 'cold-open' || p.recipe === 'title-card')) continue;
    if (p.kind === 'stub' && p.frameOwned) continue;
    return p.seg;
  }
  return null;
}

/** Era B v3: the outro segment (a frame-owned `outro` convention), id-inferable. */
function inferOutroSeg(segments: ReadonlyArray<{ id: string }>): string | null {
  const m = segments.find((s) => /(^|[-_ ])outro([-_ ]|$)/.test(s.id.toLowerCase()));
  return m ? m.id : null;
}

/** `titleOutSeg: '<seg>'` when inferred, else a TODO placeholder — deterministic. */
function segFieldOrTodo(seg: string | null, todo: string): string {
  return seg !== null ? `${JSON.stringify(seg)}, // inferred from the narration ids` : `"TODO", // TODO: ${todo}`;
}

/**
 * Generate the beat-skeleton module SOURCE from a timing manifest. Pure — same
 * `(timing, base, frame?)` → byte-identical string. Exported for the scaffold-output
 * golden + determinism tests. With `frame`, emits the author's episode frame via the
 * `scaffoldFrame(opts, buildBody)` callback-adapter instead of the inline caption
 * wiring + `// TODO frame:` marker (Era B v3 cut 1).
 */
export function generateScaffoldModule(timing: ScaffoldTiming, base: string, frame?: string): string {
  if (frame !== undefined) return generateFramedModule(timing, base, frame);
  const segments = timing.segments;
  const picks = classifySegments(segments);
  const anyRecipe = picks.some((p) => p.kind === 'recipe');
  const ids = segments.map((s) => JSON.stringify(s.id)).join(', ');

  const lines: string[] = [];
  lines.push(`// Generated from ${base}.narration.timing.json by gs scaffold — a first-draft beat`);
  lines.push(`// skeleton. Refine the // TODO markers, then re-run to regenerate (this file is a`);
  lines.push(`// PURE FUNCTION of the committed timing manifest, so a re-run is byte-stable).`);
  lines.push(`import { key, timeline, track } from '@glissade/core';`);
  lines.push(`import { captionNode, captionTrack, narration, type NarrationTiming } from '@glissade/narrate';`);
  lines.push(`import { createScene, type SceneModule } from '@glissade/scene';`);
  if (anyRecipe) lines.push(`import { recipe } from '@glissade/scene/recipes';`);
  lines.push(`import timingJson from './${base}.narration.timing.json';`);
  lines.push(``);
  lines.push(`const timing = timingJson as NarrationTiming;`);
  lines.push(`const beats = narration(timing);`);
  lines.push(`const SIZE = { w: 1920, h: 1080 };`);
  lines.push(``);
  lines.push(`// Drift-guard: fail loud at build time if the committed narration no longer has a`);
  lines.push(`// segment this skeleton anchors to (a renamed/removed id → an error, not a silent drop).`);
  lines.push(`beats.require([${ids}]);`);
  lines.push(``);
  lines.push(`// TODO frame: wrap the children + tracks below with YOUR episode frame — glissade`);
  lines.push(`// owns the caption/narration wiring above; the bookend frame is yours, e.g.`);
  lines.push(`//   const ep = makeEpisode({ accent, title, habit, next, footnote, timing });`);
  lines.push(`//   … ep.push(<the beat components>) … export default ep.finish({ audio: beats.clips('./${base}.narration-cache') });`);
  lines.push(``);
  lines.push(`const mod: SceneModule = {`);
  lines.push(`  createScene: () =>`);
  lines.push(`    createScene({`);
  lines.push(`      size: SIZE,`);
  lines.push(`      children: [`);
  for (const p of picks) {
    if (p.kind === 'continuation') {
      lines.push(`        // '${p.seg}' continues '${p.base}' (a pause-split of one beat) — no separate component; the '${p.base}' beat covers it. "${commentText(p.text)}"`);
    } else if (p.kind === 'recipe') {
      lines.push(`        // beat '${p.seg}' — "${commentText(p.text)}"`);
      lines.push(`        recipe(${JSON.stringify(p.recipe)}, { id: ${JSON.stringify(p.seg)}, frame: SIZE }), // TODO: refine props from the line above`);
    } else {
      const hint = p.frameOwned ? ' [likely FRAME-owned → route to your // TODO frame]' : '';
      lines.push(`        // TODO beat: drop a component for '${p.seg}'${hint} — "${commentText(p.text)}" (anchor: beats.start(${JSON.stringify(p.seg)}))`);
    }
  }
  lines.push(`        captionNode(SIZE),`);
  lines.push(`      ],`);
  lines.push(`    }),`);
  lines.push(`  timeline: timeline({`);
  lines.push(`    fps: 60,`);
  lines.push(`    duration: beats.totalDuration,`);
  lines.push(`    labels: beats.labels(),`);
  lines.push(`    tracks: [`);
  lines.push(`      captionTrack(timing),`);
  for (const p of picks) {
    if (p.kind === 'continuation') {
      // no separate track — the base beat's track spans the split; nothing to emit here.
      continue;
    } else if (p.kind === 'recipe') {
      lines.push(`      // '${p.seg}' pops in at its narration start (refine the ease/offset)`);
      lines.push(`      track(${JSON.stringify(p.seg + '/opacity')}, 'number', [`);
      lines.push(`        key(beats.start(${JSON.stringify(p.seg)}), 0),`);
      lines.push(`        key(beats.start(${JSON.stringify(p.seg)}) + 0.3, 1, 'easeOutCubic'),`);
      lines.push(`      ]),`);
    } else {
      const hint = p.frameOwned ? ' [likely FRAME-owned]' : '';
      lines.push(`      // TODO beat: anchor '${p.seg}' props to beats.start(${JSON.stringify(p.seg)})${hint} — "${commentText(p.text)}"`);
    }
  }
  lines.push(`    ],`);
  lines.push(`    audio: beats.clips('./${base}.narration-cache'),`);
  lines.push(`  }),`);
  lines.push(`};`);
  lines.push(``);
  lines.push(`export default mod;`);
  lines.push(``);
  return lines.join('\n');
}

/**
 * Era B v3 cut 1: emit the beat skeleton WRAPPED in the author's episode frame via the
 * `scaffoldFrame(opts, buildBody)` callback-adapter. The frame OWNS the captions / labels
 * / backdrop / duration (finish()), so this DROPS the inline caption wiring the frameless
 * output emits; the body is authored imperatively against the `ep` handle
 * (ep.push/ep.add/ep.anchor/ep.fadeIn/ep.habit). Pure — `(timing, base, frame)` →
 * byte-identical string. Editorial opts the scaffold can't infer are honest TODO
 * placeholders; `titleOutSeg`/`outroSeg` are id-inferable.
 */
function generateFramedModule(timing: ScaffoldTiming, base: string, frame: string): string {
  const segments = timing.segments;
  const picks = classifySegments(segments);
  const anyRecipe = picks.some((p) => p.kind === 'recipe');
  const ids = segments.map((s) => JSON.stringify(s.id)).join(', ');
  const titleOut = inferTitleOutSeg(picks);
  const outro = inferOutroSeg(segments);

  const lines: string[] = [];
  lines.push(`// Generated from ${base}.narration.timing.json by gs scaffold --frame — a first-draft`);
  lines.push(`// beat skeleton wrapped in YOUR episode frame (scaffoldFrame). Refine the // TODO`);
  lines.push(`// markers, then re-run (a PURE FUNCTION of the committed manifest + the --frame path).`);
  if (anyRecipe) lines.push(`import { recipe } from '@glissade/scene/recipes';`);
  lines.push(`import { scaffoldFrame } from ${JSON.stringify(frame)};`);
  lines.push(`import { type NarrationTiming } from '@glissade/narrate';`);
  lines.push(`import timingJson from './${base}.narration.timing.json';`);
  lines.push(``);
  lines.push(`const timing = timingJson as NarrationTiming;`);
  lines.push(`const SIZE = { w: 1920, h: 1080 };`);
  lines.push(``);
  lines.push(`// scaffoldFrame(opts, buildBody) is YOUR ~6-line adapter over your episode frame:`);
  lines.push(`//   makeEpisode(opts) -> buildBody(ep) -> ep.finish({ audio: opts.audio ?? [] }).`);
  lines.push(`// The frame OWNS captions / labels / backdrop / duration; the body is authored`);
  lines.push(`// imperatively against the ep handle (ep.push / ep.add / ep.anchor / ep.fadeIn / ep.habit).`);
  lines.push(`export default scaffoldFrame(`);
  lines.push(`  {`);
  lines.push(`    size: SIZE,`);
  lines.push(`    timing,`);
  lines.push(`    require: [${ids}], // drift-guard: every anchored segment id (frame calls narration(timing).require)`);
  lines.push(`    // EDITORIAL — the scaffold can't infer these; fill once per episode:`);
  lines.push(`    accent: "#888888", // TODO: your module accent color`);
  lines.push(`    title: { title: "TODO: episode title" },`);
  lines.push(`    habitText: "TODO: the habit-card line",`);
  lines.push(`    next: { title: "TODO: next-episode title" },`);
  lines.push(`    footnote: { text: "TODO: source note", verified: false },`);
  lines.push(`    titleOutSeg: ${segFieldOrTodo(titleOut, 'the segment where the title card animates out')}`);
  lines.push(`    outroSeg: ${segFieldOrTodo(outro, 'the outro segment id')}`);
  lines.push(`  },`);
  lines.push(`  (ep) => {`);
  for (const p of picks) {
    if (p.kind === 'continuation') {
      lines.push(`    // '${p.seg}' continues '${p.base}' (a pause-split of one beat) — no separate component. "${commentText(p.text)}"`);
    } else if (p.kind === 'recipe') {
      lines.push(`    // beat '${p.seg}' — "${commentText(p.text)}"`);
      lines.push(`    ep.push(recipe(${JSON.stringify(p.recipe)}, { id: ${JSON.stringify(p.seg)}, frame: ep.size })); // TODO: refine props`);
      lines.push(`    ep.add(ep.fadeIn(${JSON.stringify(p.seg)}, ep.anchor.start(${JSON.stringify(p.seg)}))); // TODO: refine the entrance`);
    } else {
      const hint = p.frameOwned ? ' [likely FRAME-owned → route to opts above]' : '';
      lines.push(`    // TODO beat: ep.push(<component for '${p.seg}'>) + ep.add(...) at ep.anchor.start(${JSON.stringify(p.seg)})${hint} — "${commentText(p.text)}"`);
    }
  }
  lines.push(`  },`);
  lines.push(`);`);
  lines.push(``);
  return lines.join('\n');
}

/** Resolve the `<base>` (strip `.narration.timing.json` / `.narration.json` / `.json`). */
function baseOf(file: string): string {
  return basename(file)
    .replace(/\.narration\.timing\.json$/i, '')
    .replace(/\.narration\.json$/i, '')
    .replace(/\.json$/i, '');
}

export function scaffoldCommand(opts: ScaffoldOptions): ScaffoldCommandResult {
  const inputAbs = resolve(opts.input);
  if (!/\.json$/i.test(inputAbs)) {
    throw new Error(`${opts.input}: gs scaffold expects a <base>.narration.timing.json manifest`);
  }
  let timing: ScaffoldTiming;
  try {
    timing = JSON.parse(readFileSync(inputAbs, 'utf8')) as ScaffoldTiming;
  } catch (err) {
    throw new Error(`${opts.input}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(timing.segments) || timing.segments.length === 0) {
    throw new Error(`${opts.input}: no narration segments — nothing to scaffold`);
  }

  const base = baseOf(inputAbs);
  const outDir = resolve(opts.out ?? dirname(inputAbs));
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${base}.scaffold.ts`);
  if (existsScaffold(outFile) && opts.force !== true) {
    throw new Error(
      `${outFile} already exists — refusing to clobber (re-run with --force to overwrite your refinements)`,
    );
  }

  const code = generateScaffoldModule(timing, base, opts.frame);
  writeFileSync(outFile, code);

  const picks = classifySegments(timing.segments);
  return {
    out: outFile,
    recipes: picks.filter((p) => p.kind === 'recipe').map((p) => ({ seg: p.seg, recipe: (p as { recipe: string }).recipe })),
    stubs: picks.filter((p) => p.kind === 'stub').map((p) => p.seg),
    continuations: picks.filter((p) => p.kind === 'continuation').map((p) => p.seg),
  };
}

// tiny existsSync wrapper kept local so the pure generateScaffoldModule stays fs-free
function existsScaffold(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}
