/**
 * Audio mixing on the CLI path (DESIGN.md §5.3): the timeline's AudioClip
 * metadata compiles to an FFmpeg filter graph (atrim/atempo/volume/adelay/
 * amix) applied at mux time. Offsets are time arithmetic on clip metadata —
 * never a clock; A/V reconcile only through fps and sampleRate.
 */

import { dirname, isAbsolute, resolve } from 'node:path';
import { audioOffsetSamples, type AudioClip, type Key } from '@glissade/core';

export class AudioMixError extends Error {
  constructor(detail: string) {
    super(`audio mix: ${detail}`);
    this.name = 'AudioMixError';
  }
}

/** Resolve a clip asset URL relative to the scene module's directory. */
export function resolveAssetPath(url: string, modulePath: string): string {
  if (/^[a-z]+:\/\//i.test(url)) {
    throw new AudioMixError(`remote audio assets are not supported on the CLI path yet: ${url}`);
  }
  return isAbsolute(url) ? url : resolve(dirname(resolve(modulePath)), url);
}

/**
 * Piecewise-linear FFmpeg volume expression from gain-track keys. Eases are
 * approximated linearly with a warning at the call site; keys outside the
 * clip hold their boundary value.
 */
export function gainExpression(keys: Key[]): string {
  if (keys.length === 0) throw new AudioMixError('gain track has no keys');
  if (keys.length === 1) return String(Number(keys[0]!.value));
  let expr = String(Number(keys[keys.length - 1]!.value)); // after last key
  for (let i = keys.length - 1; i >= 1; i--) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    const va = Number(a.value);
    const vb = Number(b.value);
    const seg = `${va}+(${vb - va})*(t-${a.t})/(${b.t - a.t})`;
    expr = `if(lt(t,${b.t}),${seg},${expr})`;
  }
  return `if(lt(t,${keys[0]!.t}),${Number(keys[0]!.value)},${expr})`;
}

/** atempo only accepts [0.5, 2]; chain filters for rates outside. */
export function atempoChain(rate: number): string[] {
  if (!(rate > 0)) throw new AudioMixError(`playbackRate must be > 0, got ${rate}`);
  const chain: string[] = [];
  let r = rate;
  while (r > 2) {
    chain.push('atempo=2');
    r /= 2;
  }
  while (r < 0.5) {
    chain.push('atempo=0.5');
    r *= 2;
  }
  if (Math.abs(r - 1) > 1e-9 || chain.length === 0) chain.push(`atempo=${r}`);
  return chain;
}

export interface AudioMixPlan {
  /** extra `-i` inputs, in order, starting at input index 1 (0 = video) */
  inputs: string[];
  /** -filter_complex value producing [aout] */
  filterComplex: string;
  hasEasedGain: boolean;
}

/**
 * Append a PURE scalar publish-loudness gain to a mix's `-filter_complex`: the
 * graph's final `[aout]` label is renamed and a `volume=<gain>dB` node feeds the
 * new `[aout]`. This is a single multiply on the FINAL mix node — NOT a second
 * ffmpeg pass — and is bit-deterministic (verified) + golden-hashable. A gain of
 * exactly 0 dB is a no-op (returned unchanged) so an at-target source preserves
 * the prior, un-gained bytes.
 */
export function applyMixGainDb(filterComplex: string, gainDb: number): string {
  if (gainDb === 0) return filterComplex;
  const marker = '[aout]';
  const at = filterComplex.lastIndexOf(marker);
  if (at < 0) throw new AudioMixError('mix filter graph has no [aout] to apply the loudness gain to');
  // rename the existing terminal label, then add the gain node → [aout]
  const head = filterComplex.slice(0, at) + '[apreg]' + filterComplex.slice(at + marker.length);
  return `${head};[apreg]volume=${gainDb}dB[aout]`;
}

/** Build the FFmpeg mix plan for clips that intersect [0, duration]. */
export function planAudioMix(clips: AudioClip[], modulePath: string, duration: number): AudioMixPlan | null {
  const active = clips.filter((c) => c.at < duration);
  if (active.length === 0) return null;

  const inputs: string[] = [];
  const chains: string[] = [];
  let hasEasedGain = false;

  active.forEach((clip, i) => {
    inputs.push(resolveAssetPath(clip.asset.url, modulePath));
    const steps: string[] = [];
    if (clip.trim) steps.push(`atrim=start=${clip.trim.start}:end=${clip.trim.end}`);
    steps.push('asetpts=PTS-STARTPTS');
    if (clip.playbackRate !== undefined && clip.playbackRate !== 1) {
      steps.push(...atempoChain(clip.playbackRate));
    }
    if (clip.gain) {
      if (clip.gain.keys.some((k) => k.ease !== undefined)) hasEasedGain = true;
      // gain keys are clip-local seconds (post-trim/tempo)
      steps.push(`volume='${gainExpression(clip.gain.keys)}':eval=frame`);
    }
    if (clip.at > 0) {
      // delay expressed in ms but derived from the SAMPLE grid (§5.3), so the
      // offset lands on exactly the same sample the browser path uses
      const ms = (audioOffsetSamples(clip.at) / 48000) * 1000;
      steps.push(`adelay=${ms}:all=1`);
    }
    steps.push('apad'); // pad so amix keeps full length regardless of clip ends
    chains.push(`[${i + 1}:a]${steps.join(',')}[a${i}]`);
  });

  const mixInputs = active.map((_, i) => `[a${i}]`).join('');
  const mix =
    active.length === 1
      ? `${mixInputs}atrim=end=${duration}[aout]`
      : `${mixInputs}amix=inputs=${active.length}:normalize=0,atrim=end=${duration}[aout]`;
  return { inputs, filterComplex: [...chains, mix].join(';'), hasEasedGain };
}
