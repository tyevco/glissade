// Generated from scaffold-fixture.narration.timing.json by gs scaffold — a first-draft beat
// skeleton. Refine the // TODO markers, then re-run to regenerate (this file is a
// PURE FUNCTION of the committed timing manifest, so a re-run is byte-stable).
import { key, timeline, track } from '@glissade/core';
import { captionNode, captionTrack, narration, type NarrationTiming } from '@glissade/narrate';
import { createScene, type SceneModule } from '@glissade/scene';
import { recipe } from '@glissade/scene/recipes';
import timingJson from './scaffold-fixture.narration.timing.json';

const timing = timingJson as NarrationTiming;
const beats = narration(timing);
const SIZE = { w: 1920, h: 1080 };

// Drift-guard: fail loud at build time if the committed narration no longer has a
// segment this skeleton anchors to (a renamed/removed id → an error, not a silent drop).
beats.require(["seg-title", "seg-body", "seg-footnote"]);

// TODO frame: wrap the children + tracks below with YOUR episode frame — glissade
// owns the caption/narration wiring above; the bookend frame is yours, e.g.
//   const ep = makeEpisode({ accent, title, habit, next, footnote, timing });
//   … ep.push(<the beat components>) … export default ep.finish({ audio: beats.clips('./scaffold-fixture.narration-cache') });

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: SIZE,
      children: [
        // beat 'seg-title' — "Scaffold Fixture"
        recipe("title-card", { id: "seg-title", frame: SIZE }), // TODO: refine props from the line above
        // TODO beat: drop a component for 'seg-body' — "A bespoke beat with no recipe." (anchor: beats.start("seg-body"))
        // beat 'seg-footnote' — "A footnote."
        recipe("lower-third", { id: "seg-footnote", frame: SIZE }), // TODO: refine props from the line above
        captionNode(SIZE),
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: beats.totalDuration,
    labels: beats.labels(),
    tracks: [
      captionTrack(timing),
      // 'seg-title' pops in at its narration start (refine the ease/offset)
      track("seg-title/opacity", 'number', [
        key(beats.start("seg-title"), 0),
        key(beats.start("seg-title") + 0.3, 1, 'easeOutCubic'),
      ]),
      // TODO beat: anchor 'seg-body' props to beats.start("seg-body") — "A bespoke beat with no recipe."
      // 'seg-footnote' pops in at its narration start (refine the ease/offset)
      track("seg-footnote/opacity", 'number', [
        key(beats.start("seg-footnote"), 0),
        key(beats.start("seg-footnote") + 0.3, 1, 'easeOutCubic'),
      ]),
    ],
    audio: beats.clips('./scaffold-fixture.narration-cache'),
  }),
};

export default mod;
