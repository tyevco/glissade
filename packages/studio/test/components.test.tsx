// @vitest-environment jsdom
/**
 * Assertion 5 — TimelinePanel component tests (§6.1 timeline panel): one lane per
 * track with the right labels; one .key marker per grouped key (.spring/.derived
 * classed); marker ⚑ flags at their positions; and scrub — a pointerdown on the
 * ruler pauses and seeks the player to the mapped time.
 */

import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, createEvent } from '@testing-library/react';
import { compileTimeline, key, spring, timeline, track } from '@glissade/core';
import { TimelinePanel } from '../src/TimelinePanel.js';
import { makeFakePlayer } from './helpers.js';

afterEach(cleanup);

const cfg = { stiffness: 170, damping: 14, mass: 1 };
const springDur = spring.duration(cfg);

/** Two tracks: one with a plain + spring key, one with a single key; plus a label. */
const compiled = () =>
  compileTimeline(
    timeline({
      tracks: [
        track('box/opacity', 'number', [key(0, 0), key(springDur, 1, spring(cfg))]),
        track('box/rotation', 'number', [key(0, 0)]),
      ],
      labels: { beat: 1 },
    }),
  );

describe('TimelinePanel rows + keys + markers', () => {
  it('renders one lane per track with the track target as its label', () => {
    render(<TimelinePanel compiled={compiled()} player={makeFakePlayer()} />);
    expect(screen.getByText('box/opacity')).toBeTruthy();
    expect(screen.getByText('box/rotation')).toBeTruthy();
    // a row per track + the ruler row
    expect(document.querySelectorAll('.row')).toHaveLength(3);
  });

  it('renders a .key per grouped key, with .spring on the spring-eased key', () => {
    const { container } = render(<TimelinePanel compiled={compiled()} player={makeFakePlayer()} />);
    const keys = container.querySelectorAll('.key');
    // 2 keys on opacity + 1 on rotation
    expect(keys).toHaveLength(3);
    expect(container.querySelectorAll('.key.spring')).toHaveLength(1); // the spring key is classed
  });

  it('flags timeline markers with ⚑ at their position', () => {
    const withMarker = compileTimeline(
      timeline({
        tracks: [track('box/opacity', 'number', [key(0, 0), key(2, 1)])],
      }),
    );
    render(
      <TimelinePanel compiled={withMarker} player={makeFakePlayer()} markers={[{ t: 1, name: 'beat' }]} />,
    );
    const flag = screen.getByTitle(/beat @ 1/);
    expect(flag.textContent).toContain('⚑');
  });

  it('key drag drives the §6.3 scrub lifecycle: onEditKey per tick (first on the first), one onEndDrag on pointer-up', () => {
    const onEditKey = vi.fn();
    const onEndDrag = vi.fn();
    const single = compileTimeline(timeline({ tracks: [track('box/rotation', 'number', [key(0, 0), key(2, 1)])] }));
    const { container } = render(
      <TimelinePanel compiled={single} player={makeFakePlayer()} onEditKey={onEditKey} onEndDrag={onEndDrag} />,
    );
    const lane = container.querySelector('.row:last-child .lane')!;
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
      left: 0, width: 200, top: 0, height: 10, right: 200, bottom: 10, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const keyEl = lane.querySelector('.key')!; // the first key (t=0)

    const down = createEvent.pointerDown(keyEl, { pointerId: 1 });
    Object.defineProperty(down, 'clientX', { value: 0 });
    fireEvent(keyEl, down);

    // two drag ticks across the lane
    for (const x of [100, 150]) {
      const move = createEvent.pointerMove(lane, { pointerId: 1 });
      // jsdom drops clientX/buttons from the init dict — patch them on (§test infra)
      Object.defineProperty(move, 'clientX', { value: x });
      Object.defineProperty(move, 'buttons', { value: 1 });
      fireEvent(lane, move);
    }
    // first tick carries first=true (opens the capture buffer); the rest false
    expect(onEditKey.mock.calls.length).toBe(2);
    expect(onEditKey.mock.calls[0]![3]).toBe(true);
    expect(onEditKey.mock.calls[1]![3]).toBe(false);
    expect(onEndDrag).not.toHaveBeenCalled(); // not committed mid-drag

    fireEvent(lane, createEvent.pointerUp(lane, { pointerId: 1 }));
    expect(onEndDrag).toHaveBeenCalledTimes(1); // one commit for the whole gesture
  });

  it('scrub: pointerdown on the ruler pauses and seeks the player to the mapped time', () => {
    const player = makeFakePlayer();
    const { container } = render(<TimelinePanel compiled={compiled()} player={player} />);
    const rulerLane = container.querySelector('.ruler .lane')!;
    // map clientX → t: a 200px lane, click at x=100 (the midpoint) over duration springDur
    vi.spyOn(rulerLane, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      height: 10,
      right: 200,
      bottom: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const ruler = container.querySelector('.ruler')!;
    // jsdom's PointerEvent drops clientX from the init dict — patch it on (§test infra)
    const ev = createEvent.pointerDown(ruler, { pointerId: 1 });
    Object.defineProperty(ev, 'clientX', { value: 100 });
    fireEvent(ruler, ev);

    expect(player.pauseLog.length).toBe(1); // paused before seeking
    expect(player.seekCalls).toHaveLength(1);
    expect(player.seekCalls[0]).toBeCloseTo(springDur * 0.5, 6); // midpoint of the lane
  });
});
