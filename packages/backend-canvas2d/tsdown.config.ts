import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/snapshot.ts'],
  format: 'esm',
  dts: true,
  hash: false,
  clean: true,
  external: [/^@glissade\//],
});
