/**
 * defineComponent (0.36): reusable typed subscenes. Proves the ID-SCOPING safety
 * story (N instances → distinct child target namespaces, no collision), the
 * pure build-time nature (evaluate stays a pure function of time), the describe()
 * registry surfacing, and the fail-loud guards (duplicate name, missing id, bad
 * build).
 */

import { describe as vdescribe, expect, it } from 'vitest';
import { timeline, track, key } from '@glissade/core';
import { Group, Rect, Text, createScene, evaluate } from '../src/index.js';
import { defineComponent, childId, ComponentError, listComponents } from '../src/component.js';
import { describe as apiDescribe } from '../src/describe.js';

// unique component names per test (the registry is process-global; a dup name throws)
let seq = 0;
const uniq = (): string => `TestComp${seq++}`;

vdescribe('childId', () => {
  it('namespaces a child under an instance id; no sub → the root id', () => {
    expect(childId('lt', 'bar')).toBe('lt/bar');
    expect(childId('lt')).toBe('lt');
    expect(childId('lt', '')).toBe('lt');
  });
});

vdescribe('defineComponent', () => {
  const makeLowerThird = (name = uniq()) =>
    defineComponent<{ label: string; accent?: string }>({
      name,
      props: { label: { type: 'string', required: true }, accent: { type: 'color' } },
      build: ({ label, accent }, cid) =>
        new Group({
          id: cid(),
          children: [
            new Rect({ id: cid('bar'), width: 6, height: 40, fill: accent ?? '#4ea1ff' }),
            new Text({ id: cid('label'), text: label, fontFamily: 'x', fontSize: 20 }),
          ],
        }),
    });

  it('the factory builds a subtree whose root id === the instance id', () => {
    const lt = makeLowerThird()({ id: 'intro', label: 'Ada' });
    expect(lt.node).toBeInstanceOf(Group);
    expect(lt.node.id).toBe('intro');
    expect(lt.id).toBe('intro');
    expect(lt.childId('bar')).toBe('intro/bar');
    expect(lt.targets('bar', 'height')).toEqual(['intro/bar/height']);
  });

  it('N instances get DISTINCT child namespaces — no track-target collision', () => {
    const LT = makeLowerThird();
    const a = LT({ id: 'a', label: 'Ada' });
    const b = LT({ id: 'b', label: 'Grace' });
    expect(a.childId('bar')).not.toBe(b.childId('bar'));
    // both bars in one scene, animated independently → resolves cleanly
    const scene = createScene({ size: { w: 200, h: 100 }, children: [a.node, b.node] });
    const tl = timeline({
      duration: 1,
      tracks: [
        track(a.childId('bar') + '/height', 'number', [key(0, 0), key(1, 40)]),
        track(b.childId('bar') + '/height', 'number', [key(0, 0), key(0.5, 40)]),
      ],
    });
    expect(() => evaluate(scene, tl, 0.5)).not.toThrow();
    expect(scene.nodes.get('a/bar')).toBeDefined();
    expect(scene.nodes.get('b/bar')).toBeDefined();
  });

  it('is a pure function of its inputs: same props → identical subtree DL', () => {
    const LT = makeLowerThird();
    const mk = () => createScene({ size: { w: 200, h: 60 }, children: [LT({ id: 'x', label: 'Hi' }).node] });
    const tl = timeline({ duration: 1, tracks: [] });
    expect(JSON.stringify(evaluate(mk(), tl, 0.3))).toBe(JSON.stringify(evaluate(mk(), tl, 0.3)));
  });

  it('registers into describe().components with its typed prop surface', () => {
    const name = uniq();
    makeLowerThird(name);
    const comp = (apiDescribe().components ?? []).find((c) => c.name === name);
    expect(comp).toBeDefined();
    expect(comp!.props).toEqual({ label: { type: 'string', required: true }, accent: { type: 'color' } });
    expect(listComponents().some((c) => c.name === name)).toBe(true);
  });

  it('fails loud: duplicate name, missing id, wrong build root id', () => {
    const name = uniq();
    makeLowerThird(name);
    expect(() => makeLowerThird(name)).toThrow(/already defined/);

    const LT = makeLowerThird();
    // @ts-expect-error — id is required
    expect(() => LT({ label: 'no id' })).toThrow(/needs a stable id/);
    expect(() => LT({ id: '', label: 'empty id' })).toThrow(ComponentError);

    // build that returns a Group with the WRONG id
    const bad = defineComponent({
      name: uniq(),
      props: {},
      build: (_p, _cid) => new Group({ id: 'hardcoded', children: [] }),
    });
    expect(() => bad({ id: 'inst' })).toThrow(/build must return a Group with id/);
  });
});
