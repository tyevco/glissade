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
  gs diff <scene-module> --at <t> --against <baseline.dl.json|.png>
  gs dev <scene-module> [--record] [--port <n>]
  gs import <lottie.json|asset.svg> [--out <dir>] [--allow-degraded]
  gs narrate <scene-module|script.narration.json> [--provider <id>] [--align <id>] [--force]
  gs narration-lint <scene-module|script.narration.timing.json> [--json] [--fix] [--max-cps <n>]
  gs sfx <scene-module|script.sfx.json> [--verbose]
  gs prepare <scene-module>  [--provider <id>] [--align <id>] [--force]
  gs measure-loudness <scene-module> [--profile <youtube|shorts|podcast|broadcast|ebu>]

render options:
  --out <path>     output directory for a PNG sequence, or .mp4/.webm (needs ffmpeg). default: ./out
  --fps <n>        frames per second (default: timeline fps, else 60)
  --range <a..b>   integer FRAME indices to render, inclusive (default: whole timeline)
  --frame <n>      render a single frame; --out foo.png writes that one file, --out <dir> writes a PNG into it
  --format png-seq force a PNG sequence even when --out looks like a video
  --workers <n>    shard the frame range across n separate render processes, then concat (§5.6; video out only).
                   byte-identical to a single-worker render at the frame level. Helps CPU-bound, per-frame-cheap
                   scenes; a single render is already internally multi-threaded, so bandwidth-bound / blur-heavy
                   scenes (the bus is already saturated) gain little — shards just contend for memory bandwidth
  --lossless-intermediate  render shards as FFV1 + one final encode — the guaranteed byte-correct join
                   (auto-enabled when the encoder can't honor precise boundary keyframes, e.g. mpeg4/openh264)
  --allow-gpu-shards  permit sharding a scene with GPU/shader nodes (output is not reproducible across shards; §3.7)
  --trace <file>   replay an InputTrace and bake it (machine scenes, §A.6)
  --state <name>   render one machine state's timeline linearly
  --force          downgrade a trace hash mismatch to a warning
  --captions <m>   burn (default) | sidecar | off; burn/sidecar also write .srt/.vtt
  --narration <m>  auto (default): mix the voice from a sibling *.narration.timing.json | off
  --music <m>      auto (default): mix a sibling *.music.timing.json bed, ducked under narration | off
  --sfx <m>        auto (default): mix effect hits from a sibling *.sfx.timing.json | off
  --loudness <m>   auto (default): apply a committed *.loudness.json publish gain (pure scalar; gs measure-loudness)
                   | off. A stale mixHash (mix inputs changed since measure) HARD-THROWS — re-run gs measure-loudness
  --chapters <m>   vtt: also write WebVTT chapters from cue markers (cues.json is always written when cues exist)
                   (YouTube needs the 1st chapter at 0:00 — auto-anchored — and each chapter >= 10s; author cue ts accordingly)
  --chapters-kind <k[,k]>  cue kinds that become VTT chapters (default: chapter); cues.json keeps all kinds
  --strict         fail on an unregistered font family or an uncovered glyph (§3.6; default: warn)

diff options (DisplayList diff vs a committed baseline — exits non-zero on any divergence):
  --at <t>         time in SECONDS to evaluate the scene at (required)
  --against <p>    baseline to compare to: <name>.dl.json (command-level structural diff)
                   or <name>.png (raw encodePng byte-compare only — no pixel-diff)
  --snapshot <p>   instead of diffing, write the scene's .dl.json snapshot at --at to <p>

dev options:
  --record         add a Record button; writes .trace.json sidecars next to the module
  --port <n>       listen port (default: any free port)

import options (.json = Lottie; .svg = static SVG → a scene that defers to @glissade/svg):
  --out <dir>          output directory for the generated scene module (default: .)
  --allow-degraded     (Lottie only) downgrade degradable rejections (expressions, merge-paths modes != 1) to warnings

measure-loudness options (the explicit publish-loudness measure step; commits *.loudness.json):
  --profile <id>   youtube (default) | shorts (both -14 LUFS) | podcast (-16) | broadcast/ebu (-23); all cap at -1 dBTP
                   measures the final mix (ebur128) and commits a deterministic peak-clamped gain; render applies it
                   as a pure scalar. Needs ffmpeg. Brickwall limiter deferred — peaky un-normalized profiles warn.

narrate options (the explicit TTS prepare step; render itself stays offline):
  --provider <id>  fake | espeak | piper | kokoro | openai (default: the script's provider, else espeak)
                   (kokoro = Apache-2.0 offline neural voice; add 'kokoro-js' to your project; pnpm: allow its native build scripts)
  --align <id>     heuristic (default) | vosk | none — word timings for providers that emit none
  --force          ignore the cache and re-synthesize every segment

narration-lint options (lint the committed *.narration.timing.json + the real caption geometry; exits non-zero on a Tier-1 issue):
  --max-cps <n>    reading-speed ceiling in chars-per-second (default: 17)
  --max-lines <n>  caption maxLines for the fit rule (default: 2, captionNode's own default)
  --json           machine-readable diagnostics ({ hasErrors, diagnostics })
  --no-warnings    omit Tier-2 (warn-only) diagnostics
  --fix            print a git-apply-able budget-bump diff for the SCRIPT (never writes a committed artifact)
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'render' && command !== 'diff' && command !== 'dev' && command !== 'import' && command !== 'narrate' && command !== 'narration-lint' && command !== 'sfx' && command !== 'prepare' && command !== 'measure-loudness') {
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

  // narration-lint: lint the committed timing manifest + the real caption
  // geometry; exit non-zero on a Tier-1 issue. Self-contained (clean hand-merge).
  if (command === 'narration-lint') {
    const { narrationLintCommand } = await import('./narrationLintCommand.js');
    const maxCpsFlag = flags.get('max-cps');
    if (maxCpsFlag !== undefined && (maxCpsFlag === '' || !Number.isFinite(Number(maxCpsFlag)))) {
      fail(`--max-cps must be a number, got '${maxCpsFlag}'`);
    }
    const maxLinesFlag = flags.get('max-lines');
    if (maxLinesFlag !== undefined && !/^\d+$/.test(maxLinesFlag)) {
      fail(`--max-lines must be a non-negative integer, got '${maxLinesFlag}'`);
    }
    try {
      const result = await narrationLintCommand({
        input: modulePath,
        ...(maxCpsFlag !== undefined ? { maxCps: Number(maxCpsFlag) } : {}),
        ...(maxLinesFlag !== undefined ? { maxLines: Number(maxLinesFlag) } : {}),
        ...(flags.has('json') ? { json: true } : {}),
        ...(flags.has('fix') ? { fix: true } : {}),
        ...(flags.has('no-warnings') ? { noWarnings: true } : {}),
      });
      process.stdout.write(result.output);
      if (result.hasErrors) process.exit(1);
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

  // measure-loudness: self-contained block (added per the 0.12 loudness card —
  // sibling subcommand additions hand-merge cleanly around this).
  if (command === 'measure-loudness') {
    const { measureLoudnessCommand } = await import('./loudness.js');
    try {
      const result = await measureLoudnessCommand({
        modulePath,
        ...(flags.has('profile') ? { profile: flags.get('profile')! } : {}),
        ...(flags.get('narration') === 'off' ? { narration: 'off' as const } : {}),
        ...(flags.get('music') === 'off' ? { music: 'off' as const } : {}),
        ...(flags.get('sfx') === 'off' ? { sfx: 'off' as const } : {}),
      });
      const m = result.measurement;
      process.stderr.write(
        `gs measure-loudness: profile '${m.profileId}' — ` +
          `in ${m.inputI} LUFS / ${m.inputTp} dBTP → gain ${m.gain >= 0 ? '+' : ''}${m.gain} dB ` +
          `(out ~${(m.inputI + m.gain).toFixed(2)} LUFS / ~${(m.inputTp + m.gain).toFixed(2)} dBTP) → ${result.loudnessPath}\n`,
      );
      if (result.warning) process.stderr.write(`gs measure-loudness: warning: ${result.warning}\n`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (command === 'diff') {
    const atRaw = flags.get('at');
    if (atRaw === undefined || atRaw === '') fail(`diff needs --at <seconds>\n${USAGE}`);
    const at = Number(atRaw);
    if (!Number.isFinite(at)) fail(`--at must be a number of seconds, got '${atRaw}'`);
    const snapshotOut = flags.get('snapshot');
    if (snapshotOut !== undefined && snapshotOut !== '') {
      const { snapshotAt } = await import('./diff.js');
      try {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(snapshotOut, await snapshotAt(modulePath, at));
        process.stderr.write(`gs diff: wrote snapshot @ ${at}s → ${snapshotOut}\n`);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    const against = flags.get('against');
    if (against === undefined || against === '') fail(`diff needs --against <baseline.dl.json|.png>\n${USAGE}`);
    const { diffCommand } = await import('./diff.js');
    try {
      const result = await diffCommand({ modulePath, at, against });
      process.stdout.write(`${result.report}\n`);
      if (!result.equal) process.exit(1);
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
  let workers: number | undefined;
  const workersFlag = flags.get('workers');
  if (workersFlag !== undefined) {
    if (!/^\d+$/.test(workersFlag) || Number(workersFlag) < 1) {
      fail(`--workers must be a positive integer, got '${workersFlag}'`);
    }
    workers = Number(workersFlag);
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
      ...(flags.get('chapters') === 'vtt' ? { chapters: 'vtt' as const } : {}),
      ...(flags.has('chapters-kind')
        ? { chapterKinds: new Set(flags.get('chapters-kind')!.split(',').map((s) => s.trim()).filter(Boolean)) }
        : {}),
      ...(flags.has('trace') ? { trace: flags.get('trace')! } : {}),
      ...(flags.has('state') ? { state: flags.get('state')! } : {}),
      ...(flags.has('force') ? { force: true } : {}),
      ...(flags.has('strict') ? { strictFonts: true } : {}),
      ...(workers !== undefined ? { workers } : {}),
      ...(flags.has('lossless-intermediate') ? { losslessIntermediate: true } : {}),
      ...(flags.has('allow-gpu-shards') ? { allowGpuShards: true } : {}),
      captions: parseCaptionsModeOrFail(flags.get('captions')),
      narration: flags.get('narration') === 'off' ? ('off' as const) : ('auto' as const),
      music: flags.get('music') === 'off' ? ('off' as const) : ('auto' as const),
      sfx: flags.get('sfx') === 'off' ? ('off' as const) : ('auto' as const),
      loudness: flags.get('loudness') === 'off' ? ('off' as const) : ('auto' as const),
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
