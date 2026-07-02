/**
 * Showcase gallery: spinners, loaders, mock GUI screens, transitions,
 * micro-interactions, filters, path morphs, and narration-anchored captions —
 * every scene is plain glissade (nodes + a timeline document), looping in the
 * embed player.
 */

import { type SceneModule } from '@glissade/scene';
import { mount, type Mounted } from '@glissade/player';
import spinners from './scenes/showcase/spinners.js';
import loaders from './scenes/showcase/loaders.js';
import dashboard from './scenes/showcase/dashboard.js';
import transitions from './scenes/showcase/transitions.js';
import micro from './scenes/showcase/micro.js';
import typography from './scenes/golden-typography.js';
import layoutScene from './scenes/golden-layout.js';
import flexboard from './scenes/showcase/flexboard.js';
import interactive from './scenes/showcase/interactive.js';
import filters from './scenes/golden-filters.js';
import paths from './scenes/golden-paths.js';
import captions from './scenes/golden-captions.js';
import marker from './scenes/golden-marker.js';
import orient from './scenes/golden-orient.js';
import echoTrail from './scenes/golden-echo.js';
import motionblur from './scenes/golden-motionblur.js';
import chart from './scenes/golden-chart.js';
import compositing from './scenes/golden-compositing.js';
import boxtext from './scenes/golden-boxtext.js';
import component from './scenes/golden-component.js';
import { createMachine, type MachineSpec } from '@glissade/interact';
import { loadYogaLayoutEngine } from '@glissade/scene/layout';

await loadYogaLayoutEngine();

// the same face the golden corpus rasterizes — typography and captions match CI
try {
  const face = new FontFace(
    'DejaVu Sans',
    `url(${new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url).href})`,
  );
  // FontFaceSet.add is missing from this TS DOM lib; the runtime API is fine
  (document.fonts as unknown as { add(f: FontFace): void }).add(await face.load());
} catch {
  /* fallback face; scenes still run */
}

