/**
 * mount() — the vanilla embedding primitive (DESIGN.md §4.3): wire a scene +
 * timeline + canvas into a rendering Player. Rendering is pulled: a playhead
 * invalidation schedules one rAF-coalesced render.
 */

import { compileTimeline, type Timeline } from '@glissade/core';
import { evaluate, type Scene } from '@glissade/scene';
import { Canvas2DBackend } from '@glissade/backend-canvas2d';
import { createPlayer, type Player, type PlayerOptions } from './player.js';

export interface Mounted {
  player: Player;
  backend: Canvas2DBackend;
  /** Force a synchronous render of the current playhead time. */
  render(): void;
  dispose(): void;
}

export function mount(
  scene: Scene,
  doc: Timeline,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: PlayerOptions = {},
): Mounted {
  const compiled = compileTimeline(doc);
  const backend = new Canvas2DBackend(canvas);
  const player = createPlayer(
    { playhead: scene.playhead, duration: compiled.duration, markers: compiled.markers },
    opts,
  );

  const renderNow = () => backend.render(evaluate(scene, doc, scene.playhead.peek()));

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      renderNow();
    });
  };
  const unsubscribe = scene.playhead.subscribe(schedule);

  renderNow(); // first paint at the current playhead
  if (opts.autoplay) player.play();

  return {
    player,
    backend,
    render: renderNow,
    dispose() {
      unsubscribe();
      player.dispose();
      backend.dispose();
    },
  };
}
