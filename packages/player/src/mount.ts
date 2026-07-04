/**
 * mount() — the vanilla embedding primitive (DESIGN.md §4.3): wire a scene +
 * timeline + canvas into a rendering Player. Rendering is pulled: a playhead
 * invalidation schedules one rAF-coalesced render.
 */

import { buildFontRegistry, compileTimeline, type Timeline } from '@glissade/core';
import { bindScene, evaluate, type RenderBackend, type Scene } from '@glissade/scene';
import { validateSceneFonts } from '@glissade/scene/diagnostics';
import { Canvas2DBackend } from '@glissade/backend-canvas2d';
import { createPlayer, type Player, type PlayerOptions } from './player.js';
import { planReducedMotion, mediaPrefersReducedMotion } from './reducedMotion.js';

export interface Mounted {
  player: Player;
  /**
   * The live render backend. `Canvas2DBackend` by default; the abstract
   * `RenderBackend` contract when an `opts.backend` factory was injected
   * (dom-backend memo, Seam 2).
   */
  backend: RenderBackend;
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
  // Backend-injection seam (dom-backend memo, Seam 2): construct via the
  // injected factory when supplied, else default to Canvas2DBackend — keeping
  // every existing call site and player's static deps unchanged. This is the
  // single explicit point a future @glissade/backend-dom plugs into without
  // forking the mount body.
  const backend: RenderBackend = opts.backend ? opts.backend(canvas) : new Canvas2DBackend(canvas);
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

  // 0.59 mode gate: prod embeds downgrade an unresolved track target throw→warn.
  // Warm the binding memo with the chosen mode BEFORE evaluate() (which binds
  // cache-cold in the default 'throw' mode) so the whole render loop — including
  // the very first bind of whatever doc is live — runs in the selected mode. The
  // bind is memoized per (scene, doc), so this is a WeakMap hit after the first
  // frame; byte-identical to evaluate()'s own bind for every valid scene.
  const unboundMode: 'throw' | 'warn' = opts.production ? 'warn' : 'throw';
  const renderNow = () => {
    bindScene(scene, doc, { onUnbound: unboundMode });
    backend.render(evaluate(scene, doc, playhead.peek()));
  };

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

  // explicit fonts (§3.6): register EVERY declared face (weight/style variants)
  // once, and run font validation off the first paint (non-blocking — the
  // export paths await; realtime just warns / rejects on strict).
  const loadFonts = (forDoc: Timeline) => {
    if (typeof FontFace === 'undefined') return;
    const registry = buildFontRegistry(forDoc.assets);
    for (const f of registry.faces()) {
      const face = new FontFace(f.family, `url(${f.url})`, { weight: String(f.weight), style: f.style });
      (document.fonts as unknown as { add(f: FontFace): void }).add(face);
      void face.load().then(() => renderNow(), () => undefined);
    }
    // §3.6 coverage check, off the critical path: dev-warn by default, strict
    // rejects (unhandled-rejection surfaces it without gating paint).
    void validateSceneFonts(
      scene,
      forDoc,
      async (url) => {
        try {
          const resp = await fetch(url);
          return resp.ok ? await resp.arrayBuffer() : undefined;
        } catch {
          return undefined;
        }
      },
      { mode: opts.strictFonts ? 'strict' : 'dev', ...(opts.osFonts !== undefined ? { osFamilies: opts.osFonts } : {}) },
    );
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