const gallery: Record<string, { mod: SceneModule; blurb: string }> = {
  spinners: { mod: spinners, blurb: 'Six loading spinners from nothing but circles, rects, and a timeline — orbits are just a parent group rotating.' },
  loaders: { mod: loaders, blurb: 'A determinate progress bar with a counting label, and a skeleton screen with a sweeping shimmer that resolves into content.' },
  dashboard: { mod: dashboard, blurb: 'A mock app shell animating in: springing sidebar, staggered stat cards with counting numbers, growing chart bars.' },
  transitions: { mod: transitions, blurb: 'Screen-to-screen patterns between two mock screens: slide, wipe, and fade-through-black.' },
  micro: { mod: micro, blurb: 'Micro-interactions: toggle, checkbox, button ripple, and a toast — the spring-and-stagger vocabulary of UI motion.' },
  typography: { mod: typography, blurb: 'Explicit fonts + our line breaker: the wrap width is an animated track, re-breaking live as it tweens — and these exact glyphs are byte-compared in CI.' },
  layout: { mod: layoutScene, blurb: 'Yoga flexbox behind the LayoutEngine seam: gap and tile size are animated tracks, and the same wasm computes these boxes headlessly — byte-compared in CI.' },
  flexboard: { mod: flexboard, blurb: 'A settings panel built entirely from nested Layouts: toggles are tiny flex containers, the description reflows as its wrap width tweens, and a growing row pushes its siblings.' },
  interactive: { mod: interactive, blurb: 'REAL toggles: click them — mid-flight clicks reverse the knob with its velocity intact (machine handoffs). The third toggle and the glow stay on the scrubbable ambient timeline; the button is two one-liner presets.' },
  filters: { mod: filters, blurb: 'Group filters as signals: blur, drop-shadow, brightness, contrast, saturate — each param is a tweening track. The bottom row is the unfiltered control. Composites clip to content bounds, so these stay cheap even on software-rendered browsers.' },
  paths: { mod: paths, blurb: 'Path morphing: contours are a value type, so shapes tween point-by-point like any number — with fill-rule-aware hit testing on the result.' },
  marker: { mod: marker, blurb: 'Anchors: bars grow FROM their pinned edge with plain width/height tracks, a needle rotates around its anchored end, and a marker highlight sweeps wrapped text via one progress track — line boxes come from the text itself.' },
  orient: { mod: orient, blurb: 'Orientation drivers: a rocket laps a track with its POSITION owned by followPath and its ROTATION by a separate orientToPath (banking to the tangent), while a center turret uses lookAt to always face the orbiting rocket — pure, tree-shakeable motion helpers.' },
  echo: { mod: echoTrail, blurb: 'Echo motion trails: a dot orbits leaving six fading ghost copies at earlier playhead offsets — Echo re-addresses the scene playhead per copy and restores it, so the whole comet trail is a PURE function of the current time (byte-compared on Skia in CI).' },
  motionblur: { mod: motionblur, blurb: 'Sampled motion blur: a fast dot is rendered at 16 sub-frame times across the shutter and AVERAGED (running-mean), so it smears like a real analog shutter while the crisp reference dot stays sharp — a pure multi-time re-eval, byte-exact on Skia.' },
  chart: { mod: chart, blurb: 'The data-motion stack: Chart() binds a table → bar chart as a pure build-time fan-out (like Grid), each bar a Rect pinned to the axis and grown from its base. The bars rise in staggered, then RACE to a second dataset — all from ordinary per-bar height tracks, colours from a value ramp. Byte-compared on Skia in CI.' },
  compositing: { mod: compositing, blurb: 'The compositing pair: a Group clipped to a rounded card (tiles slide through, pixels bitten at the edge), an alpha-matte IRIS revealing art through an animated circle, and a LUMA wipe — brightness becomes alpha via one deterministic CPU kernel, byte-exact on Skia.' },
  boxtext: { mod: boxtext, blurb: 'Text box-valign: the top row is baseline-anchored (labels ride high/low in their pills — the fontSize*0.35 bug), the bottom row uses box:{valign:\'center\'} so each label\'s real ink centers in its pill — single-line, descenders, and multi-line alike. Byte-compared on Skia.' },
  component: { mod: component, blurb: 'defineComponent: a reusable typed LowerThird (accent bar + clipped name/title) defined ONCE and instanced three times — each instance namespaces its children under its own id, so the three stagger in independently from one definition. describe().components lists its prop surface. Byte-compared on Skia.' },
  captions: { mod: captions, blurb: 'Narration-anchored captions: each beat fires at its narration segment\'s start, captions are a plain string track, and the .srt/.vtt sidecars match by construction. The voice mixes in at gs render; this embed shows the sync.' },
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
let machineTeardowns: Array<() => void> = [];

function show(name: string): void {
  unsubscribe?.();
  for (const td of machineTeardowns) td();
  machineTeardowns = [];
  current?.dispose();
  const entry = gallery[name]!;
  const scene = entry.mod.createScene();
  current = mount(scene, entry.mod.timeline, canvas, { loop: true });
  void current.player.play();
  // v2: mount the module's machines — attach to the host clock, repaint on
  // machine steps, run the module's own listener wiring (§A.5/§C.3)
  const mounted = current;
  for (const spec of (entry.mod as { machines?: MachineSpec[] }).machines ?? []) {
    const machine = createMachine(spec.doc, {
      resolve: scene.resolveTarget,
      ...(spec.timelines ? { timelines: spec.timelines } : {}),
    });
    mounted.player.attach(machine);
    const unsub = machine.clock.subscribe(() => mounted.render());
    const undo = spec.wire?.({ scene, machine, element: canvas });
    machineTeardowns.push(() => {
      undo?.();
      unsub();
      machine.dispose();
    });
  }
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

// back/forward + hand-edited hashes switch scenes without a reload
window.addEventListener('hashchange', () => {
  const name = location.hash.slice(1);
  if (name in gallery && !picker.querySelector(`button[data-scene="${name}"]`)?.classList.contains('active')) {
    show(name);
  }
});
