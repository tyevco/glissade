/**
 * gs render (DESIGN.md §5.1d, §5.7): load a scene module, evaluate each frame,
 * rasterize on Skia, write a PNG sequence — and mux to mp4/webm via FFmpeg
 * when requested and available. No browser anywhere.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import { evaluate, type SceneModule } from '@glissade/scene';
import { SkiaBackend } from '@glissade/backend-skia';

export interface RenderOptions {
  modulePath: string;
  out: string;
  fps?: number;
  /** seconds; defaults to [0, duration] */
  range?: [number, number];
  onProgress?: (frame: number, total: number) => void;
}

export class SceneModuleError extends Error {
  constructor(modulePath: string, detail: string) {
    super(
      `${modulePath}: ${detail}\n` +
        'A scene module default-exports { createScene(): Scene, timeline: Timeline } (SceneModule).',
    );
    this.name = 'SceneModuleError';
  }
}

export async function loadSceneModule(modulePath: string): Promise<SceneModule> {
  const abs = isAbsolute(modulePath) ? modulePath : resolve(process.cwd(), modulePath);
  const jiti = createJiti(pathToFileURL(process.cwd() + '/').href);
  const loaded = (await jiti.import(pathToFileURL(abs).href, { default: true })) as Partial<SceneModule>;
  if (typeof loaded?.createScene !== 'function' || loaded?.timeline === undefined) {
    throw new SceneModuleError(modulePath, 'default export is not a SceneModule');
  }
  return loaded as SceneModule;
}

export function ffmpegAvailable(): boolean {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

export async function render(opts: RenderOptions): Promise<{ frames: number; out: string }> {
  const mod = await loadSceneModule(opts.modulePath);
  const scene = mod.createScene();
  const doc = mod.timeline;
  const fps = opts.fps ?? doc.fps ?? 60;

  const { compileTimeline } = await import('@glissade/core');
  const compiled = compileTimeline(doc);
  const duration = compiled.duration;
  const [from, to] = opts.range ?? [0, duration];
  const firstFrame = Math.round(from * fps);
  const lastFrame = Math.max(firstFrame, Math.ceil(to * fps) - 1);
  const total = lastFrame - firstFrame + 1;

  const isVideo = /\.(mp4|webm)$/i.test(opts.out);
  if (isVideo && !ffmpegAvailable()) {
    throw new Error(
      `'${opts.out}' needs FFmpeg on PATH and none was found. ` +
        'Render a PNG sequence instead (--out <directory>) or install ffmpeg.',
    );
  }

  const framesDir = isVideo ? mkdtempSync(join(tmpdir(), 'glissade-frames-')) : resolve(opts.out);
  mkdirSync(framesDir, { recursive: true });

  const backend = new SkiaBackend(scene.size.w, scene.size.h);

  // Warm timeline assets before evaluation (§2.5 readiness precondition).
  const videoSources: import('./videoSource.js').FfmpegVideoFrameSource[] = [];
  for (const [assetId, ref] of Object.entries(doc.assets ?? {})) {
    const { resolveAssetPath } = await import('./audioMix.js');
    if (ref.kind === 'image') {
      const { loadImage } = await import('@napi-rs/canvas');
      backend.setImageAsset(assetId, await loadImage(resolveAssetPath(ref.url, opts.modulePath)));
    } else if (ref.kind === 'video') {
      if (!ffmpegAvailable()) {
        throw new Error(`video asset '${assetId}' needs FFmpeg on PATH for frame extraction (§5.4)`);
      }
      const { FfmpegVideoFrameSource } = await import('./videoSource.js');
      const source = new FfmpegVideoFrameSource(resolveAssetPath(ref.url, opts.modulePath));
      await source.warm(0, source.duration); // v1: whole-source warm, trivially correct
      backend.setVideoAsset(assetId, source);
      videoSources.push(source);
    }
  }
  for (let f = firstFrame; f <= lastFrame; f++) {
    backend.render(evaluate(scene, doc, f / fps));
    const name = `frame-${String(f).padStart(5, '0')}.png`;
    writeFileSync(join(framesDir, name), backend.encodePng());
    opts.onProgress?.(f - firstFrame + 1, total);
  }
  backend.dispose();
  for (const source of videoSources) source.close();

  if (!isVideo) {
    if (compiled.audio.length > 0) {
      process.stderr.write('note: PNG-sequence output ignores timeline audio; render to .mp4/.webm to mix it\n');
    }
    return { frames: total, out: framesDir };
  }

  const outAbs = resolve(opts.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  const isWebm = /\.webm$/i.test(outAbs);
  const codec = isWebm
    ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32']
    : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart'];

  const { planAudioMix } = await import('./audioMix.js');
  const mix = planAudioMix(compiled.audio, opts.modulePath, duration);
  if (mix?.hasEasedGain) {
    process.stderr.write('note: eased gain keys are approximated linearly in the FFmpeg mix\n');
  }
  const audioInputs = mix ? mix.inputs.flatMap((p) => ['-i', p]) : [];
  const audioArgs = mix
    ? [
        '-filter_complex', mix.filterComplex,
        '-map', '0:v', '-map', '[aout]',
        ...(isWebm ? ['-c:a', 'libopus'] : ['-c:a', 'aac', '-b:a', '192k']),
      ]
    : [];

  const args = [
    '-y',
    '-framerate', String(fps),
    '-start_number', String(firstFrame),
    '-i', join(framesDir, 'frame-%05d.png'),
    ...audioInputs,
    ...audioArgs,
    ...codec,
    '-t', String(duration),
    outAbs,
  ];
  const result = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  rmSync(framesDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed (exit ${result.status}):\n${result.stderr?.toString().slice(-2000)}`);
  }
  return { frames: total, out: outAbs };
}
