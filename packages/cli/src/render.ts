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
import { readFile } from 'node:fs/promises';
import { createJiti } from 'jiti';
import { buildFontRegistry, type AudioClip } from '@glissade/core';
import { evaluate, validateSceneFonts, withDeterminismGuards, type SceneModule } from '@glissade/scene';
import { SkiaBackend } from '@glissade/backend-skia';

export interface RenderOptions {
  modulePath: string;
  out: string;
  fps?: number;
  /** seconds; defaults to [0, duration] (programmatic API — the CLI uses frame indices). */
  range?: [number, number];
  /** inclusive FRAME indices [first, last] (§5: export APIs are frame-indexed). Wins over `range`. */
  frameRange?: [number, number];
  /** a single FRAME index — a still through the same path. Wins over `frameRange`/`range`. */
  frame?: number;
  /** force a PNG sequence even when `out` has a video extension. */
  format?: 'png-seq';
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
  /** auto (default): mix the voice from a sibling *.narration.timing.json. */
  narration?: 'auto' | 'off';
  /** auto (default): mix effect hits from a sibling *.sfx.timing.json. */
  sfx?: 'auto' | 'off';
  /** also write WebVTT chapters from cue markers ('vtt'); cues.json is always written when cues exist. */
  chapters?: 'vtt' | 'off';
  /** cue kinds that become VTT chapters (default just 'chapter'); cues.json keeps all kinds. */
  chapterKinds?: ReadonlySet<string>;
  /** --strict: font validation throws on an unregistered family / missing glyph (§3.6). Default dev-warn. */
  strictFonts?: boolean;
  /**
   * --workers N (§5.6): split the frame range into N contiguous sub-ranges, render
   * each in a separate `gs` child process, and join the shard videos. Ignored for
   * a single frame or N <= 1. Only meaningful for a video `out`.
   */
  workers?: number;
  /**
   * --lossless-intermediate (§5.6, §8.1): render shards as FFV1 (lossless) and do a
   * single final encode after the concat — the guaranteed byte-correct join path.
   * Forced on automatically when the picked encoder can't honor precise boundary
   * keyframes (mpeg4 / openh264).
   */
  losslessIntermediate?: boolean;
  /**
   * --allow-gpu-shards (§5.6): sharded GPU/shader output isn't reproducible across
   * processes/machines, so a scene containing a ShaderEffect refuses to shard unless
   * this is set.
   */
  allowGpuShards?: boolean;
  /**
   * Internal (shard children): render video-only — skip the audio mix and the
   * caption/cue sidecars, which the orchestrator emits once over the joined result.
   */
  videoOnly?: boolean;
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

/**
 * Parse the CLI `--range a..b` flag as INCLUSIVE integer FRAME indices (§5:
 * export APIs are frame-indexed; Player APIs are seconds). Decimal or malformed
 * ranges are rejected, since a frame index is an integer.
 */
export function parseFrameRange(flag: string): [number, number] {
  const m = /^(\d+)\.\.(\d+)$/.exec(flag.trim());
  if (!m) {
    throw new Error(`--range must be integer frames 'a..b' (e.g. 0..120), got '${flag}'`);
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (b < a) throw new Error(`--range end (${b}) is before start (${a})`);
  return [a, b];
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
  const { writeCueSidecars } = await import('./cues.js');
  if (captionsMode !== 'burn' && scene.resolveTarget('captions/opacity') !== undefined) {
    doc = hideCaptionsDoc(doc);
  }

  const { compileTimeline } = await import('@glissade/core');
  const compiled = compileTimeline(doc);
  const duration = compiled.duration;
  let firstFrame: number;
  let lastFrame: number;
  if (opts.frame !== undefined) {
    firstFrame = lastFrame = opts.frame;
  } else if (opts.frameRange) {
    [firstFrame, lastFrame] = opts.frameRange;
    lastFrame = Math.max(firstFrame, lastFrame);
  } else {
    const [from, to] = opts.range ?? [0, duration];
    firstFrame = Math.round(from * fps);
    lastFrame = Math.max(firstFrame, Math.ceil(to * fps) - 1);
  }
  const total = lastFrame - firstFrame + 1;

  // --format png-seq forces a PNG sequence even if `out` looks like a video name
  const isVideo = opts.format !== 'png-seq' && /\.(mp4|webm)$/i.test(opts.out);
  // a single frame to a *.png path writes THAT one file, not a directory of frames
  const singleFile = !isVideo && total === 1 && /\.png$/i.test(opts.out);
  if (isVideo && !ffmpegAvailable()) {
    throw new Error(
      `'${opts.out}' needs FFmpeg on PATH and none was found. ` +
        'Render a PNG sequence instead (--out <directory>) or install ffmpeg.',
    );
  }

  // §5.6 sharded export: split the frame range across N child `gs` processes
  // and join the shard videos. Only a real video output with >1 frame shards;
  // a single still / PNG sequence / N<=1 falls through to the linear path.
  const workers = opts.videoOnly ? 1 : Math.max(1, Math.floor(opts.workers ?? 1));
  if (workers > 1 && isVideo && total > 1) {
    const { renderSharded } = await import('./shards.js');
    return renderSharded({
      opts,
      scene,
      compiled,
      fps,
      duration,
      firstFrame,
      lastFrame,
      container: /\.webm$/i.test(opts.out) ? 'webm' : 'mp4',
      workers,
      timingPathFor,
      writeCaptionSidecars,
      writeCueSidecars,
    });
  }

  const framesDir = isVideo
    ? mkdtempSync(join(tmpdir(), 'glissade-frames-'))
    : singleFile
      ? dirname(resolve(opts.out))
      : resolve(opts.out);
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
  const { resolveAssetPath: resolveAsset } = await import('./audioMix.js');

  // §3.6: register EVERY declared face under its family (the asset id IS the
  // family name), not one path per asset, so weight/style variants resolve.
  const fontRegistry = buildFontRegistry(doc.assets);
  if (fontRegistry.faces().length > 0) {
    const { GlobalFonts } = await import('@napi-rs/canvas');
    for (const face of fontRegistry.faces()) {
      GlobalFonts.registerFromPath(resolveAsset(face.url, opts.modulePath), face.family);
    }
  }

  // §3.6 font validation: dev-warn by default, --strict throws on an
  // unregistered non-generic family or an uncovered glyph.
  await validateSceneFonts(
    scene,
    doc,
    async (url) => {
      try {
        const buf = await readFile(resolveAsset(url, opts.modulePath));
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      } catch {
        return undefined;
      }
    },
    { mode: opts.strictFonts ? 'strict' : 'dev' },
  );

  for (const [assetId, ref] of Object.entries(doc.assets ?? {})) {
    if (ref.kind === 'font') {
      // faces already registered above
    } else if (ref.kind === 'image') {
      const { loadImage } = await import('@napi-rs/canvas');
      backend.setImageAsset(assetId, await loadImage(resolveAsset(ref.url, opts.modulePath)));
    } else if (ref.kind === 'video') {
      if (!ffmpegAvailable()) {
        throw new Error(`video asset '${assetId}' needs FFmpeg on PATH for frame extraction (§5.4)`);
      }
      const { FfmpegVideoFrameSource } = await import('./videoSource.js');
      const source = new FfmpegVideoFrameSource(resolveAsset(ref.url, opts.modulePath));
      await source.warm(0, source.duration); // v1: whole-source warm, trivially correct
      backend.setVideoAsset(assetId, source);
      videoSources.push(source);
    }
  }
  for (let f = firstFrame; f <= lastFrame; f++) {
    // §5.5: the CLI/CI export path rejects any wall-clock/random/timer call inside evaluate()
    backend.render(withDeterminismGuards('throw', () => evaluate(scene, doc, f / fps)));
    const file = singleFile ? resolve(opts.out) : join(framesDir, `frame-${String(f).padStart(5, '0')}.png`);
    writeFileSync(file, backend.encodePng());
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

  // composer cue signaling (§ad-break): cue markers → <stem>.cues.json (+ chapters)
  const emitCues = (target: string): void => {
    const written = writeCueSidecars(target, compiled.markers, duration, opts.chapters === 'vtt', opts.chapterKinds);
    if (written.length) process.stderr.write(`cues: ${written.join(', ')}\n`);
  };

  if (!isVideo) {
    if (singleFile) return { frames: 1, out: resolve(opts.out) }; // one still, no sequence/sidecars
    if (compiled.audio.length > 0) {
      process.stderr.write('note: PNG-sequence output ignores timeline audio; render to .mp4/.webm to mix it\n');
    }
    emitSidecars(framesDir);
    emitCues(framesDir);
    return { frames: total, out: framesDir };
  }

  const outAbs = resolve(opts.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  // shard children skip sidecars; the orchestrator emits them once over the join
  if (!opts.videoOnly) {
    emitSidecars(outAbs);
    emitCues(outAbs);
  }
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

  // §5.6 shard children render video-only; the orchestrator mixes audio once
  // over the joined result, so author-wired + auto-mixed clips never double.
  const { audioInputs, audioArgs } = opts.videoOnly
    ? { audioInputs: [] as string[], audioArgs: [] as string[] }
    : await planFinalAudio(opts, [...compiled.audio], duration, container);

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

/**
 * Collect timeline + auto-mixed (narration/music/sfx) audio clips and plan the
 * FFmpeg audio graph, returning the `-i`/`-filter_complex`/`-map` argument
 * fragments. Shared by the linear `render()` path and the sharded orchestrator
 * (which mixes audio once, over the concatenated video). Returns empty args when
 * there is nothing to mix.
 */
export async function planFinalAudio(
  opts: RenderOptions,
  timelineClips: AudioClip[],
  duration: number,
  container: 'mp4' | 'webm',
): Promise<{ audioInputs: string[]; audioArgs: string[] }> {
  const { timingPathFor } = await import('./captions.js');
  const audioClips = [...timelineClips];
  const { bedAlreadyReferenced, buildMusicClip, buildNarrationClips, musicPathFor } = await import('./music.js');

  // narration: the voice itself
  if ((opts.narration ?? 'auto') === 'auto') {
    const narrationPath = timingPathFor(opts.modulePath);
    if (narrationPath) {
      const voice = buildNarrationClips(narrationPath);
      if (voice) {
        const wired = voice.clips.some((c) => bedAlreadyReferenced(audioClips, c.asset.url, opts.modulePath));
        if (wired) {
          process.stderr.write('note: narration already in the timeline audio — auto-mix skipped\n');
        } else {
          audioClips.push(...voice.clips);
          process.stderr.write(`note: auto-mixing ${voice.note}\n`);
        }
      }
    }
  }

  // music: the bed, auto-ducked under the narration windows
  if ((opts.music ?? 'auto') === 'auto') {
    const musicPath = musicPathFor(opts.modulePath);
    if (musicPath) {
      const bed = buildMusicClip(musicPath, timingPathFor(opts.modulePath));
      if (bed) {
        if (bedAlreadyReferenced(audioClips, bed.clip.asset.url, opts.modulePath)) {
          process.stderr.write('note: music bed already in the timeline audio — auto-mix skipped\n');
        } else {
          audioClips.push(bed.clip);
          process.stderr.write(`note: auto-mixing ${bed.note}\n`);
        }
      }
    }
  }

  // sfx: effect hits from a sibling *.sfx.timing.json (gs sfx prepare step)
  if ((opts.sfx ?? 'auto') === 'auto') {
    const { buildSfxClipsFromTiming, sfxTimingPathFor } = await import('./sfx.js');
    const sfxPath = sfxTimingPathFor(opts.modulePath);
    if (sfxPath) {
      const fx = buildSfxClipsFromTiming(sfxPath);
      if (fx) {
        const wired = fx.clips.some((c) => bedAlreadyReferenced(audioClips, c.asset.url, opts.modulePath));
        if (wired) {
          process.stderr.write('note: sfx already in the timeline audio — auto-mix skipped\n');
        } else {
          audioClips.push(...fx.clips);
          process.stderr.write(`note: auto-mixing ${fx.note}\n`);
        }
      }
    }
  }

  const { planAudioMix } = await import('./audioMix.js');
  const { pickEncoder } = await import('./encoders.js');
  const mix = planAudioMix(audioClips, opts.modulePath, duration);
  if (mix?.hasEasedGain) {
    process.stderr.write('note: eased gain keys are approximated linearly in the FFmpeg mix\n');
  }
  if (!mix) return { audioInputs: [], audioArgs: [] };
  const audioEnc = pickEncoder('audio', container);
  return {
    audioInputs: mix.inputs.flatMap((p) => ['-i', p]),
    audioArgs: [
      '-filter_complex', mix.filterComplex,
      '-map', '0:v', '-map', '[aout]',
      '-c:a', audioEnc.name,
      ...(container === 'mp4' ? ['-b:a', '192k'] : []),
    ],
  };
}
