/**
 * Showcase: "dashboard" — a mock app GUI assembling itself.
 *
 * Dark app frame fades up; the sidebar springs in from the left; the navbar
 * drops down; three stat cards stagger up with easeOutBack while their
 * numbers count up via hold keys (tl.set on string tracks); a six-bar chart
 * grows from its baseline (scale.y + position.y animated together so bars
 * rise from the axis); one card gets a soft highlight pulse. The finished
 * screen holds a beat, then the whole app fades for a clean loop.
 */

import { spring, timeline } from '@glissade/core';
import { Circle, Group, Rect, Text, createScene, type SceneModule } from '@glissade/scene';

const W = 800;
const H = 450;

const INK = '#e8eaf0';
const MUTED = '#9aa3b5';
const PANEL = '#272b36';
const CHROME = '#222634';
const ACCENT = '#4ea1ff';

// Bar chart geometry: baseline lives at y=95 in chart-group coordinates.
const BASE_Y = 95;
const BAR_X = [-220, -132, -44, 44, 132, 220];
const BAR_H = [80, 130, 100, 170, 120, 150];
const BAR_FILL = ['#3d7eff', '#4ea1ff', '#5fc3ff', '#3d7eff', '#4ea1ff', '#5fc3ff'];

// Stat cards: center x, label, count-up steps (hold keys).
const CARDS: Array<{ x: number; label: string; steps: string[] }> = [
  { x: 273, label: 'USERS', steps: ['1,962', '4,310', '7,845', '10,230', '12,408'] },
  { x: 475, label: 'REVENUE', steps: ['$7.4k', '$18.9k', '$31.0k', '$42.7k', '$48.2k'] },
  { x: 677, label: 'UPTIME', steps: ['24%', '61%', '88%', '97%', '99.98%'] },
];

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: W, h: H },
      children: [
        new Rect({ id: 'bg', width: W, height: H, position: [W / 2, H / 2], fill: '#15161a' }),
        new Group({
          id: 'app',
          children: [
            // App frame
            new Rect({
              id: 'frame',
              width: 770,
              height: 420,
              position: [400, 225],
              fill: '#1b1e26',
              opacity: 0,
            }),
            // Sidebar (starts off-canvas left; springs to x=90)
            new Group({
              id: 'sidebar',
              position: [-100, 225],
              children: [
                new Rect({ id: 'sidebarBgRect', width: 150, height: 420, fill: CHROME }),
                new Circle({ id: 'logoDot', radius: 11, position: [-46, -175], fill: ACCENT }),
                new Text({
                  id: 'logoText',
                  text: 'glissade',
                  position: [-28, -170],
                  fontSize: 15,
                  fill: INK,
                }),
                new Rect({ id: 'menu1', width: 110, height: 10, position: [0, -130], fill: ACCENT }),
                new Rect({ id: 'menu2', width: 110, height: 10, position: [0, -100], fill: '#343a4a' }),
                new Rect({ id: 'menu3', width: 110, height: 10, position: [0, -70], fill: '#343a4a' }),
                new Rect({ id: 'menu4', width: 110, height: 10, position: [0, -40], fill: '#343a4a' }),
              ],
            }),
            // Top navbar (fades down into place)
            new Group({
              id: 'navbar',
              position: [475, 32],
              opacity: 0,
              children: [
                new Rect({ id: 'navbarBgRect', width: 620, height: 52, fill: CHROME }),
                new Text({
                  id: 'navTitle',
                  text: 'Overview',
                  position: [-290, 6],
                  fontSize: 18,
                  fill: INK,
                }),
                new Circle({ id: 'avatar', radius: 13, position: [285, 0], fill: '#7c4dff' }),
              ],
            }),
            // Stat cards
            ...CARDS.map(
              (c, i) =>
                new Group({
                  id: `card${i + 1}`,
                  position: [c.x, 168],
                  opacity: 0,
                  children: [
                    new Rect({ id: `cardRect${i + 1}`, width: 186, height: 80, fill: PANEL }),
                    new Text({
                      id: `cardLabel${i + 1}`,
                      text: c.label,
                      position: [-78, -14],
                      fontSize: 12,
                      fill: MUTED,
                    }),
                    new Text({
                      id: `num${i + 1}`,
                      text: '0',
                      position: [-78, 26],
                      fontSize: 26,
                      fill: INK,
                    }),
                    // highlight overlay (only pulsed on card 2)
                    new Rect({
                      id: `glow${i + 1}`,
                      width: 186,
                      height: 80,
                      fill: ACCENT,
                      blend: 'screen',
                      opacity: 0,
                    }),
                  ],
                }),
            ),
            // Bar chart panel
            new Group({
              id: 'chart',
              position: [475, 305],
              opacity: 0,
              children: [
                new Rect({ id: 'chartRect', width: 590, height: 230, fill: PANEL }),
                new Text({
                  id: 'chartTitle',
                  text: 'WEEKLY SESSIONS',
                  position: [-275, -88],
                  fontSize: 12,
                  fill: MUTED,
                }),
                new Rect({ id: 'axis', width: 530, height: 2, position: [0, BASE_Y], fill: '#3a4154' }),
                ...BAR_X.map(
                  (x, i) =>
                    new Rect({
                      id: `bar${i + 1}`,
                      width: 48,
                      height: BAR_H[i]!,
                      position: [x, BASE_Y - 1],
                      scale: [1, 0.001],
                      fill: BAR_FILL[i]!,
                    }),
                ),
              ],
            }),
          ],
        }),
      ],
    }),
  timeline: timeline(
    (tl) => {
      // App frame fades up.
      tl.fromTo('frame/opacity', 0, 1, { duration: 0.35, at: 0, ease: 'easeOutQuad' });

      // Sidebar springs in from the left.
      tl.fromTo('sidebar/position.x', -100, 90, {
        at: 0.1,
        ease: spring({ stiffness: 180, damping: 16, mass: 1 }),
      });

      // Navbar fades down into place.
      tl.fromTo('navbar/opacity', 0, 1, { duration: 0.35, at: 0.45, ease: 'easeOutQuad' });
      tl.fromTo('navbar/position.y', 32, 52, { duration: 0.45, at: '<', ease: 'easeOutCubic' });

      // Stat cards stagger up with easeOutBack; numbers count up via hold keys.
      CARDS.forEach((c, i) => {
        const t0 = 0.7 + i * 0.15;
        tl.fromTo(`card${i + 1}/opacity`, 0, 1, { duration: 0.3, at: t0, ease: 'easeOutQuad' });
        tl.fromTo(`card${i + 1}/position.y`, 168, 135, {
          duration: 0.5,
          at: '<',
          ease: 'easeOutBack',
        });
        c.steps.forEach((v, s) => {
          tl.set(`num${i + 1}/text`, v, { at: t0 + 0.12 + s * 0.16 });
        });
      });

      // Chart panel fades in, then bars grow up from the baseline with a stagger.
      tl.fromTo('chart/opacity', 0, 1, { duration: 0.4, at: 1.1, ease: 'easeOutQuad' });
      BAR_H.forEach((h, i) => {
        const t0 = 1.35 + i * 0.1;
        // Animate scale.y and position.y together (same ease, same duration)
        // so the bar grows upward from its base on the axis.
        tl.fromTo(`bar${i + 1}/scale`, [1, 0.001], [1, 1], {
          duration: 0.55,
          at: t0,
          ease: 'easeOutCubic',
        });
        tl.fromTo(`bar${i + 1}/position.y`, BASE_Y - 1, BASE_Y - 1 - h / 2, {
          duration: 0.55,
          at: '<',
          ease: 'easeOutCubic',
        });
      });

      // Subtle highlight pulse sweeps the middle card.
      tl.fromTo('glow2/opacity', 0, 0.28, { duration: 0.35, at: 2.7, ease: 'easeInOutSine' });
      tl.to('glow2/opacity', 0, { duration: 0.55, at: '>', ease: 'easeInOutSine' });
      tl.fromTo('card2/scale', [1, 1], [1.05, 1.05], { duration: 0.3, at: 2.7, ease: 'easeOutQuad' });
      tl.to('card2/scale', [1, 1], { duration: 0.4, at: '>', ease: 'easeInOutSine' });

      // Hold the finished screen a beat, then fade everything for the loop
      // (at t=0 every element is hidden/off-canvas, so t=duration matches t=0).
      tl.fromTo('app/opacity', 1, 0, { duration: 0.5, at: 4.9, ease: 'easeInOutQuad' });
    },
    { duration: 5.5, fps: 60 },
  ),
};

export default mod;
