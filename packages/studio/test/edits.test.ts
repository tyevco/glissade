import { describe, expect, it } from 'vitest';
import { key, sampleTrack, spring, track, type Track } from '@glissade/core';
import {
  addKeyAt,
  closestIndex,
  deleteKeyAt,
  formatValue,
  parseValue,
  retimeKeyAt,
  setEaseAt,
  setValueAt,
  upsertKeyAt,
} from '../src/edits.js';

const base = (): Track<number> => track('n/x', 'number', [key(0, 0), key(1, 100, 'easeInOutCubic'), key(2, 50)]);

describe('keyframe edit ops (§6.2): pure, always-normalized', () => {
  it('addKeyAt samples the current curve and refuses near-duplicates', () => {
    const tr = base();
    const keys = addKeyAt(tr, 0.5)!;
    expect(keys.length).toBe(4);
    const added = keys.find((k) => k.t === 0.5)!;
    expect(added.value).toBe(sampleTrack(tr, 0.5)); // curve-sampled: adding a key never changes the shape at t
    expect(addKeyAt(tr, 1.0004)).toBeNull(); // within 1 ms of an existing key
    expect(addKeyAt(tr, -1)).toBeNull();
  });

  it('deleteKeyAt removes the nearest key but never the last one', () => {
    const keys = deleteKeyAt(base(), 1.1)!;
    expect(keys.map((k) => k.t)).toEqual([0, 2]);
    const single = track('n/x', 'number', [key(0, 7)]);
    expect(deleteKeyAt(single, 0)).toBeNull();
  });

  it('retimeKeyAt moves by identity (closest-t), clamps at 0, and re-sorts', () => {
    const keys = retimeKeyAt(base(), 1, 1.6);
    expect(keys.map((k) => k.t)).toEqual([0, 1.6, 2]);
    expect(keys[1]!.value).toBe(100);
    const crossed = retimeKeyAt(base(), 1, 2.5); // dragged past its neighbor
    expect(crossed.map((k) => k.t)).toEqual([0, 2, 2.5]);
    expect(crossed[2]!.value).toBe(100); // the dragged key keeps its value through the swap
  });

  it('setValueAt and setEaseAt address the nearest key; clearing an ease drops the property', () => {
    const valued = setValueAt(base(), 0.9, -5);
    expect(valued[1]).toMatchObject({ t: 1, value: -5 });
    const eased = setEaseAt(base(), 2, 'easeOutBack');
    expect(eased[2]!.ease).toBe('easeOutBack');
    const cleared = setEaseAt(base(), 1, undefined);
    expect('ease' in cleared[1]!).toBe(false);
  });

  it('spring eases re-pin t through every operation (§2.7 invariant)', () => {
    const cfg = { kind: 'spring' as const, stiffness: 170, damping: 26, mass: 1 };
    const expected = spring.duration(cfg);
    const sprung = setEaseAt(base(), 1, cfg);
    expect(sprung[1]!.t).toBeCloseTo(expected, 9); // t became intrinsic on assignment
    // retiming the spring key itself snaps back; retiming its predecessor carries it
    const tr2: Track = { target: 'n/x', type: 'number', keys: sprung };
    const dragged = retimeKeyAt(tr2, sprung[1]!.t, 1.7);
    expect(dragged[1]!.t).toBeCloseTo(expected, 9);
    const carried = retimeKeyAt(tr2, 0, 0.4);
    expect(carried[1]!.t).toBeCloseTo(0.4 + expected, 9);
  });

  it('upsertKeyAt updates within 1 ms, inserts otherwise — the inspector write-at-playhead', () => {
    const updated = upsertKeyAt(base(), 1.0004, 42);
    expect(updated.length).toBe(3);
    expect(updated[1]).toMatchObject({ t: 1, value: 42 });
    const inserted = upsertKeyAt(base(), 1.5, 42);
    expect(inserted.length).toBe(4);
    expect(inserted[2]).toMatchObject({ t: 1.5, value: 42 });
  });

  it('closestIndex resolves identity after re-sorts', () => {
    expect(closestIndex(base().keys, 0.4)).toBe(0);
    expect(closestIndex(base().keys, 0.6)).toBe(1);
  });
});

describe('value parsing per type', () => {
  it('numbers, vec2, color, boolean, string', () => {
    expect(parseValue('number', ' 3.5 ')).toBe(3.5);
    expect(parseValue('number', 'abc')).toBeNull();
    expect(parseValue('vec2', '3, 4')).toEqual([3, 4]);
    expect(parseValue('vec2', '[3 4]')).toEqual([3, 4]);
    expect(parseValue('vec2', '3')).toBeNull();
    expect(parseValue('color', '#ff8800')).toBe('#ff8800');
    expect(parseValue('color', 'not-a-color')).toBeNull();
    expect(parseValue('boolean', 'true')).toBe(true);
    expect(parseValue('boolean', 'yes')).toBeNull();
    expect(parseValue('string', 'hello')).toBe('hello');
  });

  it('formatValue round-trips through parseValue', () => {
    expect(parseValue('number', formatValue(0.30000000000000004))).toBe(0.3);
    expect(parseValue('vec2', formatValue([1.5, -2] as const))).toEqual([1.5, -2]);
  });
});

describe('key stacking (§6.2 UX): near-coincident keys group; clicks cycle', () => {
  it('groups runs within the threshold and leaves spaced keys alone', async () => {
    const { groupStacks } = await import('../src/edits.js');
    const keys = [key(0, 0), key(1, 1), key(1.001, 2), key(1.002, 3), key(2, 4)];
    const stacks = groupStacks(keys, 2);
    expect(stacks.map((s) => s.keys.length)).toEqual([1, 3, 1]);
    expect(stacks[1]!.t).toBe(1);
    // long timeline: the same 1 ms gap collapses harder; short: it can resolve
    expect(groupStacks(keys, 0.5).length).toBeLessThanOrEqual(3);
  });

  it('cycleStack starts at the first member and wraps', async () => {
    const { cycleStack, groupStacks } = await import('../src/edits.js');
    const stack = groupStacks([key(1, 1), key(1.001, 2), key(1.002, 3)], 2)[0]!;
    const first = cycleStack(stack, null);
    expect(first.t).toBe(1);
    const second = cycleStack(stack, first.t);
    expect(second.t).toBe(1.001);
    expect(cycleStack(stack, 1.002).t).toBe(1); // wraps
  });

  it('isSpringKey detects only spring eases', async () => {
    const { isSpringKey } = await import('../src/edits.js');
    expect(isSpringKey(key(1, 0, { kind: 'spring', stiffness: 170, damping: 26, mass: 1 }))).toBe(true);
    expect(isSpringKey(key(1, 0, 'easeOutQuad'))).toBe(false);
    expect(isSpringKey(key(1, 0))).toBe(false);
  });
});
