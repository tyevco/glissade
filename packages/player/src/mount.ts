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
  scene.setTextMeasurer(backend); // §3.2: break lines with the drawing rasterizer
  const player = createPlayer(
    {
      playhead: scene.playhead,
      duration: compiled.duration,
      markers: compiled.markers,
      targets: compiled.tracks.keys(), // v2 §A.1: attach() validates machine disjointness against these
    },
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

  // explicit fonts (§3.6): register declared font assets; realtime embeds
  // paint immediately and re-render when each face arrives (the export
  // paths await instead — frame-exactness lives there)
  if (typeof FontFace !== 'undefined') {
    for (const [family, ref] of Object.entries(doc.assets ?? {})) {
      if (ref.kind !== 'font') continue;
      const face = new FontFace(family, `url(${ref.url})`);
      (document.fonts as unknown as { add(f: FontFace): void }).add(face);
      void face.load().then(() => renderNow(), () => undefined);
    }
  }

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
