import { defineConfig } from 'tsdown';
import { createRequire } from 'node:module';

// Lockstep `0.x` versioning: scene's own package version IS the glissade version
// describe() reports. Substitute it at build (from package.json — the single
// source of truth) so the manifest can never drift from the published version.
const { version } = createRequire(import.meta.url)('./package.json') as { version: string };

export default defineConfig({
  entry: ['src/index.ts', 'src/layout.ts', 'src/path.ts', 'src/describe.ts'],
  format: 'esm',
  dts: true,
  hash: false,
  clean: true,
  external: [/^@glissade\//, 'yoga-layout/load'],
  plugins: [
    {
      // Replace the version sentinel only in describe.ts. A plain string-literal
      // swap is bundler-agnostic (no reliance on `define` member-expr matching);
      // the `0.0.0-dev` fallback in source keeps vitest / unbuilt runs working.
      name: 'glissade-describe-version',
      transform(code, id) {
        if (!id.endsWith('describe.ts') || !code.includes('__GLISSADE_VERSION__')) return null;
        return { code: code.split('__GLISSADE_VERSION__').join(version), map: null };
      },
    },
  ],
});
