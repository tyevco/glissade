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

  it('exposes the SVG `d`-string path parser (from @glissade/scene/path)', () => {
    // The parser is tree-shaken off the base scene index but the convenience
    // bundle re-exports it, so `window.glissade.pathFromSvg` is present.
    expect(typeof glissade.pathFromSvg).toBe('function');
    expect(typeof glissade.parseSvgPathData).toBe('function');
    // A round-trip through the helper builds a Path that constructs (no throw).
    expect(() => new glissade.Path({ data: glissade.pathFromSvg('M0 0 L40 0') })).not.toThrow();
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
});
