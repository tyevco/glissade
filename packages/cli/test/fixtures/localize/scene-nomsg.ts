/** 0.42.1 fixture: NO t() usage + a MULTI-CUE caption track (>1 distinct value).
 * gs localize must exclude the multi-cue node-id from the harvest → zero message
 * ids → the "no localizable messages" fast-path (narration only, clean preflight). */
import { key, timeline, track } from '@glissade/core';
import { Text, createScene, type SceneModule } from '@glissade/scene';
const mod: SceneModule = {
  createScene: () => createScene({
    size: { w: 320, h: 180 },
    children: [new Text({ id: 'cap', text: '', fontFamily: 'DejaVu Sans' })],
  }),
  timeline: timeline({
    tracks: [track('cap/text', 'string', [key(0, 'one', { interp: 'hold' as const }), key(1, 'two', { interp: 'hold' as const })])],
  }),
};
export default mod;
