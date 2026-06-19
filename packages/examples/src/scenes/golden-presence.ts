/**
 * Golden corpus: presence() — the "send-line agency moment". A message card
 * ENTERS on a beat (default opacity fade), LIVES, then EXITS to land exactly on
 * HIDE; a scale-only label rides it (its opacity rise SYNTHESIZED into the guard,
 * its vec2 scale channel passing through); a sibling tag anchors to the card's
 * real exit (`hiddenAt`) and lives to the end. The whole schedule compiles to
 * keyed Track[] — an opacity window-guard that culls each node outside its
 * [show,hide] plus pass-through channels — byte-stable like any hand-authored doc.
 */

import { clip, presence } from '@glissade/core/clips';
import { key, timeline, type Vec2 } from '@glissade/core';
import { Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const FAMILY = 'DejaVu Sans';

// The card enters at 0.5s, lives, and exits to land on the 2.2s beat.
const SHOW = 0.5;
const HIDE = 2.2;

// Card: default opacity fade-in / fade-out (the canonical presence default).
const card = presence('card', { show: SHOW, hide: HIDE });

// Label rides the card: a vec2 scale-only entrance (NO opacity channel) — so
// presence SYNTHESIZES the 0→1 opacity rise into the guard (the text un-culls)
// while the scale channel passes through untouched. Default fade-out exit.
const scaleEnter = clip({
  channels: { scale: { path: 'scale', keys: [key(0, [0.7, 0.7] as Vec2), key(0.4, [1, 1] as Vec2, 'easeOutCubic')] } },
});
const label = presence('label', { show: SHOW, hide: HIDE, enter: scaleEnter });

// Sibling tag anchors to the card's REAL exit — appears as the card clears.
const tag = presence('tag', { show: card.hiddenAt, hide: 3 });

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 640, h: 360 },
      children: [
        new Rect({ id: 'bg', width: 640, height: 360, position: [320, 180], fill: '#10131a' }),
        // the message card (centered); starts culled by the opacity guard
        new Rect({ id: 'card', width: 360, height: 120, cornerRadius: 16, position: [320, 150], fill: '#1d2330', opacity: 0 }),
        new Text({
          id: 'label',
          text: 'send',
          fill: '#4ea1ff',
          fontFamily: FAMILY,
          fontSize: 40,
          position: [320, 150],
          align: 'center',
          opacity: 0,
        }),
        // the sibling tag, anchored to the card's exit beat
        new Rect({ id: 'tag', width: 140, height: 44, cornerRadius: 22, position: [320, 270], fill: '#3ddc97', opacity: 0 }),
      ],
    }),
  timeline: timeline({
    fps: 60,
    duration: 3,
    tracks: [...card.tracks, ...label.tracks, ...tag.tracks],
  }),
};

export default mod;
