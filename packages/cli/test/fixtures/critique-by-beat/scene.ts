// Fixture scene for `gs critique --by-beat`. Three Text nodes that ALL overflow
// their wrap box (an unbreakable long word wider than width:80 → TEXT_OVERFLOW
// with geometry `width`/`fontSize` levers AND a content `text` lever), so the
// escalate-boundary presentation is exercised, and each lands in a DISTINCT
// attribution bucket (the 4-bucket split):
//   • `title`    ENTERS at t=2.0 (its earliest keyframe) → owned by beat 'seg-b'
//                (window [1.5, 3.0)).
//   • `caption`  SPANS the whole timeline (keys at t=0 and t=5) → the genuine
//                `[likely FRAME-owned]` spans group, NEVER a silent seg-0.
//   • `subtitle` has NO timeline track (keyframeless) → the honest
//                `[no entrance keyframe]` unattributed group (NOT frame-owned).
// fontFamily is pinned to 'DejaVu Sans' so measurement is deterministic (the
// golden-text-font gotcha) and the report is byte-identical run-to-run.
import { key, timeline, track } from '@glissade/core';
import { Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'DejaVu Sans';
const LONG = 'Internationalization'; // unbreakable word — modestly overflows width:80,
// so the geometry levers (widen `width` / shrink `fontSize`) stay FEASIBLE and the
// escalate presentation shows BOTH a `suggested fix` and an `author decision`.

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 800, h: 400 },
      children: [
        new Text({ id: 'title', text: LONG, fontFamily: FAMILY, fontSize: 20, width: 80, align: 'center', fill: '#eaf1ff', position: [400, 120] }),
        new Text({ id: 'caption', text: LONG, fontFamily: FAMILY, fontSize: 20, width: 80, align: 'center', fill: '#8fa3c4', position: [400, 280] }),
        // subtitle has NO track → keyframeless → [no entrance keyframe] (unattributed).
        new Text({ id: 'subtitle', text: LONG, fontFamily: FAMILY, fontSize: 20, width: 80, align: 'center', fill: '#c4b58f', position: [400, 200] }),
      ],
    }),
  timeline: timeline({
    duration: 5,
    tracks: [
      // title enters mid-timeline: earliest keyframe t=2.0 lands in beat 'seg-b'.
      track('title/position.x', 'number', [key(2.0, 100), key(3.5, 100)]),
      // caption spans the whole timeline (t=0 … t=5) → [likely FRAME-owned].
      track('caption/position.x', 'number', [key(0, 100), key(5, 100)]),
    ],
  }),
};

export default mod;
