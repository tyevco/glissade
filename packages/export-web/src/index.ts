/**
 * @glissade/export-web — in-browser export (DESIGN.md §5.1b/§5.2/§5.3):
 * WebCodecs encoding + Mediabunny muxing, frame-accurate and faster than
 * realtime; audio mixed sample-accurately via OfflineAudioContext. Codec
 * support is feature-detected (isConfigSupported under the hood); the PNG
 * frame callback path is the unconditional fallback.
 */

import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  AudioSample,
  AudioSampleSource,
  getFirstEncodableVideoCodec,
  getFirstEncodableAudioCodec,
  type VideoCodec,
  type AudioCodec,
} from 'mediabunny';
import { compileTimeline, sampleTrack, type AudioClip, type Timeline } from '@glissade/core';
import { evaluate, ColdAssetError, type Scene, type VideoFrameSource } from '@glissade/scene';
import { Canvas2DBackend } from '@glissade/backend-canvas2d';
import { MediabunnyVideoFrameSource } from './videoSource.js';

export { MediabunnyVideoFrameSource } from './videoSource.js';

export interface WebExportOptions {
  fps?: number;
  /** 'auto' tries mp4 (avc/hevc/av1) then webm (vp9/vp8/av1). */
  format?: 'mp4' | 'webm' | 'auto';
  videoBitrate?: number;
  audioBitrate?: number;
  /**
   * Pre-mixed PCM from the main thread (raw planar f32 channels). Workers
   * have no OfflineAudioContext, so the worker path premixes there and
   * transfers the channels (§5.1 worker posture).
   */
  premixedAudio?: PremixedAudio;
  onProgress?: (frame: number, total: number) => void;
}

/** Raw mixed audio: one Float32Array per channel, transferable to a Worker. */
export interface PremixedAudio {
  sampleRate: number;
  channelData: Float32Array[];
}

export interface WebExportResult {
  blob: Blob;
  format: 'mp4' | 'webm';
  videoCodec: VideoCodec;
  audioCodec: AudioCodec | null;
  frames: number;
}

export class ExportUnsupportedError extends Error {
  constructor(detail: string) {
    super(
      `${detail} — no encodable codec found in this browser. ` +
        'Use the PNG fallback (exportPngFrames) or render via the gs CLI (§5.2).',
    );
    this.name = 'ExportUnsupportedError';
  }
}

const MP4_VIDEO: VideoCodec[] = ['avc', 'hevc', 'av1'];
const WEBM_VIDEO: VideoCodec[] = ['vp9', 'vp8', 'av1'];
const MP4_AUDIO: AudioCodec[] = ['aac', 'opus'];
const WEBM_AUDIO: AudioCodec[] = ['opus'];

async function pickCodecs(
  format: 'mp4' | 'webm' | 'auto',
  width: number,
  height: number,
  bitrate: number,
  needAudio: boolean,
): Promise<{ format: 'mp4' | 'webm'; video: VideoCodec; audio: AudioCodec | null }> {
  const tryFormat = async (f: 'mp4' | 'webm') => {
    const video = await getFirstEncodableVideoCodec(f === 'mp4' ? MP4_VIDEO : WEBM_VIDEO, {
      width,
      height,
      bitrate,
    });
    if (!video) return null;
    const audio = needAudio
      ? await getFirstEncodableAudioCodec(f === 'mp4' ? MP4_AUDIO : WEBM_AUDIO)
      : null;
    if (needAudio && !audio) return null;
    return { format: f, video, audio };
  };
  for (const f of format === 'auto' ? (['mp4', 'webm'] as const) : ([format] as const)) {
    const picked = await tryFormat(f);
    if (picked) return picked;
  }
  throw new ExportUnsupportedError(`format '${format}'${needAudio ? ' with audio' : ''}`);
}

/** Mix timeline audio clips sample-accurately (§5.3 browser path). Window-only (OfflineAudioContext). */
export async function mixAudio(clips: AudioClip[], duration: number, sampleRate = 48000): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  for (const clip of clips) {
    if (clip.at >= duration) continue;
    const resp = await fetch(clip.asset.url);
    if (!resp.ok) throw new Error(`audio asset fetch failed (${resp.status}): ${clip.asset.url}`);
    const decoded = await ctx.decodeAudioData(await resp.arrayBuffer());
    const node = ctx.createBufferSource();
    node.buffer = decoded;
    if (clip.playbackRate !== undefined) node.playbackRate.value = clip.playbackRate;

    let tail: AudioNode = node;
    if (clip.gain) {
      const gainNode = ctx.createGain();
      // linear-ramp automation from gain-track keys (clip-local seconds);
      // eased keys are approximated linearly, mirroring the CLI mix
      const keys = clip.gain.keys;
      gainNode.gain.setValueAtTime(Number(keys[0]!.value), Math.max(0, clip.at));
      for (const k of keys) {
        gainNode.gain.linearRampToValueAtTime(Number(sampleTrack(clip.gain, k.t)), clip.at + k.t);
      }
      tail.connect(gainNode);
      tail = gainNode;
    }
    tail.connect(ctx.destination);

    const offset = clip.trim?.start ?? 0;
    const sourceDur = clip.trim ? clip.trim.end - clip.trim.start : undefined;
    if (sourceDur !== undefined) node.start(Math.max(0, clip.at), offset, sourceDur);
    else node.start(Math.max(0, clip.at), offset);
  }
  return ctx.startRendering();
}

/** Main-thread premix for the worker path: mixAudio flattened to transferable channels. */
export async function premixTimelineAudio(clips: AudioClip[], duration: number): Promise<PremixedAudio> {
  const buf = await mixAudio(clips, duration);
  const channelData: Float32Array[] = [];
  // slice(): each channel gets its own ArrayBuffer so the set is transferable
  for (let i = 0; i < buf.numberOfChannels; i++) channelData.push(buf.getChannelData(i).slice());
  return { sampleRate: buf.sampleRate, channelData };
}

