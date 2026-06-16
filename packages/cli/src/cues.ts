/**
 * Composer cue signaling (§ad-break): cue markers (those carrying a `data.kind`)
 * are emitted at render as a deterministic `<stem>.cues.json` sidecar so a
 * downstream NLE / ad-insertion pipeline has machine-readable break points, and
 * optionally as WebVTT chapters. Mirrors the captions sidecar plumbing.
 */

import { writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Marker } from '@glissade/core';

export interface Cue {
  t: number;
  kind: string;
  name: string;
  /** Human-readable label (`data.title`); the chapter text in `--chapters vtt`. */
  title?: string;
  duration?: number;
}

/** Cue markers (those carrying a string `data.kind`) → a sorted cue list. */
export function collectCues(markers: readonly Marker[]): Cue[] {
  const cues: Cue[] = [];
  for (const m of markers) {
    const data = m.data as { kind?: unknown; title?: unknown; duration?: unknown } | undefined;
    if (!data || typeof data !== 'object' || typeof data.kind !== 'string') continue;
    cues.push({
      t: m.t,
      kind: data.kind,
      name: m.name,
      ...(typeof data.title === 'string' ? { title: data.title } : {}),
      ...(typeof data.duration === 'number' ? { duration: data.duration } : {}),
    });
  }
  return cues.sort((a, b) => a.t - b.t);
}

function vttTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))}.${p(ms % 1000, 3)}`;
}

/**
 * WebVTT chapters from cues; each runs until its duration or the next cue. The
 * cue text is the human `title` (falling back to `name`), not the machine
 * `kind`. When the earliest cue starts after 0, a `00:00` "Intro" chapter is
 * auto-anchored — both valid WebVTT and required for YouTube description
 * chapters (which read the cue text as the title and need a 0:00 start).
 */
export function cuesToVtt(cues: Cue[], totalDuration: number): string {
  const anchored: Cue[] =
    cues.length > 0 && cues[0]!.t > 0
      ? [{ t: 0, kind: 'chapter', name: 'Intro', title: 'Intro' }, ...cues]
      : cues;
  let out = 'WEBVTT\n\n';
  anchored.forEach((c, i) => {
    const end = c.duration !== undefined ? c.t + c.duration : (anchored[i + 1]?.t ?? totalDuration);
    out += `${c.name}\n${vttTime(c.t)} --> ${vttTime(end)}\n${c.title ?? c.name}\n\n`;
  });
  return out;
}

/**
 * Write `<stem>.cues.json` (always, when cues exist) and, when `chaptersVtt`,
 * `<stem>.chapters.vtt`, next to the render output. Deterministic. Returns the
 * paths written.
 */
export function writeCueSidecars(
  outPath: string,
  markers: readonly Marker[],
  totalDuration: number,
  chaptersVtt: boolean,
): string[] {
  const cues = collectCues(markers);
  if (cues.length === 0) return [];
  const isFile = /\.(mp4|webm)$/i.test(outPath);
  const dir = isFile ? dirname(outPath) : outPath;
  // a video out names the sidecar after it (foo.cues.json); a png-seq dir gets bare names
  const prefix = isFile ? `${basename(outPath).replace(/\.(mp4|webm)$/i, '')}.` : '';
  const written: string[] = [];
  const jsonPath = join(dir, `${prefix}cues.json`);
  writeFileSync(jsonPath, JSON.stringify({ cues }, null, 2) + '\n');
  written.push(jsonPath);
  if (chaptersVtt) {
    const vttPath = join(dir, `${prefix}chapters.vtt`);
    writeFileSync(vttPath, cuesToVtt(cues, totalDuration));
    written.push(vttPath);
  }
  return written;
}
