import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/studioHost.ts', 'src/clips.ts', 'src/i18n.ts', 'src/font-ingest.ts', 'src/sidecar.ts'],
  format: 'esm',
  dts: true,
  hash: false,
  clean: true,
  // subset-font (hb-subset instancer) and fontverter (woff/woff2 → sfnt codec)
  // are OPTIONAL, dynamically imported export-path deps — never bundled into
  // core's dist (§3.6 / §4.4). Keeping them external preserves the dynamic
  // import() so the §4.4 leak-guard can prove they tree-shake out of the embed.
  external: [/^@glissade\//, 'subset-font', 'fontverter'],
});
