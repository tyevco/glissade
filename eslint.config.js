// Determinism lint (DESIGN.md §5.5): the @glissade/eslint-plugin rules applied
// to the pure evaluation substrate (core + scene src). The Yoga layout loader
// is the one sanctioned async seam (§3.2, wasm load — outside evaluate()), so
// it is excluded from the no-async rule; the §3.6 font-validation bridge
// (fontUsage.ts) is the other — it loads font cmap bytes via the caller's I/O,
// strictly outside evaluate().
import tsParser from '@typescript-eslint/parser';
import glissade from '@glissade/eslint-plugin';

export default [
  {
    files: ['packages/core/src/**/*.ts', 'packages/scene/src/**/*.ts'],
    ignores: ['packages/scene/src/layout.ts', 'packages/scene/src/layoutEngine.ts', 'packages/scene/src/fontUsage.ts'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
    plugins: { gas: glissade },
    rules: {
      'gas/no-wall-clock': 'error',
      'gas/no-unseeded-random': 'error',
      'gas/no-async-in-evaluate': 'error',
    },
  },
];
