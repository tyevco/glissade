/**
 * Tiny positional/flag argv parser for the `gs` CLI. Extracted from cli.ts so it
 * is unit-testable without importing the CLI entry point (which runs main() on
 * import).
 */

// Boolean flags never consume the next token (they take no value). Without this,
// the value-or-bool heuristic below would let `gs render --cache scene.js` greedily
// swallow the scene path as `--cache`'s value, leaving no positional module path.
export const KNOWN_BOOLEAN_FLAGS = new Set<string>([
  'record',
  'force',
  'strict',
  'cache',
  'certify', // gs render --certify (0.62): emit the determinism cert + populate the cache
  'cert-cache', // gs render --cert-cache[=<dir>] (0.62): the content-addressed render cache
  'json',
  'fix',
  'no-warnings',
  'lossless-intermediate',
  'incremental',
  'allow-gpu-shards',
  'allow-system-fonts',
  'verbose',
  'allow-degraded',
  'bisect',
  'watch',
  'write',
  'keep-voice',
  'help',
  'lottie',
  'lint', // gs describe --lint (0.47): drift-guard the manifest vs the window.glissade surface
  'global', // gs types --global (0.47): emit the ambient window.glissade .d.ts
  'iife', // alias of --global
  'update-baseline', // gs parity --update-baseline: re-pin the known-drop baseline
  'semantic', // gs parity --semantic: the structured Skia↔Lottie round-trip drop-diff
  'all', // gs parity --semantic --all: show every finding (not just error-only view)
]);

export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else {
        const name = a.slice(2);
        // a known boolean flag (--record, --force, --cache) NEVER eats the next
        // token; an unknown/value flag takes the next token unless it's a --flag
        const next = argv[i + 1];
        if (!KNOWN_BOOLEAN_FLAGS.has(name) && next !== undefined && !next.startsWith('--')) {
          flags.set(name, next);
          i++;
        } else flags.set(name, '');
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}
