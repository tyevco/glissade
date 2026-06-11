#!/usr/bin/env node
/**
 * gs — the glissade CLI (DESIGN.md §5.7).
 *   gs render <scene-module> [--out <dir|file.mp4|file.webm>] [--fps N] [--range a..b]
 */

import { render } from './render.js';

function fail(msg: string): never {
  console.error(`gs: ${msg}`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else {
        // boolean flags (--record, --force) must not eat the next flag
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags.set(a.slice(2), next);
          i++;
        } else flags.set(a.slice(2), '');
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

const USAGE = `usage:
  gs render <scene-module> [options]
  gs dev <scene-module> [--record] [--port <n>]

render options:
  --out <path>     output directory for a PNG sequence, or .mp4/.webm (needs ffmpeg). default: ./out
  --fps <n>        frames per second (default: timeline fps, else 60)
  --range <a..b>   seconds to render (default: 0..duration)
  --trace <file>   replay an InputTrace and bake it (machine scenes, §A.6)
  --state <name>   render one machine state's timeline linearly
  --force          downgrade a trace hash mismatch to a warning

dev options:
  --record         add a Record button; writes .trace.json sidecars next to the module
  --port <n>       listen port (default: any free port)
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'render' && command !== 'dev') {
    console.error(USAGE);
    process.exit(command === undefined || command === 'help' || command === '--help' ? 0 : 1);
  }
  const { positional, flags } = parseArgs(rest);
  const modulePath = positional[0];
  if (!modulePath) fail(`missing <scene-module>\n${USAGE}`);

  if (command === 'dev') {
    const { dev } = await import('./dev.js');
    const portFlag = flags.get('port');
    const server = await dev({
      modulePath,
      ...(portFlag ? { port: parseInt(portFlag, 10) } : {}),
      record: flags.has('record'),
    });
    process.stderr.write(`gs dev: http://localhost:${server.port}/${flags.has('record') ? '  (recording UI on)' : ''}\n`);
    return; // keeps serving until ^C
  }

  let range: [number, number] | undefined;
  const rangeFlag = flags.get('range');
  if (rangeFlag) {
    const m = /^([\d.]+)\.\.([\d.]+)$/.exec(rangeFlag);
    if (!m) fail(`--range must be 'a..b' in seconds, got '${rangeFlag}'`);
    range = [parseFloat(m[1]!), parseFloat(m[2]!)];
  }

  const fpsFlag = flags.get('fps');
  const started = performance.now();
  try {
    const result = await render({
      modulePath,
      out: flags.get('out') ?? 'out',
      ...(fpsFlag ? { fps: parseInt(fpsFlag, 10) } : {}),
      ...(range ? { range } : {}),
      ...(flags.has('trace') ? { trace: flags.get('trace')! } : {}),
      ...(flags.has('state') ? { state: flags.get('state')! } : {}),
      ...(flags.has('force') ? { force: true } : {}),
      onProgress: (n, total) => {
        if (n % 30 === 0 || n === total) {
          process.stderr.write(`\rrendering ${n}/${total} frames`);
        }
      },
    });
    const secs = ((performance.now() - started) / 1000).toFixed(2);
    process.stderr.write(`\rrendered ${result.frames} frames in ${secs}s → ${result.out}\n`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

void main();
