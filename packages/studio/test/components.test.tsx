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
