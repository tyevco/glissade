/**
 * @glissade/react — thin adapters (DESIGN.md §4.3 tier 3): vanilla core,
 * React as a consumer. Signals bridge via useSyncExternalStore — subscribe
 * fires on invalidation, peek() returns the cached (equality-stable) value.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { type ReadonlySignal, type Signal } from '@glissade/core';
import { type Player } from '@glissade/player';

/** Subscribe a component to a signal; re-renders only when the value actually changes. */
export function useSignalValue<T>(sig: ReadonlySignal<T>): T {
  const subscribe = useCallback((cb: () => void) => sig.subscribe(cb), [sig]);
  const get = useCallback(() => sig.peek(), [sig]);
  return useSyncExternalStore(subscribe, get, get);
}

/** DESIGN §4 sketch name — alias of {@link useSignalValue} (`useSignal(node.width)`). */
export const useSignal = useSignalValue;

/** The player's current time, live. */
export function usePlayhead(player: Player): number {
  return useSignalValue(player.playhead);
}

/** Playing state, derived from playhead motion + player state polling on invalidation. */
export function usePlayerState(player: Player): { playing: boolean; time: number; duration: number } {
  const time = usePlayhead(player);
  return { playing: player.playing, time, duration: player.duration };
}

/**
 * Machine hooks (v2 §C.6): the machine's active state and inputs are signals,
 * so the §4.3 contract already covers them. Typed structurally — react never
 * imports @glissade/interact; any object with this shape works.
 */
export function useMachineState(machine: { current: ReadonlySignal<string> }): string {
  return useSignalValue(machine.current);
}

/** A machine input as React state: [value, set]. */
export function useInput<T extends boolean | number>(
  machine: { input(name: string): Signal<T> },
  name: string,
): [T, (value: T) => void] {
  const sig = machine.input(name); // stable: machines return the same signal per name
  const value = useSignalValue(sig);
  const set = useCallback((v: T) => sig.set(v), [sig]);
  return [value, set];
}

/** The declarative <ScenePlayer> over mount() (DESIGN §4.3, the <gs-player> twin). */
export { ScenePlayer, type ScenePlayerProps } from './ScenePlayer.js';
