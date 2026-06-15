import { describe, expect, it, vi } from 'vitest';
import { createPlayhead, type Marker } from '@glissade/core';
import { createPlayer, type Driver } from '../src/index.js';

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
