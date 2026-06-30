// @vitest-environment jsdom
/**
 * @glissade/browser convenience-bundle smoke (0.17.1): the single entry that
 * `scripts/build-browser.mjs` inlines into the `window.glissade.*` IIFE must
 * expose the WHOLE embed authoring surface — including the clip tier
 * (presence/each/morph/clip/clipList + the stdlib) that otherwise lives on the
 * tree-shaken `@glissade/core/clips` subpath. The design agent reinvented
 * `presence()` because it wasn't on `window.glissade`; this guards that it now
 * is. jsdom so the `@glissade/element` side-effect (customElements.define) runs.
 */
import { describe, expect, it } from 'vitest';
import * as glissade from '../src/index.js';

describe('@glissade/browser entry surface', () => {
  it('exposes the clip tier (presence/each/morph/clip/clipList + stdlib)', () => {
    // The four members the design agent found MISSING off window.glissade.
    expect(typeof glissade.presence).toBe('function');
    expect(typeof glissade.each).toBe('function');
    expect(typeof glissade.morph).toBe('function');
    expect(typeof glissade.clip).toBe('function');
    // The rest of the clip tier rides along.
    expect(typeof glissade.clipList).toBe('function');
    expect(typeof glissade.popIn).toBe('function');
    expect(typeof glissade.slideIn).toBe('function');
    expect(typeof glissade.pulse).toBe('function');
    expect(typeof glissade.driftLoop).toBe('function');
    // `stagger` was already on the core base index — still present.
    expect(typeof glissade.stagger).toBe('function');
    // 0.18: the presence inline-literal sugar — `presence` accepts a terse
    // enter/exit literal and the `transitionToClip` compiler rides the bundle.
    expect(typeof glissade.transitionToClip).toBe('function');
    expect(() =>
      glissade.presence('card', {
        window: [1, 5],
        enter: { opacity: [0, 1], offset: 16, dur: 0.5, ease: 'easeOutCubic' },
        exit: { opacity: [1, 0], offset: 16, dur: 0.4 },
      }),
    ).not.toThrow();
  });

  it('still exposes the base embed surface (scene + player + element)', () => {
    expect(typeof glissade.Path).toBe('function');
    expect(typeof glissade.mount).toBe('function');
    expect(typeof glissade.GsPlayerElement).toBe('function');
    // The element side-effect auto-registered <gs-player>.
    expect(customElements.get('gs-player')).toBeDefined();
  });

  it('the <gs-player> define is idempotent — re-evaluating the IIFE never throws (0.19.1)', () => {
    // Design-agent finding: re-evaluating @glissade/browser in a realm that
    // already loaded it threw at customElements.define('gs-player', …) (already
    // defined) and ABORTED before the `window.glissade = …` reassign — so the
    // page silently kept the OLD bundle (also bites a double <script> include).
    // The element's `defineGsPlayer` guards the register, so re-running the
    // element define path (the IIFE's only customElements.define) is a clean
    // no-op. Guard it here against regressions: the surface exposes the named
    // exporter, and calling it again — exactly what the module-load side-effect
    // did once — never throws.
    expect(typeof glissade.defineGsPlayer).toBe('function');
    expect(customElements.get('gs-player')).toBeDefined();
    expect(() => glissade.defineGsPlayer()).not.toThrow();
    expect(() => glissade.defineGsPlayer()).not.toThrow();
    // The original registration object survives — the re-call didn't redefine it.
    expect(customElements.get('gs-player')).toBe(glissade.GsPlayerElement);
  });

  it('exposes renderToDataURL on the IIFE — the no-build screenshot DX helper (browser budget 47)', () => {
    // The Claude-Design no-build consumer works ONLY against window.glissade, so
    // the frame-screenshot helper (evaluate→render→data-URL) MUST be on the IIFE
    // to be usable to it. Re-exported from @glissade/backend-canvas2d/snapshot;
    // the browser budget was raised 46→47 for it. Browser-only.
    expect(typeof glissade.renderToDataURL).toBe('function');
    expect(typeof glissade.snapshotCanvas).toBe('function');
    expect(typeof glissade.Canvas2DBackend).toBe('function');
  });

  it('exposes the SVG `d`-string path parser (from @glissade/scene/path)', () => {
    // The parser is tree-shaken off the base scene index but the convenience
    // bundle re-exports it, so `window.glissade.pathFromSvg` is present.
    expect(typeof glissade.pathFromSvg).toBe('function');
    expect(typeof glissade.parseSvgPathData).toBe('function');
    // A round-trip through the helper builds a Path that constructs (no throw).
    expect(() => new glissade.Path({ data: glissade.pathFromSvg('M0 0 L40 0') })).not.toThrow();
  });

  it('exposes splitText (from @glissade/scene/type) — 0.19 kinetic typography for the no-build consumer', () => {
    // splitText is tree-shaken off the base scene index (scene budget) but the
    // no-build consumer that requested it works only against the IIFE, so it's
    // re-exported onto window.glissade.
    expect(typeof glissade.splitText).toBe('function');
  });

  it('exposes the motion-path follow helper (from @glissade/scene/motion) — 0.20 budget review', () => {
    // motionPath / followPath moved off the base scene index onto the tree-shaken
    // @glissade/scene/motion subpath in the 0.20 budget review. The design agent
    // reaches for `window.glissade.motionPath`, and works only against the IIFE,
    // so the convenience bundle MUST re-export the whole follow surface.
    expect(typeof glissade.motionPath).toBe('function');
    expect(typeof glissade.followPath).toBe('function');
    expect(typeof glissade.pointAtLength).toBe('function');
    expect(typeof glissade.pathLength).toBe('function');
    expect(typeof glissade.FollowPath).toBe('function');
  });

  it('exposes the Yoga-free layout ctors + the engine loader (0.20 no-build layout split)', () => {
    // 0.20: the Yoga-free node ctors (Layout/Stack/Row/Column) live on
    // @glissade/scene/layout-ctors — split off loadYogaLayoutEngine so they ride
    // the IIFE WITHOUT inlining Yoga's wasm (the "browser IIFE excludes yoga
    // binding" check-size guard verifies the no-inline). The loader is also
    // re-exported (window.glissade.loadYogaLayoutEngine) so a no-build consumer
    // can register the engine: pass a CDN URL — loadYogaLayoutEngine({ url }) —
    // or an import map resolves the default bare 'yoga-layout/load' specifier
    // (the bare form alone can't resolve in a no-build page; see docs/layout.md).
    expect(typeof glissade.Layout).toBe('function');
    expect(typeof glissade.Stack).toBe('function');
    expect(typeof glissade.Row).toBe('function');
    expect(typeof glissade.Column).toBe('function');
    expect(typeof glissade.loadYogaLayoutEngine).toBe('function');
    // The seam (set/getLayoutEngine) reaches window.glissade via export * scene.
    expect(typeof glissade.setLayoutEngine).toBe('function');
    expect(typeof glissade.getLayoutEngine).toBe('function');
    // Constructing a Stack never touches Yoga (no engine registered) — it only
    // resolves at compute time, so the ctor is safe pre-load.
    expect(() => new glissade.Stack({ children: [] })).not.toThrow();
  });

  it('exposes Grid (from @glissade/scene/grid) — 0.20 build-time track resolver', () => {
    // Grid is a build-time fan-out (like each/splitText), NOT a Yoga feature, on
    // the tree-shaken @glissade/scene/grid subpath. The no-build consumer reaches
    // for window.glissade.Grid, so the convenience bundle re-exports it.
    expect(typeof glissade.Grid).toBe('function');
    // It positions plain children into a column grid and returns a Group (no
    // engine needed — pure arithmetic).
    const g = glissade.Grid({
      columns: 2,
      gap: 10,
      cellHeight: 20,
      width: 100,
      children: [new glissade.Rect({ width: 10, height: 10 }), new glissade.Rect({ width: 10, height: 10 })],
    });
    expect(g.children.length).toBe(2);
  });

  it('exposes the machine-readable API manifest (describe, from @glissade/scene/describe)', () => {
    // 0.18: `glissade.describe()` is the discoverability artifact — the design
    // agent reverse-engineered the API instead of reading it; this guards it's
    // on the bundle and returns a populated, JSON-serializable manifest.
    expect(typeof glissade.describe).toBe('function');
    const m = glissade.describe();
    expect(typeof m.version).toBe('string');
    expect(Object.keys(m.nodes).length).toBeGreaterThan(0);
    expect(m.valueTypes).toContain('vec2');
    expect(m.easings.length).toBeGreaterThan(0);
    expect(m.builder.methods.length).toBeGreaterThan(0);
    // Round-trips through JSON unchanged (the api.json the build commits).
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
    expect(m.nodes.Rect.props.position).toEqual({
      type: 'vec2',
      animatable: true,
      target: '<id>/position',
      arity: 2,
    });
  });

  it('surfaces runnable examples via describe({ examples: true }) — the no-build onboarding fix (0.24)', () => {
    // The browser entry imports @glissade/scene/examples (a side-effect that
    // registers the corpus), so window.glissade.describe({ examples: true })
    // gives the no-build agent a copy-pasteable, doctest-verified snippet per
    // node/builder/helper — the cold agent's worst time-sink (stale examples) fixed.
    const m = glissade.describe({ examples: true });
    expect(m.nodes.Rect?.examples?.length).toBeGreaterThan(0);
    expect(m.builder.methods.find((x) => x.name === 'to')?.examples?.length).toBeGreaterThan(0);
    expect(m.helpers.find((x) => x.name === 'splitText')?.examples?.length).toBeGreaterThan(0);
    // zero-arg stays examples-free — the manifest is byte-identical to before.
    expect(glissade.describe().nodes.Rect?.examples).toBeUndefined();
  });

  it('the curated describe().helpers names ALL resolve to real window.glissade.<name> functions (0.20 drift guard)', () => {
    // CROSS-PACKAGE DRIFT GUARD. describe() lives in `scene`, but several helpers
    // it documents (createPlayer/mount, renderToDataURL/snapshotCanvas) live ABOVE
    // scene in the dep graph — scene CANNOT import them, so the helpers section is
    // a CURATED literal. This test runs in @glissade/browser (which imports the
    // whole IIFE surface, above scene) and asserts every documented helper name is
    // a real function on the bundle — the moment the curated name drifts from the
    // actual export, this fails. (The npm import-path strings are pinned in scene's
    // describe.test.ts against docs/discovery.md.)
    const m = glissade.describe();
    expect(m.helpers.length).toBeGreaterThan(0);
    const surface = glissade as unknown as Record<string, unknown>;
    for (const h of m.helpers) {
      expect(typeof surface[h.name], `helper '${h.name}' is not a function on window.glissade`).toBe('function');
    }
    // sanity: the headline helpers we promised are present by name
    const names = new Set(m.helpers.map((h) => h.name));
    for (const n of ['createPlayer', 'motionPath', 'clip', 'renderToDataURL', 'splitText']) {
      expect(names.has(n), `describe().helpers missing ${n}`).toBe(true);
    }
  });
});
