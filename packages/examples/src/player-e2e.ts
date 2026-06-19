/**
 * Chromium e2e harness (M1 §7.5): mounts a scene through the real player and
 * exposes the window hooks the PLAYER=1 Playwright spec drives — playhead time,
 * playing state, a sampled scene prop, and imperative play/pause/seek. The
 * canvas renders the live Canvas2D path; the test reads STATE (never pixels),
 * so every assertion is a `page.waitForFunction` against these hooks — no sleeps.
 */

import { key, timeline, track, type Vec2 } from '@glissade/core';
import { Circle, Rect, createScene, type Scene } from '@glissade/scene';
import { mount, type Mounted } from '@glissade/player';

declare global {
  interface Window {
    __playerReady?: boolean;
    /** Current playhead time in seconds. */
    __time(): number;
    /** Whether linear playback is running. */
    __playing(): boolean;
    /** Sampled circle.position.x at the current playhead — the rendered state. */
    __circleX(): number;
    __play(): void;
    __pause(): void;
    __seek(t: number): void;
    __duration(): number;
  }
}

const makeScene = (): Scene =>
  createScene({
    size: { w: 320, h: 180 },
    children: [
      new Rect({ id: 'bg', width: 320, height: 180, position: [160, 90], fill: '#1d1f24' }),
      new Circle({ id: 'circle', radius: 24, fill: '#e6a700', position: [40, 90] }),
    ],
  });

// move right over 1s, scale over the next 1s — a 2s timeline (no loop by default)
const doc = timeline({
  tracks: [
    track('circle/position.x', 'number', [key(0, 40), key(1, 280, 'easeInOutCubic')]),
    track('circle/scale', 'vec2', [key<Vec2>(1, [1, 1]), key<Vec2>(2, [2, 2], 'easeInOutCubic')]),
  ],
});

const scene = makeScene();
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const mounted: Mounted = mount(scene, doc, canvas);
const { player } = mounted;

// pull the bound prop fresh (the call form recomputes against the live
// playhead) so the sampled state always matches the current frame, never a
// stale cache. mount() evaluates on every playhead write, establishing the bind.
window.__time = () => scene.playhead.peek();
window.__playing = () => player.playing;
window.__circleX = () => scene.nodes.get('circle')!.position.x();
window.__play = () => void player.play();
window.__pause = () => player.pause();
window.__seek = (t) => player.seek(t);
window.__duration = () => player.duration;
window.__playerReady = true;
