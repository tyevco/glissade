/**
 * Showcase gallery: spinners, loaders, mock GUI screens, transitions, and
 * micro-interactions — every scene is plain glissade (nodes + a timeline
 * document), looping in the embed player.
 */

import { type SceneModule } from '@glissade/scene';
import { mount, type Mounted } from '@glissade/player';
import spinners from './scenes/showcase/spinners.js';
import loaders from './scenes/showcase/loaders.js';
import dashboard from './scenes/showcase/dashboard.js';
import transitions from './scenes/showcase/transitions.js';
import micro from './scenes/showcase/micro.js';

const gallery: Record<string, { mod: SceneModule; blurb: string }> = {
  spinners: { mod: spinners, blurb: 'Six loading spinners from nothing but circles, rects, and a timeline — orbits are just a parent group rotating.' },
  loaders: { mod: loaders, blurb: 'A determinate progress bar with a counting label, and a skeleton screen with a sweeping shimmer that resolves into content.' },
  dashboard: { mod: dashboard, blurb: 'A mock app shell animating in: springing sidebar, staggered stat cards with counting numbers, growing chart bars.' },
  transitions: { mod: transitions, blurb: 'Screen-to-screen patterns between two mock screens: slide, wipe, and fade-through-black.' },
  micro: { mod: micro, blurb: 'Micro-interactions: toggle, checkbox, button ripple, and a toast — the spring-and-stagger vocabulary of UI motion.' },
};

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const picker = document.querySelector<HTMLElement>('#picker')!;
const playpause = document.querySelector<HTMLButtonElement>('#playpause')!;
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
const timeEl = document.querySelector<HTMLSpanElement>('#time')!;
const blurb = document.querySelector<HTMLParagraphElement>('#blurb')!;

let current: Mounted | null = null;
let unsubscribe: (() => void) | null = null;
let scrubbing = false;

function show(name: string): void {
  unsubscribe?.();
  current?.dispose();
  const entry = gallery[name]!;
  const scene = entry.mod.createScene();
  current = mount(scene, entry.mod.timeline, canvas, { loop: true });
  void current.player.play();
  blurb.textContent = entry.blurb;
  playpause.textContent = 'Pause';
  for (const b of Array.from(picker.querySelectorAll('button'))) {
    b.classList.toggle('active', b.dataset['scene'] === name);
  }
  const player = current.player;
  unsubscribe = scene.playhead.subscribe(() => {
    requestAnimationFrame(() => {
      const t = scene.playhead.peek();
      timeEl.textContent = `${t.toFixed(2)}s / ${player.duration.toFixed(2)}s`;
      if (!scrubbing) scrub.value = String(t / player.duration);
    });
  });
  location.hash = name;
}

for (const name of Object.keys(gallery)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.dataset['scene'] = name;
  b.addEventListener('click', () => show(name));
  picker.append(b);
}

playpause.addEventListener('click', () => {
  const player = current?.player;
  if (!player) return;
  if (player.playing) {
    player.pause();
    playpause.textContent = 'Play';
  } else {
    void player.play();
    playpause.textContent = 'Pause';
  }
});

scrub.addEventListener('input', () => {
  const player = current?.player;
  if (!player) return;
  scrubbing = true;
  player.pause();
  playpause.textContent = 'Play';
  player.seek(parseFloat(scrub.value) * player.duration);
  scrubbing = false;
});

const initial = location.hash.slice(1);
show(initial in gallery ? initial : 'spinners');
