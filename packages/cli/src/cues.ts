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

/** The cue kinds that become WebVTT chapters by default (the YouTube use case). */
export const DEFAULT_CHAPTER_KINDS: ReadonlySet<string> = new Set(['chapter']);

/**
 * WebVTT chapters from cues. Only cues whose `kind` is in `kinds` (default just
 * `'chapter'`) become chapters — ad-break / plain `cue` markers stay out of the
 * chapter list (they remain in `cues.json` for machines), so the VTT pastes
 * straight into a YouTube description. Each chapter runs until its duration or
 * the next chapter; the cue text is the human `title` (falling back to `name`),
 * never the machine `kind`. When the earliest chapter starts after 0, a `00:00`
 * "Intro" chapter is auto-anchored (valid WebVTT, and YouTube needs a 0:00 start).
 *
 * Author note — YouTube's chapter rules are author-side, not enforced here:
 * it needs the FIRST chapter at exactly 0:00 (the auto-anchor handles this, but
 * a tiny first chapter from a lead-in will read oddly — pin chapter 1 to t=0
 * instead) and EVERY chapter to be >= 10s (fold a too-short beat into its
 * neighbour). cues.json is unaffected; only the human-pasted VTT cares.
 */
export function cuesToVtt(cues: Cue[], totalDuration: number, kinds: ReadonlySet<string> = DEFAULT_CHAPTER_KINDS): string {
  const chapters = cues.filter((c) => kinds.has(c.kind));
  const anchored: Cue[] =
    chapters.length > 0 && chapters[0]!.t > 0
      ? [{ t: 0, kind: 'chapter', name: 'Intro', title: 'Intro' }, ...chapters]
      : chapters;
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
  chapterKinds: ReadonlySet<string> = DEFAULT_CHAPTER_KINDS,
): string[] {
  const cues = collectCues(markers);
  if (cues.length === 0) return [];
  const isFile = /\.(mp4|webm)$/i.test(outPath);
  const dir = isFile ? dirname(outPath) : outPath;
  // a video out names the sidecar after it (foo.cues.json); a png-seq dir gets bare names
  const prefix = isFile ? `${basename(outPath).replace(/\.(mp4|webm)$/i, '')}.` : '';
  const written: string[] = [];
  const jsonPath = join(dir, `${prefix}cues.json`);
  // cues.json keeps ALL kinds (the machine-readable superset); only the VTT filters
  writeFileSync(jsonPath, JSON.stringify({ cues }, null, 2) + '\n');
  written.push(jsonPath);
  if (chaptersVtt) {
    const vttPath = join(dir, `${prefix}chapters.vtt`);
    writeFileSync(vttPath, cuesToVtt(cues, totalDuration, chapterKinds));
    written.push(vttPath);
  }
  return written;
}
