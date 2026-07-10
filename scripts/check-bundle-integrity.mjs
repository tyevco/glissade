/**
 * Build-integrity guard — runs in the release pipeline AFTER `pnpm build` +
 * `pnpm build:browser`, BEFORE publish, so a broken BUILT ARTIFACT fails the publish
 * instead of silently shipping (the "verify the shipped artifact, not the gated pre"
 * discipline wired into the release).
 *
 * WHY THIS EXISTS: glissade 0.71.0 shipped with `splitToFit` calling an UNBOUND
 * `resolveMeasurer` — an intermittent tsdown/rolldown collision-rename (`resolveMeasurer$1`)
 * at the stable-promote rebuild orphaned one call site on BOTH the Node bundle and the
 * browser IIFE → `ReferenceError` on every `splitToFit` call → caption-split dead on
 * @latest. The pre the seats gated was clean; the fresh stable rebuild broke it, and no
 * seat's byte-carry could see it (their suites don't CALL splitToFit).
 *
 * TWO CHECKS, both on the BUILT artifact:
 *   (1) RUNTIME — smoke every `resolveMeasurer` caller on the built Node dist with the
 *       ESTIMATING measurer + no `estimate` flag, and assert it throws MeasurerRequiredError:
 *       that proves the caller is REACHED and its resolveMeasurer reference is BOUND (an
 *       orphaned rename throws ReferenceError instead; a fn that no longer routes through
 *       the chokepoint doesn't throw at all). The throw fires at resolveMeasurer's ENTRY,
 *       so this needs NONE of a caller's heavy downstream machinery (e.g. Layout.computedSize
 *       is checked without loading Yoga). The caller set is DESCRIBE()-DERIVED — the
 *       {estimate}-bearing describe().surface entries ARE the resolveMeasurer callers, by
 *       construction (that IS what `estimate` opts out of) — so a NEW caller in a future
 *       release fails here as "uncovered" instead of silently shipping unguarded.
 *   (2) STATIC — grep the minified browser IIFE for the unbound symptom: an internal
 *       helper name (resolveMeasurer/breakLines/…) surviving as a full-word CALL in a
 *       MINIFIED bundle can only be an unbound free reference (clean minifies it to `Ge`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const fail = (msg) => {
  console.error(`FAIL bundle-integrity: ${msg}`);
  process.exit(1);
};
const d = (rel) => new URL(`packages/scene/dist/${rel}`, root).href;

// ── (1) runtime-smoke every resolveMeasurer caller on the BUILT Node scene dist ──
try {
  const scene = await import(d('index.js'));
  const type = await import(d('type.js'));
  const { describe } = await import(d('describe.js'));
  const { Row } = await import(d('layoutCtors.js'));
  const { estimatingMeasurer: est, MeasurerRequiredError: MRE, Text } = scene;

  const props = { id: 't', text: 'the quick brown fox', fontSize: 20 };
  const mkText = () => new scene.Text({ id: 't', text: 'the quick brown fox', fontSize: 20 });
  const font = { family: 'Test', size: 20, weight: 400 };

  // name → a thunk that calls the caller with the ESTIMATING measurer + no `estimate` flag,
  // which must throw MeasurerRequiredError (reached + bound). TOP-LEVEL fns keyed by their
  // describe().surface name so the describe()-derived completeness check can match them.
  const smokes = {
    // {estimate}-bearing surface fns (@glissade/scene/type)
    splitText: () => type.splitText(props, { by: 'word', measurer: est }),
    splitToFit: () => type.splitToFit('the quick brown fox jumps', { maxWidth: 120, font, maxLines: 2, measurer: est }),
    fitText: () => type.fitText(mkText(), { maxW: 200, measurer: est }),
    fitTextSize: () => type.fitTextSize(mkText(), { maxW: 200, measurer: est }),
    fitTextGroup: () => type.fitTextGroup([mkText()], { maxW: 200, measurer: est }),
    revealWords: () => type.revealWords(props, { measurer: est }),
    revealLines: () => type.revealLines(props, { measurer: est }),
    emphasizeWords: () => type.emphasizeWords(props, [0], { measurer: est }),
    // instance geometry getters — {Text, Layout} method families (NOT in describe().surface)
    'Text.measuredSize': () => mkText().measuredSize(est),
    'Text.intrinsicSize': () => mkText().intrinsicSize(est),
    'Text.wordBoxes': () => mkText().wordBoxes(est),
    'Text.lineBoxes': () => mkText().lineBoxes(est),
    'Text.graphemeBoxes': () => mkText().graphemeBoxes(est),
    'Layout.computedSize': () => new Row({ children: [mkText()] }).computedSize(est),
  };

  // DESCRIBE()-DERIVED completeness: every {estimate}-bearing surface entry IS a
  // resolveMeasurer caller — assert each has a smoke, so a NEW caller can't ship unguarded.
  const manifest = describe();
  const bearers = (manifest.surface ?? [])
    .filter((e) => (e.options ?? []).some((o) => o.name === 'estimate'))
    .map((e) => e.name);
  const uncovered = bearers.filter((n) => !(n in smokes));
  if (uncovered.length > 0) {
    fail(`describe() lists {estimate}-bearing resolveMeasurer caller(s) with NO build-integrity smoke: ${uncovered.join(', ')} — add them to scripts/check-bundle-integrity.mjs (a new caller must not ship unguarded).`);
  }

  let bound = 0;
  for (const [name, thunk] of Object.entries(smokes)) {
    let threw;
    try {
      thunk();
    } catch (e) {
      threw = e;
    }
    if (threw === undefined) {
      fail(`${name}() did not throw on the built Node dist with the estimating measurer — it should throw MeasurerRequiredError (it no longer routes through the resolveMeasurer chokepoint, or the build dropped the guard).`);
    }
    if (!(threw instanceof MRE)) {
      fail(`${name}() threw ${threw?.name ?? threw} (not MeasurerRequiredError) on the built Node dist — likely an UNBOUND resolveMeasurer reference (a collision-rename orphaned this caller's binding). ${threw?.message ?? ''}`);
    }
    bound++;
  }
  console.log(`ok  bundle-integrity (Node) — ${bound} resolveMeasurer callers reached + bound (${bearers.length} describe()-derived surface + ${bound - bearers.length} instance getters), estimatingMeasurer→MeasurerRequiredError`);
} catch (e) {
  fail(`could not import/exercise the built scene dist (${e?.name}: ${e?.message})`);
}

// ── (2) static-grep the built browser IIFE for the unbound-identifier symptom ──
const iifePath = fileURLToPath(new URL('packages/browser/dist/glissade.browser.js', root));
let iife;
try {
  iife = readFileSync(iifePath, 'utf8');
} catch (e) {
  fail(`could not read the built browser IIFE at ${iifePath} (${e?.message}) — was 'pnpm build:browser' run first?`);
}
// INTERNAL helpers, never a public window.glissade export → in a clean MINIFIED bundle
// they appear 0 times as a full-word call (minified to Ge/$1/…). A surviving `<name>(`
// = an unbound free reference (0.71.0's break). Verified 0 on 0.70.0 / 0.71.1, ≥1 on
// broken 0.71.0. NB `measureWrappedText` is EXCLUDED — it IS a public export (appears 1×).
const INTERNAL_HELPERS = ['resolveMeasurer', 'breakLines', 'quantize', 'segmentWords', 'segmentGraphemes'];
for (const name of INTERNAL_HELPERS) {
  const re = new RegExp(`[^.A-Za-z0-9_$]${name}\\(`, 'g');
  const n = (iife.match(re) || []).length;
  if (n > 0) fail(`the browser IIFE has ${n} unbound CALL(s) to '${name}(' — a minified bundle must not contain the full helper name as a call (0.71.0 shipped '${name}' unbound). The build's collision-rename left a call site orphaned; re-run the build.`);
}

console.log('ok  bundle-integrity (browser IIFE) — no unbound measurer-helper calls');
