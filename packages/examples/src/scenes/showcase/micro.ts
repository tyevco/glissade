/**
 * Showcase: micro-interaction sampler. Four widgets in a 2x2 grid, each
 * cycling its signature interaction on a staggered schedule so something is
 * always in motion, and every track returns to its t=0 state for a clean loop:
 *   1. toggle  — pill track recolors while the knob springs left <-> right
 *   2. checkbox — fill pops with an easeOutBack scale pulse; checkmark
 *      (two thin rotated Rects) scales in from 0
 *   3. button  — dips scale on press while a ripple Circle expands + fades
 *   4. toast   — card springs up from below the bottom edge, holds, slides away
 */

import { spring, timeline } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const W = 800;
const H = 450;

const knobSpring = spring({ stiffness: 260, damping: 18, mass: 1 });
const pressSpring = spring({ stiffness: 320, damping: 14, mass: 1 });
const toastSpring = spring({ stiffness: 150, damping: 15, mass: 1 });

const GRAY = '#3a3f4b';
const GREEN = '#34c759';
const BOX_OFF = '#262b35';
const BLUE = '#4ea1ff';

const label = (id: string, text: string, x: number, y: number) =>
  new Text({ id, text, fill: '#5c6370', fontSize: 14, position: [x, y] });

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: W, h: H },
      children: [
        new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: '#15161a' }),

        // ---- 1. toggle switch (top-left) -------------------------------
        label('lblToggle', 'TOGGLE', 174, 56),
        new Group({
          id: 'toggleGrp',
          position: [200, 118],
          children: [
            new Circle({ id: 'capL', radius: 19, position: [-26, 0], fill: GRAY }),
            new Circle({ id: 'capR', radius: 19, position: [26, 0], fill: GRAY }),
            new Rect({ id: 'pill', width: 52, height: 38, fill: GRAY }),
            new Circle({ id: 'knob', radius: 15, position: [-26, 0], fill: '#f4f5f7' }),
          ],
        }),

        // ---- 2. checkbox (top-right) ------------------------------------
        label('lblCheck', 'CHECKBOX', 562, 56),
        new Group({
          id: 'cbGrp',
          position: [600, 118],
          children: [
            new Rect({
              id: 'cbBox',
              width: 56,
              height: 56,
              fill: BOX_OFF,
              stroke: BLUE,
              strokeWidth: 3,
            }),
            new Group({
              id: 'check',
              scale: [0, 0],
              children: [
                new Rect({ id: 'ck1', width: 16, height: 6, position: [-9, 6], rotation: 45, fill: '#ffffff' }),
                new Rect({ id: 'ck2', width: 28, height: 6, position: [4, 0], rotation: -45, fill: '#ffffff' }),
              ],
            }),
          ],
        }),

        // ---- 3. button press (bottom-left) ------------------------------
        label('lblBtn', 'BUTTON', 176, 276),
        new Group({
          id: 'btnGrp',
          position: [200, 340],
          children: [
            new Rect({ id: 'btn', width: 180, height: 56, fill: '#7c4dff' }),
            new Circle({
              id: 'ripple',
              radius: 10,
              fill: '#ffffff',
              opacity: 0,
              scale: [0.2, 0.2],
              blend: 'screen',
            }),
            new Text({ id: 'btnTxt', text: 'Submit', fill: '#ffffff', fontSize: 22, position: [-35, 8] }),
          ],
        }),

        // ---- 4. toast (bottom-right) -------------------------------------
        label('lblToast', 'TOAST', 572, 276),
        new Group({
          id: 'toastGrp',
          position: [600, 510], // starts fully below the bottom edge
          children: [
            new Rect({ id: 'toastCard', width: 240, height: 60, fill: '#23272f', stroke: '#3a3f4b', strokeWidth: 2 }),
            new Rect({ id: 'toastAccent', width: 6, height: 60, position: [-117, 0], fill: GREEN }),
            new Circle({ id: 'toastDot', radius: 9, position: [-90, 0], fill: GREEN }),
            new Text({ id: 'toastTxt', text: 'Changes saved', fill: '#e8eaee', fontSize: 18, position: [-68, 6] }),
          ],
        }),
      ],
    }),

  timeline: timeline(
    (tl) => {
      // Anchor every animated target at its t=0 rest state. String targets have
      // no build-time base value, so without these the builder emits only end
      // keys and the track would sit at its end state before the tween starts.
      tl.set('knob/position.x', -26, { at: 0 })
        .set('pill/fill', GRAY, { at: 0 })
        .set('capL/fill', GRAY, { at: 0 })
        .set('capR/fill', GRAY, { at: 0 })
        .set('cbBox/fill', BOX_OFF, { at: 0 })
        .set('cbGrp/scale', [1, 1], { at: 0 })
        .set('check/scale', [0, 0], { at: 0 })
        .set('btnGrp/scale', [1, 1], { at: 0 })
        .set('toastGrp/position.y', 510, { at: 0 })
        .set('ripple/opacity', 0, { at: 0 })
        .set('ripple/scale', [0.2, 0.2], { at: 0 });

      // -- toggle on (0.15s) --------------------------------------------
      tl.to('knob/position.x', 26, { at: 0.15, ease: knobSpring })
        .to('pill/fill', GREEN, { duration: 0.3, at: 0.15 })
        .to('capL/fill', GREEN, { duration: 0.3, at: '<' })
        .to('capR/fill', GREEN, { duration: 0.3, at: '<' });

      // -- checkbox check (0.8s) ----------------------------------------
      tl.to('cbBox/fill', BLUE, { duration: 0.2, at: 0.8 })
        .to('cbGrp/scale', [1.15, 1.15], { duration: 0.12, at: 0.8, ease: 'easeOutQuad' })
        .to('cbGrp/scale', [1, 1], { duration: 0.4, at: '>', ease: 'easeOutBack' })
        .to('check/scale', [1, 1], { duration: 0.45, at: 0.9, ease: 'easeOutBack' });

      // -- button press #1 (1.5s). Each ripple burst starts with a `set`
      // (hold key) so the quiet gap before it holds 0 instead of lerping
      // toward the burst's start value.
      tl.to('btnGrp/scale', [0.9, 0.9], { duration: 0.1, at: 1.5, ease: 'easeOutQuad' })
        .to('btnGrp/scale', [1, 1], { at: '>', ease: pressSpring })
        .set('ripple/scale', [0.2, 0.2], { at: 1.58 })
        .set('ripple/opacity', 0.4, { at: 1.58 })
        .to('ripple/scale', [9, 9], { duration: 0.7, at: 1.58, ease: 'easeOutQuad' })
        .to('ripple/opacity', 0, { duration: 0.7, at: 1.58, ease: 'easeOutQuad' });

      // -- toast in (2.0s), hold, out (4.0s) -----------------------------
      tl.to('toastGrp/position.y', 340, { at: 2.0, ease: toastSpring })
        .to('toastGrp/position.y', 510, { duration: 0.45, at: 4.0, ease: 'easeInQuad' });

      // -- toggle off (2.55s) --------------------------------------------
      tl.to('knob/position.x', -26, { at: 2.55, ease: knobSpring })
        .to('pill/fill', GRAY, { duration: 0.3, at: 2.55 })
        .to('capL/fill', GRAY, { duration: 0.3, at: '<' })
        .to('capR/fill', GRAY, { duration: 0.3, at: '<' });

      // -- checkbox uncheck (3.3s) ----------------------------------------
      tl.to('check/scale', [0, 0], { duration: 0.25, at: 3.3, ease: 'easeInQuad' })
        .to('cbBox/fill', BOX_OFF, { duration: 0.25, at: 3.3 });

      // -- button press #2 (3.7s) ----------------------------------------
      tl.to('btnGrp/scale', [0.9, 0.9], { duration: 0.1, at: 3.7, ease: 'easeOutQuad' })
        .to('btnGrp/scale', [1, 1], { at: '>', ease: pressSpring })
        .set('ripple/scale', [0.2, 0.2], { at: 3.78 })
        .set('ripple/opacity', 0.4, { at: 3.78 })
        .to('ripple/scale', [9, 9], { duration: 0.7, at: 3.78, ease: 'easeOutQuad' })
        .to('ripple/opacity', 0, { duration: 0.7, at: 3.78, ease: 'easeOutQuad' });
    },
    { duration: 4.8, fps: 60 },
  ),
};

export default mod;
