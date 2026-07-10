/**
 * Build-integrity guard — runs in the release pipeline AFTER `pnpm build` +
 * `pnpm build:browser`, BEFORE publish, so a broken BUILT ARTIFACT fails the publish
 * instead of silently shipping (the "verify the shipped artifact, not the gated pre"
 * discipline wired into the release).
 *
 * WHY THIS EXISTS: glissade 0.71.0 shipped with `splitToFit` calling an UNBOUND
 * `resolveMeasurer` — an intermittent tsdown/rolldown collision-rename (`resolveMeasurer$1`)
 * at the stable-promote rebuild orphaned one call site (`type2.js:69`) on BOTH the Node
 * bundle and the browser IIFE → `ReferenceError` on every `splitToFit` call → caption-split
 * dead on @latest. The pre.0 the seats gated was clean; the fresh stable rebuild broke it,
 * and no seat's byte-carry could see it (their suites don't CALL splitToFit). Two things
 * catch this class:
 *   (1) RUNTIME-EXERCISE every resolveMeasurer caller on the built Node dist (each throws
 *       if its measurer-resolve reference went unbound) — breadth matters because the
 *       intermittent rename could orphan a DIFFERENT caller next time, not just splitToFit.
 *   (2) STATIC-GREP the minified browser IIFE for the unbound symptom — an internal helper
 *       name (resolveMeasurer/breakLines/…) surviving as a full-word CALL in a MINIFIED
 *       bundle can only be an unbound free reference (a clean build minifies it to `Ge`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const fail = (msg) => {
  console.error(`FAIL bundle-integrity: ${msg}`);
  process.exit(1);
};

// a REAL (non-estimating) measurer, so resolveMeasurer returns it without throwing
// MeasurerRequiredError — every text-geometry call should then run to completion.
const measurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.6, ascent: f.size * 0.8, descent: f.size * 0.2 }),
};
const font = { family: 'Test', size: 20, weight: 400 };

// ── (1) runtime-exercise every resolveMeasurer caller on the BUILT Node scene dist ──
const typeUrl = new URL('packages/scene/dist/type.js', root);
const indexUrl = new URL('packages/scene/dist/index.js', root);
const exercised = [];
try {
  const type = await import(typeUrl.href);
  const scene = await import(indexUrl.href);

  const call = (name, fn) => {
    try {
      fn();
      exercised.push(name);
    } catch (e) {
      // a ReferenceError (unbound resolveMeasurer/…) or any throw with a real measurer
      // means the built artifact's measurer-resolve reference is broken for this caller.
      fail(`${name}() threw on the built Node dist — likely an unbound measurer-resolve reference (${e?.name}: ${e?.message})`);
    }
  };

  const long = 'the quick brown fox jumps over the lazy dog and then keeps on running further still';
  // /type callers — all resolve a measurer through the same chokepoint splitToFit uses.
  call('splitToFit', () => type.splitToFit(long, { maxWidth: 120, font, maxLines: 2, measurer }));
  call('splitText', () => type.splitText({ id: 't', text: 'a b c', fontSize: 20 }, { by: 'word', measurer }));
  call('fitText', () => type.fitText(new scene.Text({ id: 't', text: 'hello world', fontSize: 20 }), { maxW: 200, measurer }));
  call('fitTextSize', () => type.fitTextSize(new scene.Text({ id: 't', text: 'hello world', fontSize: 20 }), { maxW: 200, measurer }));
  call('fitTextGroup', () => type.fitTextGroup([new scene.Text({ id: 'a', text: 'hi', fontSize: 20 })], { maxW: 200, measurer }));
  call('revealWords', () => type.revealWords({ id: 't', text: 'a b c', fontSize: 20 }, { measurer }));
  call('revealLines', () => type.revealLines({ id: 't', text: 'a b c', fontSize: 20 }, { measurer }));
  call('emphasizeWords', () => type.emphasizeWords({ id: 't', text: 'a b c', fontSize: 20 }, [0], { measurer }));

  // Text instance getters — each independently resolves a measurer (positional), so an
  // intermittent rename could orphan any one of them.
  const mk = () => new scene.Text({ id: 't', text: 'hello brave new world', fontSize: 20 });
  call('Text.measuredSize', () => mk().measuredSize(measurer));
  call('Text.intrinsicSize', () => mk().intrinsicSize(measurer));
  call('Text.wordBoxes', () => mk().wordBoxes(measurer));
  call('Text.lineBoxes', () => mk().lineBoxes(measurer));
  call('Text.graphemeBoxes', () => mk().graphemeBoxes(measurer));
} catch (e) {
  fail(`could not import the built scene dist to exercise it (${e?.name}: ${e?.message})`);
}

// ── (2) static-grep the built browser IIFE for the unbound-identifier symptom ──
// In a MINIFIED bundle these internal helpers are renamed (Ge/$1/…); a surviving
// full-word CALL to one is an unbound free reference (the 0.71.0 break).
const iifePath = fileURLToPath(new URL('packages/browser/dist/glissade.browser.js', root));
let iife;
try {
  iife = readFileSync(iifePath, 'utf8');
} catch (e) {
  fail(`could not read the built browser IIFE at ${iifePath} (${e?.message}) — was 'pnpm build:browser' run first?`);
}
// INTERNAL helpers that are NEVER a public window.glissade export — so in a clean
// MINIFIED bundle they appear 0 times as a full-word call (they minify to Ge/$1/…).
// A surviving `<name>(` = an unbound free reference (the 0.71.0 break: splitToFit's body
// orphaned resolveMeasurer + breakLines + quantize together). Verified 0 on 0.70.0 /
// 0.71.1-pre.0, ≥1 on the broken 0.71.0. NB `measureWrappedText` is DELIBERATELY excluded
// — it IS a public window.glissade export (since 0.23), so it legitimately appears by name.
const INTERNAL_HELPERS = ['resolveMeasurer', 'breakLines', 'quantize', 'segmentWords', 'segmentGraphemes'];
for (const name of INTERNAL_HELPERS) {
  // a bare CALL: not preceded by a word/`.`/`$` char (so not a property or a longer id),
  // immediately followed by `(`. A clean minified bundle has zero of these.
  const re = new RegExp(`[^.A-Za-z0-9_$]${name}\\(`, 'g');
  const n = (iife.match(re) || []).length;
  if (n > 0) fail(`the browser IIFE has ${n} unbound CALL(s) to '${name}(' — a minified bundle must not contain the full helper name as a call (0.71.0 shipped '${name}' unbound). The build's collision-rename left a call site orphaned; re-run the build.`);
}

console.log(`ok  bundle-integrity — ${exercised.length} text-geometry callers run on the built Node dist; the browser IIFE has no unbound measurer-helper calls`);
