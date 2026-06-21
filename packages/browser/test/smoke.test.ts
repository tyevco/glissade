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
  });

  it('still exposes the base embed surface (scene + player + element)', () => {
    expect(typeof glissade.Path).toBe('function');
    expect(typeof glissade.mount).toBe('function');
    expect(typeof glissade.GsPlayerElement).toBe('function');
    // The element side-effect auto-registered <gs-player>.
    expect(customElements.get('gs-player')).toBeDefined();
  });
});
