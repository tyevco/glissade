/**
 * mount() — the vanilla embedding primitive (DESIGN.md §4.3): wire a scene +
 * timeline + canvas into a rendering Player. Rendering is pulled: a playhead
 * invalidation schedules one rAF-coalesced render.
 */

import { compileTimeline, type Timeline } from '@glissade/core';
import { evaluate, type Scene } from '@glissade/scene';
import { Canvas2DBackend } from '@glissade/backend-canvas2d';
import { createPlayer, type Player, type PlayerOptions } from './player.js';
import { planReducedMotion, mediaPrefersReducedMotion } from './reducedMotion.js';

export interface Mounted {
  player: Player;
  backend: Canvas2DBackend;
  /** Force a synchronous render of the current playhead time. */
  render(): void;
  /**
   * Hot-swap the bound scene and/or timeline (HMR, §4.3) while preserving the
   * playhead: recompiles, rebinds the player (duration/markers/targets), and
   * re-renders at the current time. A scene node a track targeted but the new
   * scene no longer has simply stops being written (stale binding) — it keeps
   * its last value rather than erroring.
   */
  swap(next: { scene?: Scene; timeline: Timeline }): void;
  dispose(): void;
}

export function mount(
  initialScene: Scene,
  initialDoc: Timeline,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: PlayerOptions = {},
): Mounted {
  // scene/doc are mutable so swap() can rebind them; the playhead captured here
  // is the single source of truth across swaps (we always evaluate at its time,
  // never a swapped scene's own playhead)
  let scene = initialScene;
  let doc = initialDoc;
  const compiled = compileTimeline(doc);
  const backend = new Canvas2DBackend(canvas);
  scene.setTextMeasurer(backend); // §3.2: break lines with the drawing rasterizer
  const playhead = scene.playhead;
  const player = createPlayer(
    {
      playhead,
      duration: compiled.duration,
      markers: compiled.markers,
      targets: compiled.tracks.keys(), // v2 §A.1: attach() validates machine disjointness against these
    },
    opts,
  );

  const renderNow = () => backend.render(evaluate(scene, doc, playhead.peek()));

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      renderNow();
    });
  };
  const unsubscribe = playhead.subscribe(schedule);

  // explicit fonts (§3.6): register a timeline's declared font faces once.
  const loadFonts = (forDoc: Timeline) => {
    if (typeof FontFace === 'undefined') return;
    for (const [family, ref] of Object.entries(forDoc.assets ?? {})) {
      if (ref.kind !== 'font') continue;
      const face = new FontFace(family, `url(${ref.url})`);
      (document.fonts as unknown as { add(f: FontFace): void }).add(face);
      void face.load().then(() => renderNow(), () => undefined);
    }
  };

  // realtime embeds paint immediately and re-render when each face arrives (the
  // export paths await instead — frame-exactness lives there)
  loadFonts(doc);

  // prefers-reduced-motion (§4.2): hold the poster, suppress autoplay, or swap
  // in a calmer alternative timeline — decided before first paint.
  const prefersReduced = (opts.prefersReducedMotion ?? mediaPrefersReducedMotion)();
  const plan = planReducedMotion(opts.reducedMotion, prefersReduced, doc, compiled.duration, !!opts.autoplay);
  if (plan.swapTo) {
    doc = plan.swapTo;
    const recompiled = compileTimeline(doc);
    player.swap({ duration: recompiled.duration, markers: recompiled.markers, targets: recompiled.tracks.keys() });
    loadFonts(doc);
  }
  if (plan.seekTo !== undefined) player.seek(plan.seekTo);

  renderNow(); // first paint at the (possibly poster) playhead
  if (plan.autoplay) player.play();

  return {
    player,
    backend,
    render: renderNow,
    swap(next) {
      if (next.scene) {
        scene = next.scene;
        scene.setTextMeasurer(backend);
      }
      doc = next.timeline;
      const recompiled = compileTimeline(doc);
      player.swap({
        duration: recompiled.duration,
        markers: recompiled.markers,
        targets: recompiled.tracks.keys(),
      });
      loadFonts(doc); // pick up any newly declared faces
      renderNow(); // repaint at the preserved playhead
    },
    dispose() {
      unsubscribe();
      player.dispose();
      backend.dispose();
    },
  };
}
