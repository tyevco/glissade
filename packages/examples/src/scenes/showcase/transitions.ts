/**
 * Showcase: screen-to-screen transitions.
 *
 * Two mock app screens — a login card (A) and a home feed (B) — cycle through
 * three classic transitions: SLIDE (A out left, B in from right), WIPE (a
 * full-height panel sweeps across; the screens crossfade while covered), and
 * FADE-THROUGH-BLACK back to A's start state so the loop closes cleanly.
 * Each phase is labelled by a small caption at the bottom.
 */

import { timeline, type Vec2 } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const W = 800;
const H = 450;
const CX = W / 2;
const CY = H / 2;

/** Off-canvas resting x for screen B (right) and slide-out x for screen A (left). */
const B_START_X = 1220;
const A_EXIT_X = -420;

/** Wipe panel: wide enough to fully cover the canvas mid-sweep. */
const WIPE_W = 1700;
const WIPE_START_X = -860;
const WIPE_END_X = 1660;

const feedItem = (
  i: number,
  y: number,
  avatarFill: string,
): Array<Rect | Circle> => [
  new Rect({ id: `b-item${i}`, width: 284, height: 72, position: [0, y], fill: '#262a36' }),
  new Circle({ id: `b-avatar${i}`, radius: 20, position: [-110, y], fill: avatarFill }),
  new Rect({ id: `b-line${i}a`, width: 150, height: 10, position: [-5, y - 14], fill: '#525a70' }),
  new Rect({ id: `b-line${i}b`, width: 110, height: 8, position: [-25, y + 12], fill: '#3a4052' }),
];

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: W, h: H },
      children: [
        new Rect({ id: 'bg', width: W, height: H, position: [CX, CY], fill: '#15161a' }),

        // Screen A: login card
        new Group({
          id: 'screenA',
          position: [CX, CY],
          opacity: 0,
          scale: [0.85, 0.85],
          children: [
            new Rect({
              id: 'a-card',
              width: 300,
              height: 320,
              fill: '#23262f',
              stroke: '#343847',
              strokeWidth: 1,
            }),
            new Text({
              id: 'a-title',
              text: 'Welcome back',
              fontSize: 22,
              fill: '#eef0f6',
              position: [-68, -105],
            }),
            new Rect({
              id: 'a-input1',
              width: 240,
              height: 38,
              position: [0, -50],
              fill: '#15161a',
              stroke: '#3a3f4f',
              strokeWidth: 1,
            }),
            new Text({ id: 'a-lbl1', text: 'email', fontSize: 13, fill: '#6b7184', position: [-105, -46] }),
            new Rect({
              id: 'a-input2',
              width: 240,
              height: 38,
              position: [0, 2],
              fill: '#15161a',
              stroke: '#3a3f4f',
              strokeWidth: 1,
            }),
            new Text({ id: 'a-lbl2', text: 'password', fontSize: 13, fill: '#6b7184', position: [-105, 6] }),
            new Rect({ id: 'a-button', width: 240, height: 44, position: [0, 72], fill: '#4ea1ff' }),
            new Text({ id: 'a-btn-lbl', text: 'Sign in', fontSize: 17, fill: '#0d1117', position: [-27, 78] }),
          ],
        }),

        // Screen B: home feed
        new Group({
          id: 'screenB',
          position: [B_START_X, CY],
          children: [
            new Rect({
              id: 'b-panel',
              width: 320,
              height: 340,
              fill: '#1c1e26',
              stroke: '#343847',
              strokeWidth: 1,
            }),
            new Rect({ id: 'b-header', width: 320, height: 52, position: [0, -144], fill: '#4ea1ff' }),
            new Text({ id: 'b-header-lbl', text: 'Home', fontSize: 20, fill: '#0d1117', position: [-140, -138] }),
            ...feedItem(0, -70, '#e6a700'),
            ...feedItem(1, 16, '#7c4dff'),
            ...feedItem(2, 102, '#3ddc97'),
          ],
        }),

        // Wipe panel (above both screens)
        new Rect({
          id: 'wipe',
          width: WIPE_W,
          height: H + 10,
          position: [WIPE_START_X, CY],
          fill: '#e6a700',
          zIndex: 10,
        }),

        // Fade-through-black cover (above the wipe)
        new Rect({ id: 'fader', width: W, height: H, position: [CX, CY], fill: '#0b0c10', opacity: 0, zIndex: 20 }),

        // Phase captions (topmost)
        new Text({ id: 'capSlide', text: 'slide', fontSize: 18, fill: '#9aa1b5', position: [378, 432], opacity: 0, zIndex: 30 }),
        new Text({ id: 'capWipe', text: 'wipe', fontSize: 18, fill: '#9aa1b5', position: [382, 432], opacity: 0, zIndex: 30 }),
        new Text({ id: 'capFade', text: 'fade', fontSize: 18, fill: '#9aa1b5', position: [382, 432], opacity: 0, zIndex: 30 }),
      ],
    }),

  timeline: timeline(
    (tl) => {
      // — Phase 0 (0.0–0.6): screen A enters with fade + scale, then a beat.
      tl.fromTo('screenA/opacity', 0, 1, { duration: 0.6, at: 0, ease: 'easeOutQuad' })
        .fromTo('screenA/scale', [0.85, 0.85] as Vec2, [1, 1] as Vec2, {
          duration: 0.6,
          at: 0,
          ease: 'easeOutBack',
        })

        // — Phase 1 (1.2–2.0): SLIDE — A exits left while B enters from the right.
        .label('slide', 1.2)
        .fromTo('screenA/position.x', CX, A_EXIT_X, { duration: 0.8, at: 'slide', ease: 'easeInOutCubic' })
        .fromTo('screenB/position.x', B_START_X, CX, { duration: 0.8, at: 'slide', ease: 'easeInOutCubic' })
        .fromTo('capSlide/opacity', 0, 1, { duration: 0.25, at: 1.05 })
        .to('capSlide/opacity', 0, { duration: 0.25, at: 2.1 })

        // — Phase 2 (2.6–3.8): WIPE back — the panel sweeps across; while the
        //   canvas is fully covered (~3.06–3.34) A snaps back to center and B
        //   crossfades out, so the trailing edge "reveals" A.
        .label('wipe', 2.6)
        .fromTo('wipe/position.x', WIPE_START_X, WIPE_END_X, {
          duration: 1.2,
          at: 'wipe',
          ease: 'easeInOutSine',
        })
        .set('screenA/position.x', CX, { at: 3.18 })
        .fromTo('screenB/opacity', 1, 0, { duration: 0.15, at: 3.12 })
        .fromTo('capWipe/opacity', 0, 1, { duration: 0.25, at: 2.5 })
        .to('capWipe/opacity', 0, { duration: 0.25, at: 3.95 })

        // — Phase 3 (4.4–5.9): FADE-THROUGH-BLACK — cover everything, reset all
        //   state to t=0 under the cover, then fade back out to A's start state.
        .label('fade', 4.4)
        .fromTo('fader/opacity', 0, 1, { duration: 0.6, at: 'fade', ease: 'easeInOutQuad' })
        .set('screenA/opacity', 0, { at: 5.1 })
        .set('screenA/scale', [0.85, 0.85] as Vec2, { at: 5.1 })
        .set('screenB/position.x', B_START_X, { at: 5.1 })
        .set('screenB/opacity', 1, { at: 5.1 })
        .set('wipe/position.x', WIPE_START_X, { at: 5.1 })
        .to('fader/opacity', 0, { duration: 0.7, at: 5.2, ease: 'easeInOutQuad' })
        .fromTo('capFade/opacity', 0, 1, { duration: 0.25, at: 4.35 })
        .to('capFade/opacity', 0, { duration: 0.3, at: 5.55 });
    },
    { duration: 6, fps: 60 },
  ),
};

export default mod;
