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
          { text: 'Concepts', link: '/concepts' },
          { text: 'Interactivity (v2)', link: '/interactivity' },
          { text: 'Narration & captions', link: '/narration' },
          { text: 'Migrating from Motion Canvas', link: '/migrating-from-motion-canvas' },
        ],
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
