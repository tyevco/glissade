/**
 * The doctest harness (§0.24 onboarding) — runs every surfaced example against
 * the REAL API and asserts it never throws. This is the can't-drift guard: a
 * `describe({ examples: true })` snippet that references a renamed export or a
 * changed shape fails HERE, in CI, before it can mislead a cold agent. Non-gated
 * (runs in the normal suite).
 */
import { describe, expect, it } from 'vitest';
import { EXAMPLES, examplesByKey } from '../src/examples.js';
import { describe as apiDescribe } from '../src/describe.js';

describe('examples corpus — runnable + drift-guarded', () => {
  it('every surfaced example RUNS against the real API without throwing', () => {
    for (const ex of EXAMPLES) {
      expect(() => ex.run(), `example '${ex.key}' threw — its code drifted from the API`).not.toThrow();
    }
  });

  it('every example CODE is self-contained — imports every glissade identifier it uses (copy-paste safe)', () => {
    // browser-canary 0.24.0-pre.2: the run() thunk has the module's imports in
    // scope, so the doctest stayed green even when the displayed `code` string
    // omitted an import (e.g. `new Rect(...)` in a Stack's children without
    // importing Rect) — copy-paste threw `ReferenceError`. This guards the
    // *snippet* itself: every glissade API identifier it uses must be imported.
    const m = apiDescribe();
    const apiNames = new Set([
      ...Object.keys(m.nodes),
      ...m.helpers.map((h) => h.name),
      'timeline',
      'key',
      'track',
      'createScene',
      'evaluate',
      'pathFromSvg',
    ]);
    for (const ex of EXAMPLES) {
      const noComments = ex.code.replace(/\/\/[^\n]*/g, ''); // strip line comments (prose isn't "use")
      const importBlock = (noComments.match(/import\s+\{[^}]*\}/g) ?? []).join(' ');
      const imported = new Set([...importBlock.matchAll(/[A-Za-z_]\w*/g)].map((mm) => mm[0]));
      const body = noComments.replace(/import\s+\{[^}]*\}\s+from\s+'[^']*';?/g, '');
      for (const name of apiNames) {
        // `new Name(` or a bare `Name` not preceded by `.` (so `.method` doesn't count)
        const used = new RegExp(`(?:new\\s+|[^.\\w$])${name}\\b`).test(body);
        expect(!used || imported.has(name), `example '${ex.key}': uses \`${name}\` but the snippet doesn't import it (copy-paste would throw)`).toBe(true);
      }
    }
  });

  it('every corpus key is a real describe key (no orphan examples attaching to nothing)', () => {
    const m = apiDescribe();
    const validKeys = new Set([...Object.keys(m.nodes), ...m.builder.methods.map((x) => x.name), ...m.helpers.map((x) => x.name)]);
    for (const ex of EXAMPLES) {
      expect(validKeys.has(ex.key), `example key '${ex.key}' matches no node/builder method/helper`).toBe(true);
    }
  });

  it('importing the corpus registers it → describe({ examples: true }) attaches every snippet', () => {
    const byKey = examplesByKey();
    const m = apiDescribe({ examples: true });
    for (const [k, codes] of Object.entries(byKey)) {
      const attached = m.nodes[k]?.examples ?? m.builder.methods.find((x) => x.name === k)?.examples ?? m.helpers.find((x) => x.name === k)?.examples;
      expect(attached, `key '${k}' not surfaced in describe({ examples: true })`).toEqual(codes);
    }
  });

  it('describe() (zero-arg) stays examples-free even after the corpus is imported (byte-identical manifest)', () => {
    const m = apiDescribe();
    expect(m.nodes.Rect?.examples).toBeUndefined();
    expect(m.builder.methods.find((x) => x.name === 'to')?.examples).toBeUndefined();
    expect(m.helpers.find((x) => x.name === 'splitText')?.examples).toBeUndefined();
  });

  it('covers the core node + builder + helper surface (a floor, so the corpus does not silently shrink)', () => {
    const keys = new Set(EXAMPLES.map((e) => e.key));
    for (const must of ['Rect', 'Text', 'Group', 'to', 'stagger', 'splitText', 'measureWrappedText']) {
      expect(keys.has(must), `corpus is missing a core example for '${must}'`).toBe(true);
    }
  });
});
