import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, evaluate } from '../src/index.js';
import { emitWithIds } from '../src/identity.js';

const EMPTY = timeline({ tracks: [] });

// A scene mixing id-bearing and id-less (synthesized) nodes, nesting, opacity<1
// (forces a pushGroup/popGroup), and zIndex reordering — the full positional
// discipline the producer must attribute correctly.
const mixedScene = () =>
  createScene({
    size: { w: 400, h: 300 },
    children: [
      new Group({
        id: 'panel',
        opacity: 0.5, // forces a pushGroup on 'panel'
        children: [
          new Rect({ id: 'bg', width: 100, height: 100, fill: '#222', zIndex: 0 }),
          // no id → contributes `undefined` at its command indices
          new Circle({ radius: 20, fill: '#e6a700', position: [50, 50], zIndex: 1 }),
        ],
      }),
      new Text({ id: 'label', text: 'hi', fontFamily: 'sans', fontSize: 24, fill: '#fff' }),
    ],
  });

describe('emitWithIds — S1 out-of-band node-identity producer', () => {
  it('produces an id stream positionally aligned with the DisplayList commands', () => {
    const { displayList, ids } = emitWithIds(mixedScene(), EMPTY, 0);
    expect(ids.length).toBe(displayList.commands.length);
  });

  it('is byte/deep-equal to the normal evaluate() DisplayList (no geometry change)', () => {
    const normal = evaluate(mixedScene(), EMPTY, 0);
    const { displayList } = emitWithIds(mixedScene(), EMPTY, 0);
    expect(displayList).toEqual(normal);
    // byte-equal too (the load-bearing proof): JSON-serialize both command streams
    expect(JSON.stringify(displayList)).toBe(JSON.stringify(normal));
  });

  it('is stable + identical across two emits of the same scene at the same t', () => {
    const scene = mixedScene();
    const a = emitWithIds(scene, EMPTY, 0);
    const b = emitWithIds(scene, EMPTY, 0);
    expect(b.ids).toEqual(a.ids);
    expect(b.displayList).toEqual(a.displayList);
  });

  it('attributes each command to the emitting node id; id-less nodes contribute undefined', () => {
    const { displayList, ids } = emitWithIds(mixedScene(), EMPTY, 0);
    const cmds = displayList.commands;

    // Every fillPath/fillText command is attributed to an id-bearing node OR to
    // the synthesized id-less Circle (undefined). Collect the set of ids seen.
    const seen = new Set(ids);
    expect(seen.has('panel')).toBe(true);
    expect(seen.has('bg')).toBe(true);
    expect(seen.has('label')).toBe(true);
    // the id-less Circle contributes undefined at its draw command index
    expect(seen.has(undefined)).toBe(true);

    // The bg Rect's fillPath must carry id 'bg'.
    const bgFill = cmds.findIndex((c) => c.op === 'fillPath');
    expect(bgFill).toBeGreaterThanOrEqual(0);
    expect(ids[bgFill]).toBe('bg');

    // The label Text's fillText must carry id 'label'.
    const labelFill = cmds.findIndex((c) => c.op === 'fillText');
    expect(labelFill).toBeGreaterThanOrEqual(0);
    expect(ids[labelFill]).toBe('label');

    // 'panel' has opacity 0.5 → a pushGroup attributed to 'panel'.
    const pushGroup = cmds.findIndex((c) => c.op === 'pushGroup');
    expect(pushGroup).toBeGreaterThanOrEqual(0);
    expect(ids[pushGroup]).toBe('panel');
  });

  it('a child draw nested under a parent restores the parent id afterward (LIFO)', () => {
    // panel(save,transform?,pushGroup) → bg(save..restore) → circle(save..restore)
    //   → panel(popGroup,restore). The popGroup/restore after the children must be
    // attributed back to 'panel', proving the enter/exit stack unwinds correctly.
    const { displayList, ids } = emitWithIds(mixedScene(), EMPTY, 0);
    const cmds = displayList.commands;
    const popGroup = cmds.findIndex((c) => c.op === 'popGroup');
    expect(popGroup).toBeGreaterThanOrEqual(0);
    expect(ids[popGroup]).toBe('panel');
  });

  it('an id-less child contributes undefined at its own draw command index', () => {
    // The synthesized createScene root is `__root` (it carries its own id), so the
    // outer save/restore are attributed to '__root'; the id-less Rect's fillPath
    // is the only command with no explicit id → undefined.
    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [new Rect({ width: 10, height: 10, fill: '#fff' })],
    });
    const { displayList, ids } = emitWithIds(scene, EMPTY, 0);
    expect(ids.length).toBe(displayList.commands.length);
    const fill = displayList.commands.findIndex((c) => c.op === 'fillPath');
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(ids[fill]).toBeUndefined();
    // and the root frame is attributed to the synthesized root id
    expect(ids[0]).toBe('__root');
  });
});
