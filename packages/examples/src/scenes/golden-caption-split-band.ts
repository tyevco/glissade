/**
 * Golden corpus: caption-split BAND mode (0.68.0). A long two-sentence narration
 * segment with per-word timings + `captionSplit: { mode: 'band' }` splits into
 * MEASURED band-fit sub-cues — at the sentence boundary, each cue sized so it fits
 * the caption band at the min-legible floor (vs the legacy `{ maxChars }` char budget).
 * captionNode autoFit then renders each short cue as large as it fits. Byte-compared
 * on Skia.
 *
 * MEASURER: the band split runs at TIMELINE-BUILD (before the harness injects the Skia
 * measurer), so it takes `{ estimate: true }` — the split points are chosen by the rough
 * per-character estimate, but the PNG still renders through createScene() with the REAL
 * Skia measurer, and the band + text here carry enough margin that the estimate-split
 * cues fit cleanly under real metrics (measure-consistency is unit-tested with a real
 * measurer; this scene is the visual + determinism pin). Same discipline as
 * golden-splittext's `{ estimate: true }`.
 */

import { timeline } from '@glissade/core';
import { captionNode, captionTrack, type NarrationTiming } from '@glissade/narrate';
import { Rect, createScene, type SceneModule } from '@glissade/scene';

const SIZE = { w: 360, h: 640 };
const STYLE = { fontFamily: 'DejaVu Sans', autoFit: true, maxLines: 2 } as const;
const TEXT =
  'Glissade renders every frame as a pure function of time. The same scene exports a byte-identical video and a live widget.';
const START = 0.3;
const DUR = 3.6;
const tokens = TEXT.split(' ');
const words = tokens.map((word, i) => ({
  word,
  start: START + (i / tokens.length) * DUR,
  end: START + ((i + 1) / tokens.length) * DUR,
}));

const timing: NarrationTiming = {
  timingVersion: 1,
  provider: 'fake',
  providerVersion: 'fake-1',
  totalDuration: 4,
  captionSplit: { mode: 'band' },
  segments: [{ id: 'seg', text: TEXT, start: START, duration: DUR, file: 'seg.wav', words }],
};

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [
        new Rect({ id: 'bg', width: SIZE.w, height: SIZE.h, position: [SIZE.w / 2, SIZE.h / 2], fill: '#1b2330' }),
        // the reserved-band top line, so the golden shows cues staying above it
        new Rect({ id: 'safeline', width: SIZE.w, height: 2, position: [SIZE.w / 2, Math.round(SIZE.h * 0.82)], fill: '#3a4660' }),
        captionNode(SIZE, STYLE),
      ],
    }),
  // band split needs the render context (size + the SAME style captionNode uses) so
  // the fit matches; { estimate: true } because no real measurer exists at build time.
  timeline: timeline({
    fps: 60,
    duration: 4,
    tracks: [captionTrack(timing, { size: SIZE, style: STYLE, estimate: true })],
  }),
};

export default mod;
