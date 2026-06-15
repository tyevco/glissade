#!/usr/bin/env node
/**
 * gs — the glissade CLI (DESIGN.md §5.7).
 *   gs render <scene-module> [--out <dir|file.mp4|file.webm>] [--fps N] [--range a..b]
 */

import { render, parseFrameRange } from './render.js';
import { parseCaptionsMode, type CaptionsMode } from './captions.js';

function fail(msg: string): never {
  console.error(`gs: ${msg}`);
  process.exit(1);
}

function parseCaptionsModeOrFail(raw: string | undefined): CaptionsMode {
  try {
    return parseCaptionsMode(raw);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
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
  gs import <lottie.json|asset.svg> [--out <dir>] [--allow-degraded]
  gs narrate <scene-module|script.narration.json> [--provider <id>] [--align <id>] [--force]
  gs sfx <scene-module|script.sfx.json> [--verbose]
  gs prepare <scene-module>  [--provider <id>] [--align <id>] [--force]

render options:
  --out <path>     output directory for a PNG sequence, or .mp4/.webm (needs ffmpeg). default: ./out
  --fps <n>        frames per second (default: timeline fps, else 60)
  --range <a..b>   integer FRAME indices to render, inclusive (default: whole timeline)
  --frame <n>      render a single frame index (a still, through the same path)
  --format png-seq force a PNG sequence even when --out looks like a video
  --trace <file>   replay an InputTrace and bake it (machine scenes, §A.6)
  --state <name>   render one machine state's timeline linearly
  --force          downgrade a trace hash mismatch to a warning
  --captions <m>   burn (default) | sidecar | off; burn/sidecar also write .srt/.vtt
  --narration <m>  auto (default): mix the voice from a sibling *.narration.timing.json | off
  --music <m>      auto (default): mix a sibling *.music.timing.json bed, ducked under narration | off
  --sfx <m>        auto (default): mix effect hits from a sibling *.sfx.timing.json | off

dev options:
  --record         add a Record button; writes .trace.json sidecars next to the module
  --port <n>       listen port (default: any free port)

import options (.json = Lottie; .svg = static SVG → a scene that defers to @glissade/svg):
  --out <dir>          output directory for the generated scene module (default: .)
  --allow-degraded     (Lottie only) downgrade degradable rejections (expressions, merge-paths modes != 1) to warnings

narrate options (the explicit TTS prepare step; render itself stays offline):
  --provider <id>  fake | espeak | piper | openai (default: the script's provider, else espeak)
  --align <id>     heuristic (default) | vosk | none — word timings for providers that emit none
  --force          ignore the cache and re-synthesize every segment
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'render' && command !== 'dev' && command !== 'import' && command !== 'narrate' && command !== 'sfx' && command !== 'prepare') {
    console.error(USAGE);
    process.exit(command === undefined || command === 'help' || command === '--help' ? 0 : 1);
  }
  const { positional, flags } = parseArgs(rest);
  const modulePath = positional[0];
  if (!modulePath) fail(`missing ${command === 'import' ? '<lottie.json|asset.svg>' : '<scene-module>'}\n${USAGE}`);

  if (command === 'narrate') {
    const { narrateCommand } = await import('./narrate.js');
    try {
      const result = await narrateCommand({
        input: modulePath,
        ...(flags.has('provider') ? { provider: flags.get('provider')! } : {}),
        ...(flags.has('align') ? { aligner: flags.get('align')! } : {}),
        ...(flags.has('force') ? { force: true } : {}),
      });
      const parts = [
        result.synthesized.length > 0 ? `synthesized ${result.synthesized.join(', ')}` : null,
        result.reused.length > 0 ? `reused ${result.reused.length} cached` : null,
        result.aligned.length > 0 ? `aligned ${result.aligned.length} via ${result.aligner}` : null,
      ].filter(Boolean);
      process.stderr.write(`gs narrate: ${parts.join('; ') || 'nothing to do'} → ${result.timingPath}\n`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (command === 'prepare') {
    const { prepareCommand } = await import('./prepare.js');
    try {
      const result = await prepareCommand({
        input: modulePath,
        ...(flags.has('provider') ? { provider: flags.get('provider')! } : {}),
        ...(flags.has('align') ? { aligner: flags.get('align')! } : {}),
        ...(flags.has('force') ? { force: true } : {}),
      });
      process.stderr.write(`gs prepare: ${result.notes.join('; ') || 'nothing to prepare'}\n`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (command === 'sfx') {
    const { prepareSfx, sfxScriptPathFor } = await import('./sfx.js');
    try {
      const result = prepareSfx(sfxScriptPathFor(modulePath));
      process.stderr.write(
        `gs sfx: ${result.clipCount} ${result.clipCount === 1 ? 'hit' : 'hits'}, ` +
          `${result.voices.length} ${result.voices.length === 1 ? 'voice' : 'voices'} rendered → ${result.timingPath}\n`,
      );
      if (flags.has('verbose')) {
        for (const c of result.clips) {
          const extra = [
            c.gain !== undefined ? `gain ${c.gain.toFixed(2)}` : null,
            c.playbackRate !== undefined ? `rate ${c.playbackRate.toFixed(3)}` : null,
          ].filter(Boolean);
          process.stderr.write(
            `  ${c.at.toFixed(3)}s  ${c.voice}${extra.length ? `  (${extra.join(', ')})` : ''}\n`,
          );
        }
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (command === 'import') {
    const { importCommand } = await import('./import.js');
    try {
      const result = await importCommand({
        input: modulePath,
        out: flags.get('out') ?? '.',
        allowDegraded: flags.has('allow-degraded'),
      });
      for (const w of result.warnings) process.stderr.write(`gs import: warning: ${w}\n`);
      process.stderr.write(`gs import: wrote ${result.out}\n`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

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

  // --range is frame-indexed (§5: export APIs take frames; Player APIs take seconds)
  let frameRange: [number, number] | undefined;
  const rangeFlag = flags.get('range');
  if (rangeFlag) {
    try {
      frameRange = parseFrameRange(rangeFlag);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }
  const frameFlag = flags.get('frame');
  let frame: number | undefined;
  if (frameFlag !== undefined) {
    if (!/^\d+$/.test(frameFlag)) fail(`--frame must be a non-negative integer frame index, got '${frameFlag}'`);
    frame = Number(frameFlag);
  }
  const formatFlag = flags.get('format');
  if (formatFlag !== undefined && formatFlag !== 'png-seq') {
    fail(`--format must be 'png-seq', got '${formatFlag}'`);
  }
  if (flags.has('workers')) {
    process.stderr.write('note: --workers is accepted but parallel sharding is not yet implemented; rendering single-threaded\n');
  }
  if (flags.has('watch')) {
    process.stderr.write('note: --watch is not yet implemented in this release; rendering once\n');
  }

  const fpsFlag = flags.get('fps');
  const started = performance.now();
  try {
    const result = await render({
      modulePath,
      out: flags.get('out') ?? 'out',
      ...(fpsFlag ? { fps: parseInt(fpsFlag, 10) } : {}),
      ...(frame !== undefined ? { frame } : {}),
      ...(frameRange ? { frameRange } : {}),
      ...(formatFlag === 'png-seq' ? { format: 'png-seq' as const } : {}),
      ...(flags.has('trace') ? { trace: flags.get('trace')! } : {}),
      ...(flags.has('state') ? { state: flags.get('state')! } : {}),
      ...(flags.has('force') ? { force: true } : {}),
      captions: parseCaptionsModeOrFail(flags.get('captions')),
      narration: flags.get('narration') === 'off' ? ('off' as const) : ('auto' as const),
      music: flags.get('music') === 'off' ? ('off' as const) : ('auto' as const),
      sfx: flags.get('sfx') === 'off' ? ('off' as const) : ('auto' as const),
      onProgress: (n, total) => {
        // TTY: live \r line; piped/CI: sparse newline-terminated updates
        if (process.stderr.isTTY) {
          if (n % 30 === 0 || n === total) process.stderr.write(`\rrendering ${n}/${total} frames`);
        } else if (n % 300 === 0 || n === total) {
          process.stderr.write(`rendering ${n}/${total} frames\n`);
        }
      },
    });
    const secs = ((performance.now() - started) / 1000).toFixed(2);
    const cr = process.stderr.isTTY ? '\r' : '';
    process.stderr.write(`${cr}rendered ${result.frames} frames in ${secs}s → ${result.out}\n`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

void main();
