import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileTimeline, type Key } from '@glissade/core';
import { evaluate } from '@glissade/scene';
import { generateSceneModule, importLottie } from '../src/index.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('integration: real samples', () => {
  it('docs_image_animated.json imports at full fidelity and compiles', () => {
    const result = importLottie(fixture('docs_image_animated.json'));
    expect(result.warnings).toEqual([]);
    expect(result.size).toEqual({ w: 512, h: 512 });
    expect(result.timeline.fps).toBe(60);
    expect(result.timeline.duration).toBeCloseTo(3, 10);
    expect(result.timeline.assets).toEqual({ blep: { kind: 'image', url: '/lottie-docs/static/examples/blep.png' } });

    const rotation = result.timeline.tracks.find((t) => t.target === 'Layer/rotation');
    expect(rotation).toBeDefined();
    const keys = rotation!.keys as Key<number>[];
    expect(keys[0]!.value).toBe(0);
    expect(keys[keys.length - 1]!.value).toBe(360);

    const compiled = compileTimeline(result.timeline);
    expect(compiled.duration).toBeCloseTo(3, 10);
    expect(compiled.tracks.size).toBeGreaterThan(0);

    const mod = result.toSceneModule();
    expect(mod.createScene().nodes.has('Layer')).toBe(true);
  });

  it('gatin.json imports, evaluates, and produces non-empty DisplayLists', () => {
    const result = importLottie(fixture('gatin.json'));
    expect(result.warnings).toEqual([]);
    expect(result.size).toEqual({ w: 800, h: 800 });
    expect(result.timeline.duration).toBeCloseTo(80 / 25, 10);

    const compiled = compileTimeline(result.timeline);
    expect(compiled.tracks.size).toBeGreaterThan(0);

    const mod = result.toSceneModule();
    const scene = mod.createScene();
    for (const t of [0, 0.5, 1.6, 3.1]) {
      const dl = evaluate(scene, mod.timeline, t);
      expect(dl.commands.length).toBeGreaterThan(0);
      expect(dl.commands.some((c) => c.op === 'fillPath')).toBe(true);
      expect(dl.resources.some((r) => r.kind === 'path')).toBe(true);
    }
    // determinism: re-evaluating the same t yields the identical DisplayList
    expect(evaluate(scene, mod.timeline, 1.6)).toEqual(evaluate(scene, mod.timeline, 1.6));
  });

  it('gatin spatial position segments were baked densely (ti/to present in the file)', () => {
    const result = importLottie(fixture('gatin.json'));
    const movCabza = result.timeline.tracks.find((t) => t.target === 'movCabza/position');
    expect(movCabza).toBeDefined();
    // the source has 19 keys; the segment with non-zero tangents bakes densely
    expect(movCabza!.keys.length).toBeGreaterThan(19);
  });

  it('generateSceneModule emits a compilable-looking scene module', () => {
    const result = importLottie(fixture('gatin.json'));
    const code = generateSceneModule(result, { source: 'gatin.json' });
    expect(code).toContain("from '@glissade/scene'");
    expect(code).toContain('satisfies SceneModule');
    expect(code).toContain('createScene({');
    expect(code).toContain('"version": 1');
    expect(code).not.toContain('undefined');
  });
});