/** Export a scene + timeline to a video Blob, entirely in the browser. */
export async function exportVideo(
  scene: Scene,
  doc: Timeline,
  opts: WebExportOptions = {},
): Promise<WebExportResult> {
  const compiled = compileTimeline(doc);
  const fps = opts.fps ?? doc.fps ?? 60;
  const duration = compiled.duration;
  const total = Math.max(1, Math.ceil(duration * fps));
  const { w, h } = scene.size;
  const videoBitrate = opts.videoBitrate ?? 8e6;

  const picked = await pickCodecs(opts.format ?? 'auto', w, h, videoBitrate, compiled.audio.length > 0);

  const canvas = new OffscreenCanvas(w, h);
  const backend = new Canvas2DBackend(canvas);
  scene.setTextMeasurer(backend); // §3.2

  // Open and register timeline assets (§3.8); video sources warm on demand below.
  const videoSources = new Map<string, VideoFrameSource>();
  for (const [assetId, ref] of Object.entries(doc.assets ?? {})) {
    if (ref.kind === 'font') {
      // frame-exact export awaits every declared face before frame 0 (§3.6)
      const face = new FontFace(assetId, `url(${ref.url})`);
      // FontFaceSet lives on document.fonts (main thread) or self.fonts (worker)
      const g = globalThis as unknown as {
        document?: { fonts?: { add(f: FontFace): void } };
        fonts?: { add(f: FontFace): void };
      };
      const fontSet = g.document?.fonts ?? g.fonts;
      fontSet?.add(face);
      await face.load();
    } else if (ref.kind === 'image') {
      const resp = await fetch(ref.url);
      if (!resp.ok) throw new Error(`image asset fetch failed (${resp.status}): ${ref.url}`);
      backend.setImageAsset(assetId, await createImageBitmap(await resp.blob()));
    } else if (ref.kind === 'video') {
      const source = await MediabunnyVideoFrameSource.open(ref.url, assetId);
      backend.setVideoAsset(assetId, source);
      videoSources.set(assetId, source);
    }
  }

  /** Render one frame, demand-warming any cold video source and retrying (§2.5). */
  const renderFrame = async (t: number): Promise<void> => {
    for (let attempt = 0; ; attempt++) {
      try {
        backend.render(evaluate(scene, doc, t));
        return;
      } catch (e) {
        if (e instanceof ColdAssetError && e.mediaT !== undefined && attempt < 3) {
          const source = videoSources.get(e.assetId);
          if (source) {
            await source.warm(e.mediaT, e.mediaT);
            continue;
          }
        }
        throw e;
      }
    }
  };

  const output = new Output({
    format: picked.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, { codec: picked.video, bitrate: videoBitrate });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let feedAudio: (() => Promise<void>) | null = null;
  if (picked.audio) {
    const bitrate = opts.audioBitrate ?? 192e3;
    const premixed = opts.premixedAudio;
    if (premixed) {
      // worker path: raw planar f32 channels, no OfflineAudioContext needed here
      const source = new AudioSampleSource({ codec: picked.audio, bitrate });
      output.addAudioTrack(source);
      feedAudio = async () => {
        const frames = premixed.channelData[0]?.length ?? 0;
        const data = new Float32Array(frames * premixed.channelData.length);
        premixed.channelData.forEach((ch, i) => data.set(ch, i * frames));
        await source.add(
          new AudioSample({
            data,
            format: 'f32-planar',
            numberOfChannels: premixed.channelData.length,
            sampleRate: premixed.sampleRate,
            timestamp: 0,
          }),
        );
        source.close();
      };
    } else {
      const source = new AudioBufferSource({ codec: picked.audio, bitrate });
      output.addAudioTrack(source);
      feedAudio = async () => {
        await source.add(await mixAudio(compiled.audio, duration));
        source.close();
      };
    }
  }

  await output.start();
  if (feedAudio) await feedAudio();

  for (let f = 0; f < total; f++) {
    await renderFrame(f / fps);
    await videoSource.add(f / fps, 1 / fps);
    opts.onProgress?.(f + 1, total);
  }
  videoSource.close();
  await output.finalize();
  for (const source of videoSources.values()) source.close();

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('muxer produced no output');
  return {
    blob: new Blob([buffer], { type: picked.format === 'mp4' ? 'video/mp4' : 'video/webm' }),
    format: picked.format,
    videoCodec: picked.video,
    audioCodec: picked.audio,
    frames: total,
  };
}

/** Unconditional fallback (§5.2): per-frame PNG blobs via a callback — works wherever canvas does. */
export async function exportPngFrames(
  scene: Scene,
  doc: Timeline,
  onFrame: (frame: number, png: Blob) => void | Promise<void>,
  opts: { fps?: number } = {},
): Promise<{ frames: number }> {
  const compiled = compileTimeline(doc);
  const fps = opts.fps ?? doc.fps ?? 60;
  const total = Math.max(1, Math.ceil(compiled.duration * fps));
  const canvas = new OffscreenCanvas(scene.size.w, scene.size.h);
  const backend = new Canvas2DBackend(canvas);
  for (let f = 0; f < total; f++) {
    backend.render(evaluate(scene, doc, f / fps));
    await onFrame(f, await canvas.convertToBlob({ type: 'image/png' }));
  }
  return { frames: total };
}

export {
  requestWorkerExport,
  serveExportRequest,
  type ExportWorkerRequest,
  type ExportWorkerResponse,
  type WorkerExportHandle,
} from './workerProtocol.js';
