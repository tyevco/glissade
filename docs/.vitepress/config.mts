import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'glissade',
  description:
    'Programmatic motion graphics for TypeScript — realtime-first, deterministic export, no generator functions.',
  base: '/glissade/',
  ignoreDeadLinks: true, // guides cross-reference repo paths
  // the design documents are canonical engineering docs full of bare TS
  // generics (Signal<T>) that Vue's template parser rejects — link to GitHub
  srcExclude: ['DESIGN.md', 'DESIGN-V2-INTERACTIVITY.md'],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Live demo', link: 'https://tyevco.github.io/glissade/demo/app/' },
      { text: 'GitHub', link: 'https://github.com/tyevco/glissade' },
      { text: 'npm', link: 'https://www.npmjs.com/org/glissade' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/getting-started' },
          { text: 'For AI agents', link: '/for-agents' },
          { text: 'Concepts', link: '/concepts' },
          { text: 'Composing timelines', link: '/timeline' },
          { text: 'Flexbox layout', link: '/layout' },
          { text: 'Single-file browser bundle', link: '/browser' },
          { text: 'API discovery (window.glissade)', link: '/discovery' },
          { text: 'Controlled / imperative drive', link: '/controlled-drive' },
          { text: 'Interactivity (v2)', link: '/interactivity' },
          { text: 'Narration & captions', link: '/narration' },
          { text: 'Music & the beat grid', link: '/music' },
          { text: 'Sound effects', link: '/sfx' },
          { text: 'Typewriter & text reveal', link: '/typewriter' },
          { text: 'Motion clips', link: '/clips' },
          { text: 'Motion along a path', link: '/motion-path' },
          { text: 'Motion craft', link: '/motion-craft' },
          { text: 'Camera rig', link: '/camera' },
          { text: 'Particles & emitters', link: '/particles' },
          { text: 'Data-driven charts', link: '/charts' },
          { text: 'Reusable components', link: '/components' },
          { text: 'Radial gauges', link: '/gauges' },
          { text: 'Gradients & fills', link: '/gradients' },
          { text: 'Formula animation (Expr)', link: '/expr' },
          { text: 'Clipping & track mattes', link: '/compositing' },
          { text: 'Fitting & anchoring text', link: '/text-fitting' },
          { text: 'Hand-drawn sketch styles', link: '/sketch' },
          { text: 'SVG import', link: '/svg' },
          { text: 'Lottie export (gs export)', link: '/lottie-export' },
          { text: 'Render caching & remux', link: '/caching' },
          { text: 'Building a project (gs build)', link: '/build' },
          { text: 'Series mastering (gs master)', link: '/mastering' },
          { text: 'Reviewing goldens (gs repin)', link: '/golden-review' },
          { text: 'Migrating between versions', link: '/migrating' },
          { text: 'Migrating from Motion Canvas', link: '/migrating-from-motion-canvas' },
        ],
      },
      {
        text: 'Reference',
        items: [{ text: 'API reference (generated)', link: '/api-reference' }],
      },
      {
        text: 'Design',
        items: [
          {
            text: 'The v1 design (DESIGN.md)',
            link: 'https://github.com/tyevco/glissade/blob/main/docs/DESIGN.md',
          },
          {
            text: 'v2: Interactivity addendum',
            link: 'https://github.com/tyevco/glissade/blob/main/docs/DESIGN-V2-INTERACTIVITY.md',
          },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/tyevco/glissade' }],
  },
});
