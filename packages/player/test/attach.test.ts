import { describe, expect, it } from 'vitest';
import { createPlayhead } from '@glissade/core';
import { createPlayer, TargetOverlapError, type AttachedMachine, type Driver } from '../src/index.js';

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

function fakeMachine(targets: string[]): AttachedMachine & { steps: number[] } {
  const steps: number[] = [];
  return {
    steps,
    targets: new Set(targets),
    step: (now) => steps.push(now),
  };
}

function makePlayer(targets: string[] = []) {
  const playhead = createPlayhead();
  const { driver, tick } = manualDriver();
  const player = createPlayer({ playhead, duration: 2, driver, targets }, {});
  return { player, playhead, tick };
}

describe('player.attach (v2 §A.5): machines on the host clock', () => {
  it('steps attached machines on every tick, in attach order, even while paused', () => {
    const { player, tick } = makePlayer();
    const a = fakeMachine(['a/x']);
    const b = fakeMachine(['b/x']);
    const order: string[] = [];
    a.step = (now) => order.push(`a@${now}`);
    b.step = (now) => order.push(`b@${now}`);
    player.attach(a);
    player.attach(b);
    tick(0.1); // playback never started — hover must survive a paused timeline
    tick(0.2);
    expect(player.playing).toBe(false);
    expect(order).toEqual(['a@0.1', 'b@0.1', 'a@0.2', 'b@0.2']);
  });

  it('machines step before the playhead write on a playing tick', () => {
    const { player, playhead, tick } = makePlayer();
    let playheadAtStep = -1;
    player.attach({
      targets: new Set(['m/x']),
      step: () => {
        playheadAtStep = playhead.peek();
      },
    });
    player.play();
    tick(0);
    tick(0.5);
    expect(playheadAtStep).toBe(0); // step saw the pre-tick playhead: machines run first
    expect(playhead.peek()).toBeCloseTo(0.5, 9);
  });

  it('hard-errors on overlap with the player timeline and with other machines (§A.1)', () => {
    const { player } = makePlayer(['btn/x', 'bg/opacity']);
    expect(() => player.attach(fakeMachine(['btn/x']))).toThrow(TargetOverlapError);
    expect(() => player.attach(fakeMachine(['btn/x']))).toThrow(/player timeline/);
    player.attach(fakeMachine(['fab/scale']));
    expect(() => player.attach(fakeMachine(['fab/scale']))).toThrow(/another machine/);
  });

  it('detach stops stepping and frees the target set for a new machine', () => {
    const { player, tick } = makePlayer();
    const m = fakeMachine(['fab/scale']);
    const detach = player.attach(m);
    tick(0.1);
    detach();
    tick(0.2);
    expect(m.steps).toEqual([0.1]);
    player.attach(fakeMachine(['fab/scale'])); // no overlap error after detach
  });

  it('dispose() drops all attachments', () => {
    const { player, tick } = makePlayer();
    const m = fakeMachine(['fab/scale']);
    player.attach(m);
    tick(0.1);
    player.dispose();
    expect(m.steps).toEqual([0.1]);
  });
});
