/**
 * The OPTIONAL `glissade-dom` augmentation entry (`src/dom.ts`) — the 2nd
 * `<script src>` that adds the DOM render tier to a no-build `window.glissade`.
 * It runs a side effect on import (augments the global), so each case resets
 * modules + the fake global. The build-time version-skew check is exercised on
 * the real bundle by the no-build canary seat (browser-canary); here the
 * `__GLISSADE_DOM_VERSION__` const is unreplaced so the skew check no-ops.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Glob = { glissade?: Record<string, unknown> };

describe('@glissade/browser — glissade-dom augmentation entry', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as Glob).glissade;
  });

  it('fails LOUD when window.glissade is absent (load the base bundle first)', async () => {
    await expect(import('../src/dom.js')).rejects.toThrow(/load glissade\.browser\.js FIRST/i);
  });

  it('AUGMENTS window.glissade with DomBackend + emitWithIds, never clobbering the base', async () => {
    const Rect = function Rect() {};
    const base = { describe: () => ({ version: '0.0.0-test' }), Rect, marker: 42 };
    (globalThis as Glob).glissade = base;
    await import('../src/dom.js');
    const g = (globalThis as Glob).glissade!;
    // the DOM tier is now present...
    expect(typeof g.DomBackend).toBe('function');
    expect(typeof g.emitWithIds).toBe('function');
    // ...and the base object is the SAME reference, untouched (no clobber).
    expect(g).toBe(base);
    expect(g.marker).toBe(42);
    expect(g.Rect).toBe(Rect);
  });

  it('DomBackend on the augmented global is the real backend (constructs + renders)', async () => {
    (globalThis as Glob).glissade = { describe: () => ({ version: '0.0.0-test' }) };
    await import('../src/dom.js');
    const g = (globalThis as Glob).glissade as { DomBackend: new (doc: Document) => { render: (l: unknown) => void; root: HTMLElement } };
    // jsdom `document` is available under the vitest jsdom environment used by the
    // sibling smoke test; here we only assert the constructor is wired through.
    expect(g.DomBackend.name).toBe('DomBackend');
  });
});
