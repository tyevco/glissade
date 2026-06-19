/**
 * M1 vertical proof (DESIGN.md §7.5): an embedded scene that plays, pauses,
 * and seeks to arbitrary t with results identical to play-through — verified
 * live by comparing DisplayLists from a random-order evaluation against a
 * fresh scene.
 */

import { key, timeline, track, random, type Vec2 } from '@glissade/core';
import { Circle, Rect, Text, createScene, evaluate } from '@glissade/scene';
import { mount } from '@glissade/player';

declare global {
  interface Window {
    /** Set once the demo has mounted + run its in-page verifier (PLAYER=1 e2e). */
    __demoReady?: boolean;
    /**
     * Re-run the seek ≡ play-through check (M1 §7.5) for `samples` random times
     * and return the mismatch count — the browser-side M1 exit criterion.
     */
    __seekEqualsPlaythrough(samples: number): { mismatches: number; total: number };
    /** Sampled circle.position.x at time t via a fresh-scene evaluate(). */
    __stateAt(t: number): number;
    __duration(): number;
  }
}

const makeScene = () =>
  createScene({
    size: { w: 800, h: 450 },
    children: [
      new Rect({ id: 'bg', width: 800, height: 450, position: [400, 225], fill: '#1d1f24' }),
      new Circle({ id: 'circle', radius: 50, fill: '#e6a700', opacity: 0, position: [200, 225] }),
      new Text({
        id: 'label',
        text: 'glissade',
        fill: '#e8e8ea',
        fontSize: 28,
        position: [60, 420],
        opacity: 0.85,
      }),
    ],
  });

// The §2.6 demo: fade in (1s) → move right while scaling (1s, parallel) → fade out (0.5s)
const doc = timeline({
  tracks: [
    track('circle/opacity', 'number', [
      key(0, 0),
      key(1, 1, 'easeInOutCubic'),
      key(2, 1, { interp: 'hold' }),
      key(2.5, 0, 'easeOutQuad'),
    ]),
    track('circle/position.x', 'number', [key(1, 200), key(2, 600, 'easeInOutCubic')]),
    track('circle/scale', 'vec2', [key<Vec2>(1, [1, 1]), key<Vec2>(2, [2, 2], 'easeInOutCubic')]),
  ],
  labels: { settled: 2 },
});

const scene = makeScene();
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const { player } = mount(scene, doc, canvas);

// --- controls ---
const playpause = document.querySelector<HTMLButtonElement>('#playpause')!;
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
const loop = document.querySelector<HTMLInputElement>('#loop')!;
const time = document.querySelector<HTMLSpanElement>('#time')!;

let scrubbing = false;

playpause.addEventListener('click', () => {
  if (player.playing) {
    player.pause();
  } else {
    void player.play().finished.then(() => syncButton());
  }
  syncButton();
});

function syncButton() {
  playpause.textContent = player.playing ? 'Pause' : 'Play';
}

scrub.addEventListener('input', () => {
  scrubbing = true;
  player.pause();
  syncButton();
  player.seek(parseFloat(scrub.value) * player.duration);
  scrubbing = false;
});

loop.addEventListener('change', () => {
  // loop mode is a play-time option in M1: restart playback with it
  const wasPlaying = player.playing;
  player.pause();
  // remount-free loop toggle arrives with the <gs-player> element; M1 keeps it simple
  if (wasPlaying || loop.checked) void player.play().finished.then(() => syncButton());
  syncButton();
});

scene.playhead.subscribe(() => {
  requestAnimationFrame(() => {
    time.textContent = `${scene.playhead.peek().toFixed(3)}s`;
    if (!scrubbing) scrub.value = String(scene.playhead.peek() / player.duration);
  });
});

// --- exit-criteria verification: seek ≡ play-through (§7.5 M1) ---
// Factored so the in-browser PLAYER=1 e2e drives the SAME check it displays.
function seekEqualsPlaythrough(samples: number): { mismatches: number; total: number } {
  const rng = random(1234);
  const times = Array.from({ length: samples }, () => rng() * player.duration);
  const sceneRandom = makeScene();
  const sceneOrdered = makeScene();
  const ordered = [...times].sort((a, b) => a - b);
  const byT = new Map<number, string>();
  for (const t of ordered) byT.set(t, JSON.stringify(evaluate(sceneOrdered, doc, t)));
  let mismatches = 0;
  for (const t of times) {
    if (JSON.stringify(evaluate(sceneRandom, doc, t)) !== byT.get(t)) mismatches++;
  }
  return { mismatches, total: samples };
}

const verify = document.querySelector<HTMLDivElement>('#verify')!;
{
  const N = 200;
  const { mismatches } = seekEqualsPlaythrough(N);
  verify.textContent =
    mismatches === 0
      ? `✓ verified: ${N} random-order seeks produce DisplayLists identical to ordered play-through`
      : `✗ ${mismatches}/${N} mismatches — purity contract violated`;
  if (mismatches > 0) verify.style.color = '#ff6b6b';
}

// window hooks for the PLAYER=1 browser suite (state, never pixels)
window.__seekEqualsPlaythrough = seekEqualsPlaythrough;
window.__stateAt = (t) => {
  // a fresh scene evaluated at t: evaluate() writes the playhead + pulls the
  // bound props, so the node's position.x reflects exactly the frame at t.
  const s = makeScene();
  evaluate(s, doc, t);
  return s.nodes.get('circle')!.position.x();
};
window.__duration = () => player.duration;
window.__demoReady = true;
