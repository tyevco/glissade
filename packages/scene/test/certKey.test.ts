/**
 * 0.62 certKey(scene, timeline) — the PURE semantic content-address, and its
 * LOAD-BEARING consistency with diff(a,b) (the (d) dimension of the two-sided cert
 * gate): certKey(A) === certKey(B)  ⟺  diff(A, B).empty, in BOTH directions, across
 * {no-op / shuffle / prop-change / add / remove / retarget}. The (←) direction
 * (diff-nonempty ⟹ different certKey) is SAFETY-CRITICAL: a collision would serve
 * WRONG cached bytes silently. Both certKey and diff read canonicalScene.ts's ONE
 * canonicalization, so the equivalence holds BY CONSTRUCTION.
 */
import { describe, expect, it } from 'vitest';
import { type Timeline, timeline, track, key } from '@glissade/core';
import { createScene, Rect, Text } from '../src/index.js';
import { diff, certKey, sceneHash, timelineHash } from '../src/diagnostics.js';
import { certSha256 } from '../src/diagnostics.js';

const size = { w: 200, h: 120 };
const empty: Timeline = { version: 1, tracks: [] };

function base() {
  return createScene({
    size,
    children: [
      new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' }),
      new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
    ],
  });
}
// same two nodes, opposite child order (renders identically → diff EMPTY).
function shuffled() {
  return createScene({
    size,
    children: [
      new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
      new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' }),
    ],
  });
}

/** The bidirectional invariant on one pair: equal-key ⟺ empty-diff. */
function assertEquivalence(
  a: { scene: ReturnType<typeof base>; timeline?: Timeline },
  b: { scene: ReturnType<typeof base>; timeline?: Timeline },
) {
  const keyEq = certKey(a.scene, a.timeline) === certKey(b.scene, b.timeline);
  const diffEmpty = diff(a, b).empty;
  expect(keyEq).toBe(diffEmpty);
  return { keyEq, diffEmpty };
}

describe('certKey — SHA-256 known-answer (browser/node identical digest)', () => {
  it('matches FIPS-180-4 vectors', () => {
    expect(certSha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(certSha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('certKey — stability + shuffle-invariance', () => {
  it('is deterministic run-to-run for the same inputs', () => {
    expect(certKey(base(), empty)).toBe(certKey(base(), empty));
    expect(sceneHash(base(), empty)).toBe(sceneHash(base(), empty));
    expect(timelineHash(empty)).toBe(timelineHash(empty));
  });
  it('is CONSTRUCTION-ORDER invariant (shuffle-stable)', () => {
    expect(certKey(base(), empty)).toBe(certKey(shuffled(), empty));
  });
});

describe('certKey ⟺ diff — the bidirectional differential', () => {
  it('(d) no-op: identical scenes → equal key + empty diff', () => {
    const { keyEq, diffEmpty } = assertEquivalence({ scene: base() }, { scene: base() });
    expect(keyEq).toBe(true);
    expect(diffEmpty).toBe(true);
  });

  it('(d) shuffle: order-only difference → equal key + empty diff', () => {
    const { keyEq, diffEmpty } = assertEquivalence({ scene: base() }, { scene: shuffled() });
    expect(keyEq).toBe(true);
    expect(diffEmpty).toBe(true);
  });

  it('(d) prop-change → different key + NON-empty diff (SAFETY: no false hit)', () => {
    const b = createScene({
      size,
      children: [
        new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#ff0000' }), // fill changed
        new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
      ],
    });
    const { keyEq, diffEmpty } = assertEquivalence({ scene: base() }, { scene: b });
    expect(keyEq).toBe(false);
    expect(diffEmpty).toBe(false);
  });

  it('(d) add node → different key + NON-empty diff', () => {
    const b = createScene({
      size,
      children: [
        new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' }),
        new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
        new Rect({ id: 'extra', position: [150, 60], width: 10, height: 10, fill: '#0f0' }),
      ],
    });
    const { keyEq, diffEmpty } = assertEquivalence({ scene: base() }, { scene: b });
    expect(keyEq).toBe(false);
    expect(diffEmpty).toBe(false);
  });

  it('(d) remove node → different key + NON-empty diff', () => {
    const b = createScene({
      size,
      children: [new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' })],
    });
    const { keyEq, diffEmpty } = assertEquivalence({ scene: base() }, { scene: b });
    expect(keyEq).toBe(false);
    expect(diffEmpty).toBe(false);
  });

  it('(d) track retarget → different key + NON-empty diff', () => {
    const a = { scene: base(), timeline: timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 1)])] }) };
    const b = { scene: base(), timeline: timeline({ tracks: [track('cap/opacity', 'number', [key(0, 0), key(1, 1)])] }) };
    const { keyEq, diffEmpty } = assertEquivalence(a, b);
    expect(keyEq).toBe(false);
    expect(diffEmpty).toBe(false);
  });

  it('(d) track keys-change → different key + NON-empty diff', () => {
    const a = { scene: base(), timeline: timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 1)])] }) };
    const b = { scene: base(), timeline: timeline({ tracks: [track('box/opacity', 'number', [key(0, 0), key(1, 0.5)])] }) };
    const { keyEq, diffEmpty } = assertEquivalence(a, b);
    expect(keyEq).toBe(false);
    expect(diffEmpty).toBe(false);
  });

  it('(d) identical tracks in different ORDER → equal key + empty diff', () => {
    const t1 = timeline({
      tracks: [
        track('box/opacity', 'number', [key(0, 0), key(1, 1)]),
        track('cap/opacity', 'number', [key(0, 1), key(1, 0)]),
      ],
    });
    const t2 = timeline({
      tracks: [
        track('cap/opacity', 'number', [key(0, 1), key(1, 0)]),
        track('box/opacity', 'number', [key(0, 0), key(1, 1)]),
      ],
    });
    const { keyEq, diffEmpty } = assertEquivalence({ scene: base(), timeline: t1 }, { scene: base(), timeline: t2 });
    expect(keyEq).toBe(true);
    expect(diffEmpty).toBe(true);
  });
});
