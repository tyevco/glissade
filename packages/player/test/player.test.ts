import { describe, expect, it, vi } from 'vitest';
import { createPlayhead, timeline, type Marker } from '@glissade/core';
import {
  createPlayer,
  planReducedMotion,
  swapOnHmr,
  type Driver,
  type Mounted,
} from '../src/index.js';

/** Manual clock: tests advance elapsed seconds explicitly. */
function manualDriver() {
  let write: ((t: number) => void) | null = null;
  const driver: Driver = {
    start(w) {
      write = w;
    },
    stop() {
      write = null;
    },
  };
  return { driver, tick: (elapsed: number) => write?.(elapsed) };
}

function makePlayer(opts: Parameters<typeof createPlayer>[1] = {}, markers: Marker[] = []) {
  const playhead = createPlayhead();
  const { driver, tick } = manualDriver();
  const player = createPlayer({ playhead, duration: 2.5, markers, driver }, opts);
  return { playhead, player, tick };
}

describe('playback math (§4.2: time-based, not frame-counted)', () => {
  it('advances with elapsed time at the configured rate', () => {
    const { player, playhead, tick } = makePlayer({ rate: 2 });
    player.play();
    tick(0);
    tick(0.5);
    expect(playhead.peek()).toBeCloseTo(1.0, 9);
  });

  it('playingSignal reactively mirrors play/pause (canary fix: pause does not move the playhead)', () => {
    const { player, tick } = makePlayer();
    const seen: boolean[] = [];
    const unsub = player.playingSignal.subscribe(() => seen.push(player.playingSignal.peek()));
    player.play();
    tick(0);
    expect(player.playingSignal.peek()).toBe(true);
    player.pause(); // playhead is unchanged here — a playhead-only observer would miss this transition
    expect(player.playingSignal.peek()).toBe(false);
    expect(player.playing).toBe(false);
    unsub();
    expect(seen).toContain(true); // play fired the signal
    expect(seen).toContain(false); // pause fired the signal (the bug was this never invalidating)
  });

  it('dropped frames skip ahead without drift', () => {
    const { player, playhead, tick } = makePlayer();
    player.play();
    tick(0);
    tick(1.7); // one giant gap ≡ many small ticks
    expect(playhead.peek()).toBeCloseTo(1.7, 9);
  });

  it('seek-then-play ≡ play-through at the same t', () => {
    const a = makePlayer();
    a.player.play();
    a.tick(0);
    a.tick(1.25);

    const b = makePlayer();
    b.player.seek(1.0);
    b.player.play();
    b.tick(0);
    b.tick(0.25);

    expect(a.playhead.peek()).toBeCloseTo(b.playhead.peek(), 9);
  });

  it('pause freezes; resume continues from the same t', () => {
    const { player, playhead, tick } = makePlayer();
    player.play();
    tick(0);
    tick(1);
    player.pause();
    tick(5);
    expect(playhead.peek()).toBeCloseTo(1, 9);
    player.play();
    tick(6);
    tick(6.5);
    expect(playhead.peek()).toBeCloseTo(1.5, 9);
  });

  it('completion clamps to the end and resolves finished=true', async () => {
    const { player, playhead, tick } = makePlayer();
    const handle = player.play();
    tick(0);
    tick(99);
    expect(playhead.peek()).toBe(2.5);
    await expect(handle.finished).resolves.toBe(true);
    expect(player.playing).toBe(false);
  });

  it('pause resolves finished=false (interruption)', async () => {
    const { player, tick } = makePlayer();
    const handle = player.play();
    tick(0);
    tick(1);
    player.pause();
    await expect(handle.finished).resolves.toBe(false);
  });

  it('rate change mid-flight is continuous', () => {
    const { player, playhead, tick } = makePlayer();
    player.play();
    tick(0);
    tick(1);
    player.rate = -1; // reverse is a rate sign, not a mode (§4.2)
    tick(1.5);
    expect(playhead.peek()).toBeCloseTo(0.5, 9);
  });

  it('play({range}) clamps within the range', () => {
    const { player, playhead, tick } = makePlayer();
    const handle = player.play({ range: [1, 2] });
    expect(playhead.peek()).toBe(1);
    tick(0);
    tick(0.5);
    expect(playhead.peek()).toBeCloseTo(1.5, 9);
    tick(5);
    expect(playhead.peek()).toBe(2);
    return expect(handle.finished).resolves.toBe(true);
  });
});

