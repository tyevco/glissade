/** gs localize e2e fixture: a t()-using Text (harvests the t() id) + a captions
 * string track (harvests the node-id) + a sibling .narration.json (fork source). */
import { key, timeline, track } from '@glissade/core';
import { t } from '@glissade/core/i18n';
import { Text, createScene, type SceneModule } from '@glissade/scene';
const mod: SceneModule = {
  createScene: () => createScene({
    size: { w: 320, h: 180 },
    children: [
      new Text({ id: 'title', text: t('hero.title'), fontFamily: 'DejaVu Sans' }),
      new Text({ id: 'captions', text: '', fontFamily: 'DejaVu Sans' }),
    ],
  }),
  timeline: timeline({
    tracks: [track('captions/text', 'string', [key(0, 'Hello', { interp: 'hold' as const })])],
  }),
};
export default mod;
