/**
 * The Player (DESIGN.md §4.2): composes a clock Driver with playback policy.
 * The only stateful object in the runtime; its state is rate, loop mode, and
 * a base-time offset. Time-based, never frame-counted — a dropped frame skips
 * ahead, it never drifts.
 */

import { type Marker, type Playhead } from '@glissade/core';
import { clockDriver, type Driver } from './driver.js';

export type LoopMode = boolean | { mode: 'restart' | 'alternate'; count?: number };

export interface PlayerOptions {
  loop?: LoopMode;
  rate?: number;
  autoplay?: boolean;
}

export interface PlayHandle {
  /** true = completed naturally, false = interrupted. Completion signal ONLY (§2). */
  finished: Promise<boolean>;
}

export interface PlayerInit {
  playhead: Playhead;
  duration: number;
  markers?: Marker[];
  /** Injected clock; defaults to the rAF clockDriver. Tests pass a manual driver. */
  driver?: Driver;
  visibility?: () => 'visible' | 'hidden';
}

export interface Player {
  readonly playhead: Playhead;
  readonly duration: number;
  readonly playing: boolean;
  rate: number;
  play(opts?: { range?: [number, number] }): PlayHandle;
  pause(): void;
  /** Direct playhead write: pure, never fires marker callbacks (§4.2). */
  seek(t: number): void;
  /** Register a marker callback; fired only when continuous playback crosses it. */
  onMarker(name: string, cb: (marker: Marker) => void): () => void;
  dispose(): void;
}

export function createPlayer(init: PlayerInit, opts: PlayerOptions = {}): Player {
  const { playhead, duration } = init;
  const markers = init.markers ?? [];
  const driver = init.driver ?? clockDriver();
  const loop: LoopMode = opts.loop ?? false;
  const callbacks = new Map<string, Set<(m: Marker) => void>>();

  let rate = opts.rate ?? 1;
  let playing = false;
  let driverRunning = false;

  // playback math: t = base + (elapsed - elapsedOrigin) * rate
  let base = 0;
  let elapsedOrigin: number | null = null;
  let lastElapsed = 0;
  let range: [number, number] = [0, duration];
  let loopsDone = 0;
  let resolveFinished: ((completed: boolean) => void) | null = null;

  function fireMarkers(from: number, to: number): void {
    if (from === to || callbacks.size === 0) return;
    const forward = to > from;
    for (const m of markers) {
      const crossed = forward ? m.t > from && m.t <= to : m.t >= to && m.t < from;
      if (crossed) {
        for (const cb of callbacks.get(m.name) ?? []) cb(m);
      }
    }
  }

  function settle(completed: boolean): void {
    playing = false;
    elapsedOrigin = null;
    const resolve = resolveFinished;
    resolveFinished = null;
    resolve?.(completed);
  }

  function onElapsed(elapsed: number): void {
    lastElapsed = elapsed;
    if (!playing) return;
    elapsedOrigin ??= elapsed;
    const prev = playhead.peek();
    let t = base + (elapsed - elapsedOrigin) * rate;
    const [lo, hi] = range;
    const overEnd = rate >= 0 ? t >= hi : t <= lo;

    if (!overEnd) {
      playhead.set(t);
      fireMarkers(prev, t);
      return;
    }

    const loopCfg = loop === true ? { mode: 'restart' as const } : loop === false ? null : loop;
    const maxLoops = loopCfg && 'count' in loopCfg && loopCfg.count !== undefined ? loopCfg.count : Infinity;
    if (!loopCfg || loopsDone + 1 >= maxLoops) {
      const end = rate >= 0 ? hi : lo;
      playhead.set(end);
      fireMarkers(prev, end);
      settle(true);
      return;
    }
    loopsDone++;
    const span = hi - lo;
    if (loopCfg.mode === 'alternate') {
      // reflect: flip direction, continue from the boundary
      fireMarkers(prev, rate >= 0 ? hi : lo);
      rate = -rate;
      base = rate >= 0 ? lo : hi;
    } else {
      fireMarkers(prev, rate >= 0 ? hi : lo);
      base = rate >= 0 ? lo : hi;
    }
    elapsedOrigin = elapsed;
    t = base;
    playhead.set(t);
    void span;
  }

  function ensureDriver(): void {
    if (driverRunning) return;
    driverRunning = true;
    driver.start(onElapsed, {
      duration,
      visibility: init.visibility ?? (() => 'visible'),
    });
  }

  return {
    playhead,
    duration,
    get playing() {
      return playing;
    },
    get rate() {
      return rate;
    },
    set rate(r: number) {
      // rebase so the playhead is continuous through a rate change
      base = playhead.peek();
      elapsedOrigin = playing ? lastElapsed : null;
      rate = r;
    },
    play(playOpts) {
      if (resolveFinished) settle(false); // a new play() interrupts the pending one
      range = playOpts?.range ?? [0, duration];
      const t = playhead.peek();
      const [lo, hi] = range;
      base = rate >= 0 ? (t >= hi || t < lo ? lo : t) : t <= lo || t > hi ? hi : t;
      playhead.set(base);
      elapsedOrigin = null;
      loopsDone = 0;
      playing = true;
      ensureDriver();
      const finished = new Promise<boolean>((resolve) => {
        resolveFinished = resolve;
      });
      return { finished };
    },
    pause() {
      if (!playing) return;
      base = playhead.peek();
      settle(false);
    },
    seek(t) {
      base = Math.min(Math.max(t, 0), duration);
      elapsedOrigin = playing ? lastElapsed : null;
      playhead.set(base);
    },
    onMarker(name, cb) {
      let set = callbacks.get(name);
      if (!set) {
        set = new Set();
        callbacks.set(name, set);
      }
      set.add(cb);
      return () => set.delete(cb);
    },
    dispose() {
      if (playing) settle(false);
      if (driverRunning) driver.stop();
      driverRunning = false;
    },
  };
}
