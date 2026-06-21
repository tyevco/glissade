/**
 * @glissade/backend-canvas2d/snapshot — the "screenshot a rendered frame as a
 * data URL" DX seam (the AI-consumer wall: "can't screenshot a live canvas").
 *
 * This is DX / screenshot TOOLING, NOT a render path: a no-build playback embed
 * never needs it. So it lives on this SEPARATE, tree-shakeable subpath — off the
 * `@glissade/backend-canvas2d` base index (which is on the base embed budget),
 * mirroring how `@glissade/scene/path` / `/layout` / `/describe` keep their
 * byte-expensive code off the base scene index. The data-URL/Blob-encode bytes
 * here must never enter the base embed bundle.
 *
 * Browser-only by design: relies on `OffscreenCanvas.convertToBlob` /
 * `HTMLCanvasElement.toDataURL`. The Skia/Node twin has its own
 * `encodePNG`/`toBuffer` path (@napi-rs/canvas). Importing this module in a
 * headless Node env never throws — the browser-only constraint is enforced at
 * call time, never at load.
 */

import { evaluate, type Scene } from '@glissade/scene';
import type { Timeline } from '@glissade/core';
import { Canvas2DBackend } from './index.js';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Encode a `Blob` (from `OffscreenCanvas.convertToBlob`) as a `data:` URL.
 * `arrayBuffer()` + `btoa()` (both Web standards present in browser, worker, and
 * Node) — leaner than wiring a `FileReader` and with no Node `Buffer`
 * dependency, so the bundle stays browser-clean.
 */
async function blobToDataURL(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

/** Pull the underlying canvas out of a `Canvas2DBackend`, or pass a canvas through. */
function canvasOf(canvasOrBackend: AnyCanvas | Canvas2DBackend): AnyCanvas {
  return canvasOrBackend instanceof Canvas2DBackend ? canvasOrBackend.canvas : canvasOrBackend;
}

/**
 * Capture a canvas (or a `Canvas2DBackend`'s current canvas) as a
 * `data:image/png;base64,…` URL — the DX seam an AI consumer hit ("can't
 * screenshot a live canvas"). Render a frame first (`backend.render(list)`),
 * then `await snapshotCanvas(backend)`.
 *
 * Browser-only: relies on `OffscreenCanvas.convertToBlob` /
 * `HTMLCanvasElement.toDataURL`. Async to match the underlying serialization
 * (OffscreenCanvas is Blob-based, hence Promise-shaped).
 *
 * @param canvasOrBackend a `Canvas2DBackend`, an `HTMLCanvasElement`, or an `OffscreenCanvas`.
 * @param type image MIME type (default `image/png`); `quality` for lossy types.
 */
export async function snapshotCanvas(
  canvasOrBackend: AnyCanvas | Canvas2DBackend,
  type = 'image/png',
  quality?: number,
): Promise<string> {
  const canvas = canvasOf(canvasOrBackend);
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({
      type,
      ...(quality !== undefined ? { quality } : {}),
    });
    return await blobToDataURL(blob);
  }
  const el = canvas as HTMLCanvasElement;
  if (typeof el.toDataURL !== 'function') {
    throw new Error('snapshotCanvas() is browser-only: canvas has no toDataURL/convertToBlob');
  }
  return quality !== undefined ? el.toDataURL(type, quality) : el.toDataURL(type);
}

/**
 * One-shot DX convenience (0.19): `evaluate(scene, timeline, t)` →
 * `Canvas2DBackend.render` → `snapshotCanvas()`, returning a
 * `data:image/png;base64,…` URL for the frame. The "screenshot a frame" path a
 * host/test reaches for when it can't drive a live `<canvas>` (the AI-consumer
 * wall).
 *
 * Allocates an offscreen target sized to the scene (`OffscreenCanvas`, falling
 * back to a detached `<canvas>`), so the caller needs no DOM canvas. Browser-only
 * (same constraint as `snapshotCanvas()` — Skia/Node has its own encode path).
 *
 * Mirrors the `evaluate` overload pair: pass a timeline + time to sample an
 * animated frame, or omit both for the controlled-drive form (host-owned
 * playhead via `node.set(...)`, evaluated at the scene's current playhead).
 *
 * @param type image MIME type (default `image/png`); `quality` for lossy types.
 */
export function renderToDataURL(
  scene: Scene,
  timeline: Timeline,
  t: number,
  opts?: { type?: string; quality?: number },
): Promise<string>;
export function renderToDataURL(scene: Scene, opts?: { type?: string; quality?: number }): Promise<string>;
export async function renderToDataURL(
  scene: Scene,
  timelineOrOpts?: Timeline | { type?: string; quality?: number },
  t?: number,
  opts?: { type?: string; quality?: number },
): Promise<string> {
  // Disambiguate the overloads: a Timeline has a numeric `version`; the opts bag
  // does not. (`evaluate(scene)` controlled-drive form when no timeline given.)
  const hasTimeline =
    timelineOrOpts !== undefined && typeof (timelineOrOpts as Timeline).version === 'number';
  const timeline = hasTimeline ? (timelineOrOpts as Timeline) : undefined;
  const o = (hasTimeline ? opts : (timelineOrOpts as { type?: string; quality?: number } | undefined)) ?? {};

  const { w, h } = scene.size;
  const target: AnyCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });

  const backend = new Canvas2DBackend(target);
  try {
    backend.render(timeline !== undefined ? evaluate(scene, timeline, t ?? 0) : evaluate(scene));
    return await snapshotCanvas(backend, o.type, o.quality);
  } finally {
    backend.dispose();
  }
}
