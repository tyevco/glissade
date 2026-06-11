/**
 * Drivers (DESIGN.md §4.1): a Driver is anything that writes a time value.
 * Drivers push *time*; rendering is pulled from the signal graph. The Player's
 * clock is the default Driver, not a privileged one — this seam is the v2
 * interactivity path (§2.9).
 */

export interface Driver {
  /** Begin writing. Call write(seconds) whenever the driven value changes. */
  start(write: (t: number) => void, ctx: DriverContext): void;
  stop(): void;
}

export interface DriverContext {
  /** Timeline duration, for normalization. */
  duration: number;
  visibility: () => 'visible' | 'hidden';
}

/**
 * rAF clock: writes monotonically increasing elapsed seconds since start().
 * Playback policy (rate, loop, pause) is the Player's job, not the clock's.
 */
export function clockDriver(): Driver {
  let handle = 0;
  let running = false;
  return {
    start(write) {
      running = true;
      let origin: number | undefined;
      const tick = (nowMs: number) => {
        if (!running) return;
        origin ??= nowMs;
        write((nowMs - origin) / 1000);
        handle = requestAnimationFrame(tick);
      };
      handle = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
  };
}

export interface ScrollDriverOptions {
  source: Element | (Window & typeof globalThis);
  axis?: 'x' | 'y';
  /** Map scroll progress 0..1 onto [from, to] seconds; defaults to [0, duration]. */
  range?: [number, number];
}

/** User-controlled scalar: scroll progress 0..1 → t. Writes the playhead directly. */
export function scrollDriver(opts: ScrollDriverOptions): Driver {
  const axis = opts.axis ?? 'y';
  let listener: (() => void) | null = null;
  const el = opts.source;
  return {
    start(write, ctx) {
      const range = opts.range ?? [0, ctx.duration];
      const progress = (): number => {
        if (el instanceof Element) {
          const max = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
          const pos = axis === 'y' ? el.scrollTop : el.scrollLeft;
          return max > 0 ? pos / max : 0;
        }
        const doc = document.documentElement;
        const max = axis === 'y' ? doc.scrollHeight - window.innerHeight : doc.scrollWidth - window.innerWidth;
        const pos = axis === 'y' ? window.scrollY : window.scrollX;
        return max > 0 ? pos / max : 0;
      };
      listener = () => {
        const p = Math.min(1, Math.max(0, progress()));
        write(range[0] + p * (range[1] - range[0]));
      };
      el.addEventListener('scroll', listener, { passive: true });
      listener();
    },
    stop() {
      if (listener) el.removeEventListener('scroll', listener);
      listener = null;
    },
  };
}
