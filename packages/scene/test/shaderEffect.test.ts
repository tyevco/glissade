import { beforeEach, describe, expect, it } from 'vitest';
import { key, sampleTrack, setDevWarning, timeline, track, type Track } from '@glissade/core';
import { createScene, evaluate, Circle, ShaderEffect } from '../src/index.js';

let warnings: string[] = [];
beforeEach(() => {
  warnings = [];
  setDevWarning((m) => warnings.push(m));
});

const WGSL = `struct Uniforms { amount: f32 };
@fragment fn effect(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(srcTex, srcSampler, uv);
}`;

describe('ShaderEffect (§3.7): pure data in scene; the GPU lives elsewhere', () => {
  it('emits pushGroup.shader with uniform VALUES resolved at emit time', () => {
    const fx = new ShaderEffect({
      id: 'fx',
      wgsl: WGSL,
      uniforms: { amount: 4 },
      children: [new Circle({ id: 'dot', radius: 10, fill: '#fff', position: [20, 20] })],
    });
    const scene = createScene({ size: { w: 40, h: 40 }, children: [fx] });
    const list = evaluate(scene, timeline({ duration: 1 }), 0);
    const group = list.commands.find((c) => c.op === 'pushGroup') as { shader?: { wgsl: string; uniforms: Record<string, number> } };
    expect(group).toBeDefined();
    expect(group.shader!.wgsl).toBe(WGSL);
    expect(group.shader!.uniforms).toEqual({ amount: 4 });
    // serializable snapshot, not a live reference
    expect(JSON.parse(JSON.stringify(list))).toBeDefined();
  });

  it('uniforms are track targets: shader params animate like any property', () => {
    const fx = new ShaderEffect({ id: 'fx', wgsl: WGSL, uniforms: { amount: 0 }, children: [] });
    const scene = createScene({ size: { w: 40, h: 40 }, children: [fx] });
    expect(scene.resolveTarget('fx/u.amount')).toBeDefined();
    const doc = timeline({
      duration: 2,
      tracks: [track('fx/u.amount', 'number', [key(0, 0), key(2, 10)])],
    });
    const at = (t: number) => {
      const list = evaluate(scene, doc, t);
      const group = list.commands.find((c) => c.op === 'pushGroup') as { shader: { uniforms: Record<string, number> } };
      return group.shader.uniforms['amount'];
    };
    expect(at(0)).toBe(0);
    expect(at(1)).toBe(5);
    expect(at(2)).toBe(10);
    // and the underlying track samples agree (sanity)
    expect(sampleTrack(doc.tracks[0] as Track<number>, 1)).toBe(5);
    expect(() => fx.uniform('amout')).toThrow(/no uniform/);
  });
});
