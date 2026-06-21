import { describe, expect, it } from 'vitest';
import { key, track, sampleTrack, type Track } from '../src/index.js';
import {
  clip,
  presence,
  PresenceError,
  transitionToClip,
  type PresenceTransition,
} from '../src/clips.js';

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

  // FIX 3 (0.13 canary): a NO-PLATEAU window (exitStart == show) must throw —
  // a `<` test let it through, and the exit's value-1 key won the dedup at show,
  // destroying the enter fade and the pre-show cull.
  it('throws PresenceError on a degenerate window where exitStart == show', () => {
    // default fades are 0.3s → exitStart = hide - 0.3 = 1.0 == show
    expect(() => presence('card', { show: 1, hide: 1.3 })).toThrow(PresenceError);
  });

  it('still accepts a window with a strictly-positive plateau (exitStart > show)', () => {
    // hide - 0.3 = 1.001 > show (1) → a sliver of plateau is enough
    expect(() => presence('card', { show: 1, hide: 1.301 })).not.toThrow();
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

  // FIX 4 (0.13 canary): a custom enter whose FIRST opacity key value ≠ 0 must
  // NOT leak opacity across the pre-show cull. The pre-show segment must HOLD 0
  // until the enter's first key; the ramp begins AT show.
  it('holds 0 through the pre-show cull when the enter starts above 0', () => {
    const halfEnter = clip({
      channels: { opacity: { path: 'opacity', keys: [key(0, 0.5), key(0.4, 1)] } },
    });
    const { tracks } = presence('card', { show: 2, hide: 6, enter: halfEnter });
    const tr = opacityTrack(tracks, 'card');
    // mid-pre-show: would have LERPed 0→0.5 (=0.25 @ t=1) before the fix
    expect(sampleTrack(tr, 1)).toBe(0); // culled, not 0.25
    expect(sampleTrack(tr, 1.999)).toBe(0); // still culled just before show
    expect(sampleTrack(tr, 2)).toBe(0.5); // ramp begins at show (the enter's first value)
    expect(sampleTrack(tr, 2.4)).toBe(1); // enterEnd: fully risen
    expect(sampleTrack(tr, 4)).toBe(1); // plateau
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

describe('presence — overlapping enter+exit on a SAME non-opacity channel (0.18 pre.4)', () => {
  // THE BUG (in-house canary): a slide-in-hold-slide-out animates `position` in
  // BOTH the enter and the exit. Presence used to emit TWO `card/position` tracks
  // (enterRest + exitRest), so when they overlapped in t, compileTimeline's
  // coalesce() dropped the enter's settle key and dev-warned — the hold leg of the
  // slide silently vanished. The fix reconciles non-opacity channels per target
  // into ONE track, mirroring the opacity guard's stable-sort + later-wins dedup.
  it('fuses a slide-in / slide-out into ONE position track keeping both the enter settle and exit start', () => {
    // enter slides FROM below to origin over [1,1.4]; exit slides origin→below over
    // [exitStart, 5]. A long exit (1.0s) makes exitStart = 4.0 → [4,5] (no t-overlap),
    // but we still demand a SINGLE merged track with the enter settle + the exit start.
    const slideEnter = clip({
      channels: { offset: { path: 'position', keys: [key(0, [0, 16]), key(0.4, [0, 0])] } },
    });
    const slideExit = clip({
      channels: { offset: { path: 'position', keys: [key(0, [0, 0]), key(1.0, [0, 16])] } },
    });
    const { tracks } = presence('card', { show: 1, hide: 5, enter: slideEnter, exit: slideExit });
    const pos = tracks.filter((t) => t.target === 'card/position');
    // exactly ONE position track (not two same-target tracks)
    expect(pos.length).toBe(1);
    const ts = pos[0]!.keys.map((k) => k.t);
    // enter: [1, 1.4]; exit: exitStart = 5 - 1.0 = 4.0, lands at 5 → [4, 5]
    expect(ts).toEqual([1, 1.4, 4, 5]);
    // the enter's settle (origin @ 1.4) and the exit's start (origin @ 4.0) BOTH survive
    expect(pos[0]!.keys[1]!.value).toEqual([0, 0]); // enter settle preserved
    expect(pos[0]!.keys[2]!.value).toEqual([0, 0]); // exit start preserved
    expect(pos[0]!.keys[3]!.value).toEqual([0, 16]); // exit lands below
    // no duplicate coincident keys
    expect(new Set(ts).size).toBe(ts.length);
  });

  it('reconciles a t-OVERLAPPING enter settle / exit start at coincident t (exit wins, no dropped key)', () => {
    // enter settles at enterEnd = 1 + 0.4 = 1.4; craft an exit whose start lands at
    // EXACTLY 1.4 (exitStart = hide - exitDur). hide=2.4, exitDur=1.0 → exitStart=1.4.
    const slideEnter = clip({
      channels: { offset: { path: 'position', keys: [key(0, [0, 16]), key(0.4, [0, 0])] } },
    });
    const slideExit = clip({
      channels: { offset: { path: 'position', keys: [key(0, [0, 0]), key(1.0, [0, 30])] } },
    });
    const { tracks } = presence('card', { show: 1, hide: 2.4, enter: slideEnter, exit: slideExit });
    const pos = tracks.filter((t) => t.target === 'card/position');
    expect(pos.length).toBe(1);
    const ts = pos[0]!.keys.map((k) => k.t);
    // coincident enter-settle/exit-start at 1.4 collapse to one key (later-wins = exit)
    expect(ts).toEqual([1, 1.4, 2.4]);
    expect(new Set(ts).size).toBe(ts.length);
    // both endpoints are origin here; the survivor at 1.4 is the EXIT's start
    expect(pos[0]!.keys[1]!.value).toEqual([0, 0]);
    expect(pos[0]!.keys[2]!.value).toEqual([0, 30]);
  });

  it('default opacity-only presence is UNCHANGED (only the opacity track, bytes preserved)', () => {
    const { tracks } = presence('card', { show: 1, hide: 5 });
    expect(tracks.map((t) => t.target)).toEqual(['card/opacity']);
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
});

describe('presence — target rejection', () => {
  it('throws on a structural (~) id', () => {
    expect(() => presence('~Rect.0', { show: 0, hide: 2 })).toThrow();
  });
});

describe('presence — inline-literal sugar (0.18)', () => {
  // THE ACCEPTANCE CONTRACT: an inline enter/exit literal must produce Track[]
  // DEEP-EQUAL to the same presence() call written with hand-built clip() channels.
  it('inline enter/exit deep-equals the hand-built clip({channels}) version', () => {
    const inline = presence('card', {
      window: [1, 5],
      enter: { opacity: [0, 1], offset: 16, dur: 0.5, ease: 'easeOutCubic' },
      exit: { opacity: [1, 0], offset: 16, dur: 0.4 },
    });

    // The hand-authored equivalent: enter slides FROM below (edge 'bottom' = [0,+16])
    // TO [0,0]; exit slides FROM [0,0] TO below ([0,+16]). Ease only on the arriving
    // (last) key, mirroring the clipStdlib slideIn convention.
    const handEnter = clip({
      channels: {
        opacity: { path: 'opacity', keys: [key(0, 0), key(0.5, 1, 'easeOutCubic')] },
        offset: { path: 'position', keys: [key(0, [0, 16]), key(0.5, [0, 0], 'easeOutCubic')] },
      },
    });
    const handExit = clip({
      channels: {
        opacity: { path: 'opacity', keys: [key(0, 1), key(0.4, 0)] },
        offset: { path: 'position', keys: [key(0, [0, 0]), key(0.4, [0, 16])] },
      },
    });
    const hand = presence('card', { show: 1, hide: 5, enter: handEnter, exit: handExit });

    expect(inline.tracks).toEqual(hand.tracks);
    expect(inline.end).toBe(hand.end);
    expect(inline.shownAt).toBe(hand.shownAt);
    expect(inline.hiddenAt).toBe(hand.hiddenAt);
  });

  it('window:[t0,t1] is an alias for {show:t0, hide:t1}', () => {
    const aliased = presence('card', { window: [1.5, 4.2] });
    const explicit = presence('card', { show: 1.5, hide: 4.2 });
    expect(aliased.tracks).toEqual(explicit.tracks);
    expect(aliased.shownAt).toBe(1.5);
    expect(aliased.hiddenAt).toBe(4.2);
  });

  it('throws when neither show/hide nor window is given', () => {
    expect(() => presence('card', {})).toThrow(PresenceError);
  });

  // OMIT-OPACITY: a transition with only offset/scale emits NO opacity channel and
  // relies on presence()'s synthesized rise/fall (matching the Clip path exactly).
  it('an offset-only enter emits no opacity channel (synthesized fade takes over)', () => {
    const enter: PresenceTransition = { offset: 20, dur: 0.4 };
    const c = transitionToClip(enter, 'enter');
    // the compiled clip has ONLY a position channel — no opacity channel authored
    expect(Object.keys(c.spec.channels)).toEqual(['offset']);

    const { tracks } = presence('card', { show: 1, hide: 5, enter });
    const op = tracks.find((t) => t.target === 'card/opacity')!;
    // presence still synthesizes the 0→1 rise across the enter span so the node un-culls
    expect(sampleTrack(op, 1)).toBe(0);
    expect(sampleTrack(op, 1.4)).toBe(1);
    // the position channel passes through
    expect(tracks.find((t) => t.target === 'card/position')).toBeDefined();
  });

  it('a scale-only enter broadcasts a scalar pair to Vec2 (popIn convention)', () => {
    const enter: PresenceTransition = { scale: [0.8, 1], dur: 0.3 };
    const c = transitionToClip(enter, 'enter');
    expect(Object.keys(c.spec.channels)).toEqual(['scale']);
    const { tracks } = presence('card', { show: 0, hide: 4, enter });
    const scale = tracks.find((t) => t.target === 'card/scale')!;
    expect(scale.keys.map((k) => k.value)).toEqual([
      [0.8, 0.8],
      [1, 1],
    ]);
  });

  it('a default-edge scalar offset slides up from below (edge bottom)', () => {
    const c = transitionToClip({ offset: 16 }, 'enter');
    const ch = c.spec.channels.offset!;
    expect(ch.keys[0]!.value).toEqual([0, 16]); // displaced below
    expect(ch.keys[1]!.value).toEqual([0, 0]); // settles to origin
  });

  it('an exit slide is the inverse direction of an enter slide', () => {
    const enter = transitionToClip({ offset: 16, edge: 'left' }, 'enter');
    const exit = transitionToClip({ offset: 16, edge: 'left' }, 'exit');
    expect(enter.spec.channels.offset!.keys.map((k) => k.value)).toEqual([
      [-16, 0],
      [0, 0],
    ]);
    expect(exit.spec.channels.offset!.keys.map((k) => k.value)).toEqual([
      [0, 0],
      [-16, 0],
    ]);
  });

  it('explicit [Vec2,Vec2] offset endpoints are used verbatim (no direction flip)', () => {
    const c = transitionToClip({ offset: [[10, 20], [0, 0]] }, 'exit');
    expect(c.spec.channels.offset!.keys.map((k) => k.value)).toEqual([
      [10, 20],
      [0, 0],
    ]);
  });

  it('the inline literal culls the node outside [show,hide]', () => {
    const { tracks } = presence('card', {
      window: [1, 5],
      enter: { opacity: [0, 1], offset: 16, dur: 0.5 },
      exit: { opacity: [1, 0], offset: 16, dur: 0.4 },
    });
    const op = tracks.find((t) => t.target === 'card/opacity')!;
    expect(sampleTrack(op, 0.5)).toBe(0); // pre-show culled
    expect(sampleTrack(op, 3)).toBe(1); // live
    expect(sampleTrack(op, 6)).toBe(0); // post-hide culled
  });

  // GROUP-LEVEL targeting needs no code change — presence only suffixes /opacity
  // and /position; a Group id flows through identically.
  it('a Group target works with the inline literal', () => {
    const { tracks } = presence('cardGroup', {
      window: [1, 5],
      enter: { opacity: [0, 1], offset: 16, dur: 0.5 },
      exit: { opacity: [1, 0], offset: 16, dur: 0.4 },
    });
    expect(tracks.find((t) => t.target === 'cardGroup/opacity')).toBeDefined();
    expect(tracks.find((t) => t.target === 'cardGroup/position')).toBeDefined();
  });
});
