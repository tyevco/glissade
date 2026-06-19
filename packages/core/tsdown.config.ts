import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/studioHost.ts', 'src/clips.ts'],
  format: 'esm',
  dts: true,
  hash: false,
  clean: true,
  external: [/^@glissade\//],
});
