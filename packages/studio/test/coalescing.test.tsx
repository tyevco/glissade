// @vitest-environment jsdom
/**
 * Assertion 2 — one React commit per seek (§6.1 coalescing claim).
 *
 * DOC/IMPL GAP (flagged per the card): §6.1 describes a "per-ticker-tick
 * coalescer (Theatre's dataverse Ticker)" that collapses a 200-signal scrub
 * frame into one React commit. That ticker does NOT exist in the code — there is
 * no Ticker in core or @glissade/react. The observable one-commit-per-seek
 * behavior is delivered by REACT'S automatic batching of the synchronous signal
 * write inside act(): every useSyncExternalStore subscriber that fires during one
 * batched update lands in a single commit. This test asserts that OBSERVABLE
 * invariant. It intentionally does NOT add a ticker (out of scope).
 */

import { describe, expect, it, afterEach } from 'vitest';
import { Profiler } from 'react';
import { act, render, cleanup } from '@testing-library/react';
import { useSignalValue } from '@glissade/react';
import { makeFakePlayer } from './helpers.js';

afterEach(cleanup);

function Subscriber({ player }: { player: ReturnType<typeof makeFakePlayer> }) {
  // every instance subscribes to the SAME playhead signal — a scrub dirties them all
  const t = useSignalValue(player.playhead);
  return <span>{t.toFixed(3)}</span>;
}

describe('signals → React coalescing', () => {
  it('one player.seek(t) produces exactly one chrome commit across N subscribers', () => {
    const player = makeFakePlayer();
    let commits = 0;
    const N = 50;

    render(
      <Profiler id="chrome" onRender={() => commits++}>
        {Array.from({ length: N }, (_, i) => (
          <Subscriber key={i} player={player} />
        ))}
      </Profiler>,
    );

    const initialCommits = commits; // the mount commit(s)
    act(() => {
      player.seek(1.25); // a single synchronous playhead write — dirties all N subscribers
    });

    // React auto-batches the N subscriber updates into a single commit (NOT a
    // §6.1 ticker — see the doc-gap note above).
    expect(commits - initialCommits).toBe(1);
  });
});
