/**
 * Golden corpus: glissade's OWN caption layer (§narrate) — a `captionNode`
 * driven by a `captionTrack`. The 262 other goldens are caption-FREE, so a
 * regression in `@glissade/narrate`'s caption rendering (the default LANDSCAPE
 * `captionNode` path + the `captionTrack` hold-key cue document) wouldn't be
 * caught. This pins the canonical shape: ONE long multi-line segment wrapping
 * to ~2 lines in the bottom-anchored safe-area band, rendered at frame 90
 * (t=3.0, inside the segment so the caption is active). Byte-compared on Skia.
 *
 * The track is injected via the WORKING builder path — `tl.tracks([...])` —
 * NOT `timeline(fn, { tracks })` (the silent no-op). The long-caption auto-fit
 * opt stays OFF (the default), so this exercises the plain wrap.
 */

import { timeline } from '@glissade/core';
import { captionNode, captionTrack, type NarrationTiming } from '@glissade/narrate';
import { createScene, type SceneModule } from '@glissade/scene';

const SIZE = { w: 1920, h: 1080 };

// A minimal committed timing manifest (fake provider — deterministic on any
// machine): ONE multi-line segment whose long caption wraps to ~2 lines in the
// band. Active across [0.5, 5.5], so the frame-90 (t=3.0) render lights it.
const timing: NarrationTiming = {
  timingVersion: 1,
  provider: 'test',
  providerVersion: 'test',
  totalDuration: 6,
  pauses: [],
  segments: [
    {
      id: 'seg-1',
      text: "You don't need magic words. You need to understand three things about how the assistant actually reads what you give it.",
      start: 0.5,
      duration: 5.0,
      file: '',
      words: [],
    },
  ],
};

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [captionNode(SIZE, { fontFamily: 'DejaVu Sans' })],
    }),
  timeline: timeline(
    (tl) => {
      // the WORKING track-injection path (NOT timeline(fn, { tracks }), the no-op)
      tl.tracks([captionTrack(timing)]);
    },
    {
      fps: 60,
      duration: timing.totalDuration,
      // asset id IS the family name (§3.6) — gs render registers it standalone
      assets: { 'DejaVu Sans': { kind: 'font', url: '../../assets/fonts/DejaVuSans.ttf' } },
    },
  ),
};

export default mod;
