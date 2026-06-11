/**
 * @glissade/react — thin adapters (DESIGN.md §4.3 tier 3): vanilla core,
 * React as a consumer. Signals bridge via useSyncExternalStore — subscribe
 * fires on invalidation, peek() returns the cached (equality-stable) value.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { type ReadonlySignal } from '@glissade/core';
import { type Player } from '@glissade/player';

/** Subscribe a component to a signal; re-renders only when the value actually changes. */
export function useSignalValue<T>(sig: ReadonlySignal<T>): T {
  const subscribe = useCallback((cb: () => void) => sig.subscribe(cb), [sig]);
  const get = useCallback(() => sig.peek(), [sig]);
  return useSyncExternalStore(subscribe, get, get);
}

/** The player's current time, live. */
export function usePlayhead(player: Player): number {
  return useSignalValue(player.playhead);
}

/** Playing state, derived from playhead motion + player state polling on invalidation. */
export function usePlayerState(player: Player): { playing: boolean; time: number; duration: number } {
  const time = usePlayhead(player);
  return { playing: player.playing, time, duration: player.duration };
}
