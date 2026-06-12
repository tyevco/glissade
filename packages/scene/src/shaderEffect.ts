/**
 * ShaderEffect (§3.7): a group whose rasterized subtree runs through a WGSL
 * pass. THIS FILE IS PURE DATA — the GPU runner lives in the browser-only
 * @glissade/effects-webgpu package; headless backends degrade per
 * caps.shaders (passthrough + warning by default). Uniforms are per-name
 * number signals registered as '<id>/u.<name>' track targets, so shader
 * params animate exactly like any other property.
 */

import { signal, type BindableSignal } from '@glissade/core';
import { type ShaderRef } from './displayList.js';
import { type Node, type NodeProps } from './node.js';
import { Group } from './nodes.js';

export interface ShaderEffectProps extends NodeProps {
  children?: Node[];
  /** WGSL fragment module: `struct Uniforms {...}` + `@fragment fn effect(@location(0) uv: vec2f) -> @location(0) vec4f`. */
  wgsl: string;
  /** Initial scalar uniforms; each becomes an animatable signal + track target 'u.<name>'. */
  uniforms?: Record<string, number>;
}

export class ShaderEffect extends Group {
  readonly wgsl: string;
  readonly uniformSignals: ReadonlyMap<string, BindableSignal<number>>;

  constructor(props: ShaderEffectProps) {
    super(props);
    this.wgsl = props.wgsl;
    const map = new Map<string, BindableSignal<number>>();
    for (const [name, value] of Object.entries(props.uniforms ?? {})) {
      const sig = signal(value);
      map.set(name, sig);
      this.registerTarget(`u.${name}`, sig);
    }
    this.uniformSignals = map;
  }

  /** The live uniform signal (throws on unknown names — typos fail loudly). */
  uniform(name: string): BindableSignal<number> {
    const sig = this.uniformSignals.get(name);
    if (!sig) throw new Error(`ShaderEffect has no uniform '${name}' (have: ${[...this.uniformSignals.keys()].join(', ')})`);
    return sig;
  }

  protected override groupShader(): ShaderRef {
    const uniforms: Record<string, number> = {};
    for (const [name, sig] of this.uniformSignals) uniforms[name] = sig();
    return { wgsl: this.wgsl, uniforms };
  }
}
