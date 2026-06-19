import { describe, expect, it } from 'vitest';
import { key, track, sampleTrack, type Track } from '../src/index.js';
import { clip, presence, PresenceError } from '../src/clips.js';

/** Find the reconciled '<id>/opacity' track in a presence result. */
function opacityTrack(tracks: Track[], id: string): Track {
  const tr = tracks.find((t) => t.target === `${id}/opacity`);
  if (!tr) throw new Error(`no opacity track for ${id}`);
  return tr;
}

describe('presence — the determinism invariant', () => {
  it('default presence is deep-equal to the hand-authored reconciled opacity track', () => {
    const { tracks } = presence('card', { show: 1, hide: 5 });
    // default fade: enter 0→1 over [1,1.3], exit 1→0 over [4.7,5]; guard holds 0
    // pre-show and post-hide. The enter/exit ramp keys WIN at the seams, so the
    // reconciled key list has NO double-authored coincident key.
    const hand: Track[] = [
      track('card/opacity', 'number', [
        key(0, 0, { interp: 'hold' }),
        key(1, 0),
        key(1.3, 1),
        key(4.7, 1),
        key(5, 0),
      ]),
    ];
    expect(tracks).toEqual(hand);
  });

  it('the reconciled opacity track has no duplicate coincident keys', () => {
    const { tracks } = presence('card', { show: 1, hide: 5 });
    const tr = opacityTrack(tracks, 'card');
    const ts = tr.keys.map((k) => k.t);
    expect(new Set(ts).size).toBe(ts.length);
  });
});

describe('presence — exit back-timing lands on hide', () => {
  it('the exit ends exactly at hide (default exit)', () => {
    const { tracks, end, hiddenAt } = presence('card', { show: 1, hide: 5 });
    const tr = opacityTrack(tracks, 'card');
    const last = tr.keys[tr.keys.length - 1]!;
    expect(last.t).toBe(5);
    expect(last.value).toBe(0);
    expect(end).toBe(5);
    expect(hiddenAt).toBe(5);
  });

  it('back-times a custom-duration exit so it still lands on hide', () => {
    const slowExit = clip({ channels: { opacity: { path: 'opacity', keys: [key(0, 1), key(1.2, 0)] } } });
    const { tracks } = presence('card', { show: 0, hide: 5, exit: slowExit });
    const tr = opacityTrack(tracks, 'card');
    // exitStart = 5 - 1.2 = 3.8
    const fall = tr.keys.filter((k) => k.t >= 3.8);
    expect(fall.map((k) => k.t)).toEqual([3.8, 5]);
  });

  it('back-times with a speed multiplier (exitDur = duration/speed)', () => {
    const slowExit = clip({ channels: { opacity: { path: 'opacity', keys: [key(0, 1), key(1, 0)] } } });
    const { tracks } = presence('card', { show: 0, hide: 5, exit: slowExit, exitOpts: { speed: 2 } });
    const tr = opacityTrack(tracks, 'card');
    // exitDur = 1/2 = 0.5 → exitStart = 4.5
    const fall = tr.keys.filter((k) => k.t >= 4.5);
    expect(fall.map((k) => k.t)).toEqual([4.5, 5]);
  });

  it('throws PresenceError when the exit cannot fit before hide', () => {
    const slowExit = clip({ channels: { opacity: { path: 'opacity', keys: [key(0, 1), key(2, 0)] } } });
    // hide - exitDur = 5 - 2 = 3 < show (4) → overlap
    expect(() => presence('card', { show: 4, hide: 5, exit: slowExit })).toThrow(PresenceError);
  });
});

describe('presence — window guard sampling', () => {
  it('holds opacity 0 outside [show,hide] and 1 mid-window', () => {
    const { tracks } = presence('card', { show: 1, hide: 5 });
    const tr = opacityTrack(tracks, 'card');
    expect(sampleTrack(tr, 0.5)).toBe(0); // pre-show: culled
    expect(sampleTrack(tr, 1)).toBe(0); // at show: start of fade
    expect(sampleTrack(tr, 3)).toBe(1); // mid live-window: fully visible
    expect(sampleTrack(tr, 6)).toBe(0); // post-hide: culled
  });
});

describe('presence — returned anchors', () => {
  it('returns shownAt/hiddenAt/end and a sibling anchored to hiddenAt lines up', () => {
    const { shownAt, hiddenAt, end } = presence('card', { show: 1.5, hide: 4.2 });
    expect(shownAt).toBe(1.5);
    expect(hiddenAt).toBe(4.2);
    expect(end).toBe(4.2);
    // a sibling enters exactly when the card exits
    const sibling = presence('next', { show: hiddenAt, hide: hiddenAt + 2 });
    expect(sibling.shownAt).toBe(4.2);
  });
});

describe('presence — synthesis & pass-through', () => {
  it('synthesizes the 0→1 rise when the enter clip has no opacity channel', () => {
    // scale-only entrance: opacity must still rise so the node un-culls
    const scaleEnter = clip({ channels: { scale: { path: 'scale', keys: [key(0, 0.8), key(0.4, 1)] } } });
    const { tracks } = presence('card', { show: 1, hide: 5, enter: scaleEnter });
    const tr = opacityTrack(tracks, 'card');
    expect(sampleTrack(tr, 1)).toBe(0); // start of synthesized rise
    expect(sampleTrack(tr, 1.4)).toBe(1); // enterEnd: fully risen
    expect(sampleTrack(tr, 1.2)).toBeCloseTo(0.5, 5); // mid-rise
    // the scale channel passes through untouched
    const scale = tracks.find((t) => t.target === 'card/scale');
    expect(scale).toBeDefined();
    expect(scale!.keys.map((k) => k.t)).toEqual([1, 1.4]);
  });

  it('passes non-opacity enter channels (scale) through alongside the opacity guard', () => {
    const popish = clip({
      channels: {
        opacity: { path: 'opacity', keys: [key(0, 0), key(0.3, 1)] },
        scale: { path: 'scale', keys: [key(0, 0.8), key(0.3, 1)] },
      },
    });
    const { tracks } = presence('card', { show: 0, hide: 4, enter: popish });
    expect(tracks.map((t) => t.target).sort()).toEqual(['card/opacity', 'card/scale']);
  });
});

describe('presence — target rejection', () => {
  it('throws on a structural (~) id', () => {
    expect(() => presence('~Rect.0', { show: 0, hide: 2 })).toThrow();
  });
});
