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
  /** InputTrace file: replay → bake → render (v2 §A.6 route 2). */
  trace?: string;
  /** Render one machine state's timeline linearly (route 3). */
  state?: string;
  /** Downgrade a trace hash mismatch to a warning. */
  force?: boolean;
  /** burn (default): captions render in-frame; sidecar/off hide the caption node. */
  captions?: 'burn' | 'sidecar' | 'off';
  /** auto (default): mix a sibling *.music.timing.json bed, ducked under narration. */
  music?: 'auto' | 'off';
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
  // machine export routes (v2 §A.6): machines render via --trace/--state or error
  const { resolveRenderDoc } = await import('./machines.js');
  let doc = resolveRenderDoc(mod, scene, {
    ...(opts.trace !== undefined ? { trace: opts.trace } : {}),
    ...(opts.state !== undefined ? { state: opts.state } : {}),
    ...(opts.force !== undefined ? { force: opts.force } : {}),
  });
  const fps = opts.fps ?? doc.fps ?? 60;

  // --captions sidecar/off: hide the caption node via a document override —
  // only when the scene actually has one (an unbound target would throw).
  const captionsMode = opts.captions ?? 'burn';
  const { hideCaptionsDoc, timingPathFor, writeCaptionSidecars } = await import('./captions.js');
  if (captionsMode !== 'burn' && scene.resolveTarget('captions/opacity') !== undefined) {
    doc = hideCaptionsDoc(doc);
  }

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
  // line breaking measures with the rasterizer that will draw (§3.2)
  scene.setTextMeasurer(backend);

  // flexbox scenes need the wasm engine loaded before evaluation (§3.2)
  const hasLayout = [...scene.nodes.values()].some(
    (n) => (n.constructor as { isLayoutNode?: boolean }).isLayoutNode === true,
  );
  if (hasLayout) {
    const { loadYogaLayoutEngine } = await import('@glissade/scene/layout');
    await loadYogaLayoutEngine();
  }

  // Warm timeline assets before evaluation (§2.5 readiness precondition).
  const videoSources: import('./videoSource.js').FfmpegVideoFrameSource[] = [];
  for (const [assetId, ref] of Object.entries(doc.assets ?? {})) {
    const { resolveAssetPath } = await import('./audioMix.js');
    if (ref.kind === 'font') {
      // convention: the asset id IS the font family name (§3.6 explicit fonts)
      const { GlobalFonts } = await import('@napi-rs/canvas');
      GlobalFonts.registerFromPath(resolveAssetPath(ref.url, opts.modulePath), assetId);
    } else if (ref.kind === 'image') {
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

  // burn and sidecar modes both emit .srt/.vtt — the cues come from the same
  // timing manifest as the burned track, so they match by construction
  const emitSidecars = (target: string): void => {
    if (captionsMode === 'off') return;
    const timingPath = timingPathFor(opts.modulePath);
    if (!timingPath) {
      if (captionsMode === 'sidecar') {
        process.stderr.write('note: --captions sidecar: no narration timing manifest found; run gs narrate first\n');
      }
      return;
    }
    const { srt, vtt } = writeCaptionSidecars(timingPath, target);
    process.stderr.write(`captions: ${srt}, ${vtt}\n`);
  };

  if (!isVideo) {
    if (compiled.audio.length > 0) {
      process.stderr.write('note: PNG-sequence output ignores timeline audio; render to .mp4/.webm to mix it\n');
    }
    emitSidecars(framesDir);
    return { frames: total, out: framesDir };
  }

  const outAbs = resolve(opts.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  emitSidecars(outAbs);
  const isWebm = /\.webm$/i.test(outAbs);
  const container = isWebm ? ('webm' as const) : ('mp4' as const);

  // pick encoders from what THIS ffmpeg build actually offers (§5.2)
  const { pickEncoder } = await import('./encoders.js');
  const videoEnc = pickEncoder('video', container);
  if (videoEnc.note) process.stderr.write(`note: ${videoEnc.note}\n`);
  // quality flags are per-encoder: crf (x264/vpx), bitrate (openh264), q:v (mpeg4)
  const VIDEO_QUALITY: Record<string, string[]> = {
    'libx264': ['-crf', '18'],
    'libvpx-vp9': ['-b:v', '0', '-crf', '32'],
    'libvpx': ['-b:v', '2M'],
    'libopenh264': ['-b:v', '4M'],
    'mpeg4': ['-q:v', '3'],
  };
  const codec = [
    '-c:v', videoEnc.name,
    ...(VIDEO_QUALITY[videoEnc.name] ?? []),
    ...(isWebm ? [] : ['-pix_fmt', 'yuv420p', '-movflags', '+faststart']),
  ];

  // music auto-mix (narration parity): a sibling manifest with a stem joins
  // the mix, auto-ducked when a narration manifest also sits next to the scene
  const audioClips = [...compiled.audio];
  if ((opts.music ?? 'auto') === 'auto') {
    const { buildMusicClip, musicPathFor } = await import('./music.js');
    const musicPath = musicPathFor(opts.modulePath);
    if (musicPath) {
      const bed = buildMusicClip(musicPath, timingPathFor(opts.modulePath));
      if (bed) {
        audioClips.push(bed.clip);
        process.stderr.write(`note: auto-mixing ${bed.note}\n`);
      }
    }
  }

  const { planAudioMix } = await import('./audioMix.js');
  const mix = planAudioMix(audioClips, opts.modulePath, duration);
  if (mix?.hasEasedGain) {
    process.stderr.write('note: eased gain keys are approximated linearly in the FFmpeg mix\n');
  }
  const audioInputs = mix ? mix.inputs.flatMap((p) => ['-i', p]) : [];
  const audioEnc = mix ? pickEncoder('audio', container) : null;
  const audioArgs =
    mix && audioEnc
      ? [
          '-filter_complex', mix.filterComplex,
          '-map', '0:v', '-map', '[aout]',
          '-c:a', audioEnc.name,
          ...(container === 'mp4' ? ['-b:a', '192k'] : []),
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
