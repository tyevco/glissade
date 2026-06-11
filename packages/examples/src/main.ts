/**
 * M1 vertical proof (DESIGN.md §7.5): an embedded scene that plays, pauses,
 * and seeks to arbitrary t with results identical to play-through — verified
 * live by comparing DisplayLists from a random-order evaluation against a
 * fresh scene.
 */

import { key, timeline, track, random, type Vec2 } from '@glissade/core';
import { Circle, Rect, Text, createScene, evaluate } from '@glissade/scene';
import { mount } from '@glissade/player';

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
const verify = document.querySelector<HTMLDivElement>('#verify')!;
{
  const rng = random(1234);
  const N = 200;
  const times = Array.from({ length: N }, () => rng() * 2.5);
  const sceneRandom = makeScene();
  const sceneOrdered = makeScene();
  const ordered = [...times].sort((a, b) => a - b);
  const byT = new Map<number, string>();
  for (const t of ordered) byT.set(t, JSON.stringify(evaluate(sceneOrdered, doc, t)));
  let mismatches = 0;
  for (const t of times) {
    if (JSON.stringify(evaluate(sceneRandom, doc, t)) !== byT.get(t)) mismatches++;
  }
  verify.textContent =
    mismatches === 0
      ? `✓ verified: ${N} random-order seeks produce DisplayLists identical to ordered play-through`
      : `✗ ${mismatches}/${N} mismatches — purity contract violated`;
  if (mismatches > 0) verify.style.color = '#ff6b6b';
}