describe('looping', () => {
  it('restart loops wrap to the range start', () => {
    const { player, playhead, tick } = makePlayer({ loop: true });
    player.play();
    tick(0);
    tick(2.6); // past duration → wrapped
    expect(playhead.peek()).toBe(0);
    tick(3.1);
    expect(playhead.peek()).toBeCloseTo(0.5, 9);
    expect(player.playing).toBe(true);
  });

  it('alternate loops reflect direction', () => {
    const { player, playhead, tick } = makePlayer({ loop: { mode: 'alternate' } });
    player.play();
    tick(0);
    tick(2.6);
    expect(playhead.peek()).toBe(2.5);
    tick(3.6);
    expect(playhead.peek()).toBeCloseTo(1.5, 9);
  });

  it('count-limited loops finish', async () => {
    const { player, tick } = makePlayer({ loop: { mode: 'restart', count: 2 } });
    const handle = player.play();
    tick(0);
    tick(2.6); // end of loop 1 → wraps
    tick(5.2); // end of loop 2 → finishes
    await expect(handle.finished).resolves.toBe(true);
  });
});

describe('markers (§4.2: continuous crossing only)', () => {
  const markers: Marker[] = [{ t: 1.0, name: 'hit' }];

  it('fires exactly once when playback crosses forward', () => {
    const { player, tick } = makePlayer({}, markers);
    const cb = vi.fn();
    player.onMarker('hit', cb);
    player.play();
    tick(0);
    tick(0.9);
    expect(cb).not.toHaveBeenCalled();
    tick(1.1);
    expect(cb).toHaveBeenCalledTimes(1);
    tick(1.2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('onCue fires for any marker matching a data.kind on crossing', () => {
    const cued: Marker[] = [{ t: 1.0, name: 'midroll', data: { kind: 'ad-break', duration: 30 } }];
    const { player, tick } = makePlayer({}, cued);
    const cb = vi.fn();
    player.onCue('ad-break', cb);
    player.play();
    tick(0);
    tick(0.9);
    expect(cb).not.toHaveBeenCalled();
    tick(1.1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect((cb.mock.calls[0]![0] as Marker).name).toBe('midroll');
  });

  it('fires on backward crossing under reverse rate', () => {
    const { player, tick } = makePlayer({ rate: -1 }, markers);
    const cb = vi.fn();
    player.onMarker('hit', cb);
    player.seek(2.0);
    player.play();
    tick(0);
    tick(1.5);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('seek never fires callbacks', () => {
    const { player, tick } = makePlayer({}, markers);
    const cb = vi.fn();
    player.onMarker('hit', cb);
    player.seek(2.0);
    player.seek(0);
    void tick;
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('swap (§4.3: HMR rebind preserves the playhead)', () => {
  it('rebinds duration + markers and keeps the current playhead', () => {
    const { player, playhead, tick } = makePlayer({}, [{ t: 1, name: 'old' }]);
    player.play();
    tick(0);
    tick(1.2);
    player.swap({ duration: 5, markers: [{ t: 3, name: 'new' }] });
    expect(player.duration).toBe(5);
    expect(playhead.peek()).toBeCloseTo(1.2, 9); // no replay-to-frame
  });

  it('clamps the playhead into a shorter new duration', () => {
    const { player, playhead } = makePlayer();
    player.seek(2.4);
    player.swap({ duration: 1 });
    expect(player.duration).toBe(1);
    expect(playhead.peek()).toBe(1);
  });

  it('fires markers from the swapped timeline and keeps playing continuously', () => {
    const { player, playhead, tick } = makePlayer({}, [{ t: 1, name: 'old' }]);
    const cb = vi.fn();
    player.onMarker('new', cb);
    player.play();
    tick(0);
    tick(0.5);
    player.swap({ duration: 5, markers: [{ t: 2, name: 'new' }] });
    expect(player.playing).toBe(true);
    tick(2.5); // continuous from 0.5 → crosses t=2 in the new timeline
    expect(playhead.peek()).toBeCloseTo(2.5, 9);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('background visibility (§4.1)', () => {
  function bgPlayer(background: 'pause' | 'run', visibility: () => 'visible' | 'hidden') {
    const playhead = createPlayhead();
    const { driver, tick } = manualDriver();
    const player = createPlayer({ playhead, duration: 10, driver, visibility }, { background });
    return { playhead, player, tick };
  }

  it("'pause' freezes while hidden and resumes without a wall-clock jump", () => {
    let vis: 'visible' | 'hidden' = 'visible';
    const { player, playhead, tick } = bgPlayer('pause', () => vis);
    player.play();
    tick(0);
    tick(1); // playhead at 1
    vis = 'hidden';
    tick(6); // 5s elapse while hidden — must NOT advance
    expect(playhead.peek()).toBeCloseTo(1, 9);
    vis = 'visible';
    tick(6.5); // first visible tick re-origins here (resumes at 1, no 5s jump)
    expect(playhead.peek()).toBeCloseTo(1, 9);
    tick(7); // only the post-return delta advances
    expect(playhead.peek()).toBeCloseTo(1.5, 9);
  });

  it("'run' advances by the hidden duration", () => {
    let vis: 'visible' | 'hidden' = 'visible';
    const { player, playhead, tick } = bgPlayer('run', () => vis);
    player.play();
    tick(0);
    tick(1);
    vis = 'hidden';
    tick(6); // wall-clock advances through the hidden span
    expect(playhead.peek()).toBeCloseTo(6, 9);
  });
});

describe('reduced motion (§4.2: planReducedMotion is Player policy, pure)', () => {
  const doc = timeline((tl) => {
    tl.to('a/x', 1, { duration: 4 });
  });
  const docWithPoster = timeline((tl) => {
    tl.to('a/x', 1, { duration: 4 });
  });
  docWithPoster.posterTime = 1.5;

  it('respect (default): suppresses autoplay and seeks the poster (= duration)', () => {
    const plan = planReducedMotion(undefined, true, doc, 4, true);
    expect(plan).toEqual({ autoplay: false, seekTo: 4 });
  });

  it('respect: honors an explicit posterTime', () => {
    const plan = planReducedMotion('respect', true, docWithPoster, 4, true);
    expect(plan.seekTo).toBe(1.5);
    expect(plan.autoplay).toBe(false);
  });

  it('ignore: behaves as if there were no preference', () => {
    expect(planReducedMotion('ignore', true, doc, 4, true)).toEqual({ autoplay: true });
  });

  it('no preference: the mode is inert', () => {
    expect(planReducedMotion('respect', false, doc, 4, true)).toEqual({ autoplay: true });
  });

  it('function form: swaps in the calmer alternative (rides §4.3 swap)', () => {
    const calm = timeline((tl) => tl.to('a/x', 1, { duration: 1 }));
    const plan = planReducedMotion(() => calm, true, doc, 4, true);
    expect(plan.swapTo).toBe(calm);
    expect(plan.autoplay).toBe(true);
    expect(plan.seekTo).toBeUndefined();
  });
});

describe('swapOnHmr (§4.3 vite glue)', () => {
  it('swaps the mount and warns when an edit drops a label', () => {
    const before = timeline((tl) => {
      tl.label('intro').to('a/x', 1, { duration: 1 });
    });
    const swaps: Array<{ timeline: unknown }> = [];
    const mounted = { swap: (n: { timeline: unknown }) => swaps.push(n) } as unknown as Mounted;
    const accept = swapOnHmr(mounted, before, (mod) => ({ timeline: mod.timeline as never }));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const after = timeline((tl) => {
      tl.to('a/x', 1, { duration: 1 }); // 'intro' label gone
    });
    accept({ timeline: after });
    expect(swaps).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'intro'"));
    warn.mockRestore();
  });

  it('a null module (broken edit) is a no-op', () => {
    const t = timeline((tl) => tl.to('a/x', 1, { duration: 1 }));
    const swaps: unknown[] = [];
    const mounted = { swap: () => swaps.push(1) } as unknown as Mounted;
    swapOnHmr(mounted, t, (m) => ({ timeline: m.timeline as never }))(undefined);
    expect(swaps).toHaveLength(0);
  });
});
