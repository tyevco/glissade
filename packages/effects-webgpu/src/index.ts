/**
 * @glissade/effects-webgpu (§3.7) — the BROWSER-ONLY shader runner. Never
 * imported by core, scene, backend-skia, player, or the CLI: those see only
 * the serializable ShaderRef and degrade per caps.shaders. Load once with
 * `await loadWebGPUEffects()` before rendering shader scenes; the per-frame
 * path is then synchronous (texture upload + pass submit + drawImage of the
 * runner's webgpu canvas).
 *
 * EXPLICITLY outside the determinism guarantee: GPU/driver per-pixel
 * variance breaks distributed reproducibility — export is best-effort,
 * single machine.
 */

import { setShaderRunner, type ShaderRunner } from '@glissade/backend-canvas2d';
import { type ShaderRef } from '@glissade/scene';

/** Built-in vertex stage + bindings prepended to every user module. */
const PRELUDE = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  // full-screen triangle
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var out: VSOut;
  out.pos = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(xy.x, 1.0 - xy.y);
  return out;
}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
`;

export class WebGPUUnavailableError extends Error {
  constructor(detail: string) {
    super(`WebGPU unavailable: ${detail} — ShaderEffect scenes degrade per caps.shaders (§3.7)`);
    this.name = 'WebGPUUnavailableError';
  }
}

interface Pipeline {
  pipeline: GPURenderPipeline;
  uniformNames: string[];
  /** per-effect output surface: deferred transfers must never race across effects */
  canvas: OffscreenCanvas;
  ctx: GPUCanvasContext;
}

/**
 * Present timing differs across stacks: hardware Chrome flushes on
 * transferToImageBitmap inside the task ('sync', zero latency); software /
 * headless stacks present only after the queue completes ('deferred': the
 * effect lands one frame late — invisible in continuous playback).
 * loadWebGPUEffects() probes once and calibrates.
 */
export type PresentMode = 'sync' | 'deferred';

class Runner implements ShaderRunner {
  private readonly pipelines = new Map<string, Pipeline>();
  private warnedFailure = false;
  /** deferred mode: latest completed bitmap per effect + in-flight guard */
  private readonly ready = new Map<string, ImageBitmap>();
  private readonly pending = new Set<string>();
  /** copyExternalImageToTexture rejects 2d-canvas sources on some stacks; remember and skip. */
  private useByteUpload = false;
  private srcTexture: GPUTexture | null = null;
  private readonly format: GPUTextureFormat;

  constructor(
    private readonly device: GPUDevice,
    private readonly mode: PresentMode,
  ) {
    this.format = navigator.gpu.getPreferredCanvasFormat();
  }

  private pipelineFor(shader: ShaderRef, w: number, h: number): Pipeline {
    let entry = this.pipelines.get(shader.wgsl);
    if (!entry) {
      // uniforms pack as f32 in SORTED KEY ORDER (the documented contract)
      const uniformNames = Object.keys(shader.uniforms).sort();
      const binding =
        uniformNames.length > 0 ? `@group(0) @binding(2) var<uniform> U: Uniforms;\n` : '';
      const module = this.device.createShaderModule({ code: PRELUDE + binding + shader.wgsl });
      const pipeline = this.device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'effect', targets: [{ format: this.format }] },
        primitive: { topology: 'triangle-list' },
      });
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('webgpu') as GPUCanvasContext;
      ctx.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
      entry = { pipeline, uniformNames, canvas, ctx };
      this.pipelines.set(shader.wgsl, entry);
    }
    if (entry.canvas.width !== w || entry.canvas.height !== h) {
      entry.canvas.width = w;
      entry.canvas.height = h;
      entry.ctx.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
    }
    return entry;
  }

  /**
   * Fast path: direct external-image copy. Some stacks (notably headless /
   * software-rasterized 2d canvases) reject it — fall back to a synchronous
   * getImageData + writeTexture with premultiplication (2d readback is
   * straight-alpha; the pipeline expects premultiplied).
   */
  private uploadLayer(layer: HTMLCanvasElement | OffscreenCanvas, w: number, h: number): void {
    if (!this.useByteUpload) {
      try {
        this.device.queue.copyExternalImageToTexture({ source: layer }, { texture: this.srcTexture! }, [w, h]);
        return;
      } catch {
        this.useByteUpload = true;
      }
    }
    const ctx = layer.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]!;
      if (a !== 255) {
        d[i] = (d[i]! * a) / 255;
        d[i + 1] = (d[i + 1]! * a) / 255;
        d[i + 2] = (d[i + 2]! * a) / 255;
      }
    }
    this.device.queue.writeTexture({ texture: this.srcTexture! }, d, { bytesPerRow: w * 4, rowsPerImage: h }, [w, h]);
  }

  apply(
    layer: HTMLCanvasElement | OffscreenCanvas,
    shader: ShaderRef,
    w: number,
    h: number,
  ): ImageBitmap | null {
    try {
      if (!this.srcTexture || this.srcTexture.width !== w || this.srcTexture.height !== h) {
        this.srcTexture?.destroy();
        this.srcTexture = this.device.createTexture({
          size: [w, h],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
      }
      this.uploadLayer(layer, w, h);

      const entry = this.pipelineFor(shader, w, h);
      const { pipeline, uniformNames } = entry;
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: this.srcTexture.createView() },
        { binding: 1, resource: this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
      ];
      if (uniformNames.length > 0) {
        const data = new Float32Array(Math.max(uniformNames.length, 4)); // 16-byte min binding
        uniformNames.forEach((n, i) => (data[i] = shader.uniforms[n] ?? 0));
        const buf = this.device.createBuffer({
          size: data.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(buf, 0, data);
        entries.push({ binding: 2, resource: { buffer: buf } });
      }
      const bindGroup = this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });

      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: entry.ctx.getCurrentTexture().createView(),
            loadOp: 'clear',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      this.device.queue.submit([encoder.finish()]);

      if (this.mode === 'sync') {
        // hardware path: transferToImageBitmap flushes within the task
        const old = this.ready.get(shader.wgsl);
        old?.close();
        const bmp = entry.canvas.transferToImageBitmap();
        this.ready.set(shader.wgsl, bmp);
        return bmp;
      }
      // deferred path: the stack presents only after queue completion — hand
      // back the last completed frame (one frame late; invisible in motion)
      if (!this.pending.has(shader.wgsl)) {
        this.pending.add(shader.wgsl);
        void this.device.queue.onSubmittedWorkDone().then(() => {
          this.pending.delete(shader.wgsl);
          const old = this.ready.get(shader.wgsl);
          const bmp = entry.canvas.transferToImageBitmap();
          this.ready.set(shader.wgsl, bmp);
          old?.close();
        });
      }
      return this.ready.get(shader.wgsl) ?? null;
    } catch (err) {
      // degrade per caps.shaders rather than poisoning the frame — but never silently
      if (!this.warnedFailure) {
        this.warnedFailure = true;
        console.warn('[glissade] shader pass failed, degrading to passthrough:', err);
      }
      return null;
    }
  }
}

/** Render solid red, transfer, read back — tells us how this stack presents. */
async function probePresent(device: GPUDevice, awaitQueue: boolean): Promise<boolean> {
  const canvas = new OffscreenCanvas(4, 4);
  const ctx = canvas.getContext('webgpu') as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'premultiplied' });
  const module = device.createShaderModule({
    code:
      PRELUDE +
      `@fragment fn effect(@location(0) uv: vec2f) -> @location(0) vec4f { return vec4f(1.0, 0.0, 0.0, 1.0); }`,
  });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'effect', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      { view: ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' },
    ],
  });
  pass.setPipeline(pipeline);
  pass.draw(3);
  pass.end();
  device.queue.submit([encoder.finish()]);
  if (awaitQueue) await device.queue.onSubmittedWorkDone();
  const bmp = canvas.transferToImageBitmap();
  const c2 = new OffscreenCanvas(4, 4);
  const c2x = c2.getContext('2d') as OffscreenCanvasRenderingContext2D;
  c2x.drawImage(bmp, 0, 0);
  bmp.close();
  return (c2x.getImageData(2, 2, 1, 1).data[0] ?? 0) > 200;
}

/**
 * Acquire a device, CALIBRATE the present path (sync where the stack flushes
 * on transferToImageBitmap, one-frame-deferred where it presents only after
 * queue completion), and register the runner with @glissade/backend-canvas2d.
 * Throws WebGPUUnavailableError when no working path exists.
 */
/** Broken stacks HANG acquisition (the failure lands on a side promise) — race a deadline. */
function deadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new WebGPUUnavailableError(`${what} did not complete within ${ms}ms`)), ms),
    ),
  ]);
}

export interface LoadWebGPUOptions {
  /** Acquisition + probe deadline per step; default 3000 ms. */
  timeoutMs?: number;
}

export async function loadWebGPUEffects(opts: LoadWebGPUOptions = {}): Promise<PresentMode> {
  const ms = opts.timeoutMs ?? 3000;
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) throw new WebGPUUnavailableError('navigator.gpu is not exposed in this context');
  let device: GPUDevice;
  try {
    // broken stacks throw OperationError from deep inside the instance —
    // every acquisition failure surfaces as the one catchable error type
    const adapter =
      (await deadline(gpu.requestAdapter(), ms, 'requestAdapter')) ??
      (await deadline(gpu.requestAdapter({ forceFallbackAdapter: true }), ms, 'requestAdapter(fallback)'));
    if (!adapter) throw new WebGPUUnavailableError('no adapter (driver/blocklist)');
    device = await deadline(adapter.requestDevice(), ms, 'requestDevice');
  } catch (e) {
    if (e instanceof WebGPUUnavailableError) throw e;
    throw new WebGPUUnavailableError(`adapter/device acquisition failed (${e instanceof Error ? e.message : String(e)})`);
  }
  let mode: PresentMode;
  try {
    if (await deadline(probePresent(device, false), ms, 'present probe')) mode = 'sync';
    else if (await deadline(probePresent(device, true), ms, 'deferred probe')) mode = 'deferred';
    else throw new WebGPUUnavailableError('present path produced no pixels in either mode');
  } catch (e) {
    // a device that acquired but immediately died (headless stacks) throws
    // OperationError from inside the probe — same verdict: unavailable
    if (e instanceof WebGPUUnavailableError) throw e;
    throw new WebGPUUnavailableError(`present probe failed (${e instanceof Error ? e.message : String(e)})`);
  }
  setShaderRunner(new Runner(device, mode));
  return mode;
}

export { setShaderRunner } from '@glissade/backend-canvas2d';

/**
 * Built-in effects: ready-made WGSL for the common procedural cases.
 * Uniforms pack in sorted key order — these structs are written to match.
 */
export const effects = {
  /**
   * Simplex-style value noise displacement: warps the subtree's texture
   * lookup. Uniforms: amount (px), scale (noise frequency), time (animate it).
   */
  noiseDisplace: /* wgsl */ `
struct Uniforms { amount: f32, scale: f32, time: f32 };

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}

@fragment
fn effect(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(srcTex));
  let p = uv * U.scale + vec2f(U.time * 0.7, U.time * 0.4);
  let d = vec2f(vnoise(p) - 0.5, vnoise(p + vec2f(13.7, 41.3)) - 0.5);
  return textureSample(srcTex, srcSampler, uv + d * (U.amount / dims));
}
`,
  /** Animated film grain over the subtree. Uniforms: amount (0..1), time. */
  grain: /* wgsl */ `
struct Uniforms { amount: f32, time: f32 };

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

@fragment
fn effect(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = textureSample(srcTex, srcSampler, uv);
  let n = hash(uv * 1024.0 + vec2f(U.time * 61.7, U.time * 12.9)) - 0.5;
  return vec4f(c.rgb + n * U.amount * c.a, c.a);
}
`,
} as const;
