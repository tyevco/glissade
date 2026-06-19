import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/studioHost.ts', 'src/clips.ts', 'src/font-ingest.ts'],
  format: 'esm',
  dts: true,
  hash: false,
  clean: true,
  // subset-font (woff2 decode + hb-subset instancer) is an OPTIONAL, dynamically
  // imported export-path dep — never bundled into core's dist (§3.6 / §4.4).
  external: [/^@glissade\//, 'subset-font'],
});
