#!/usr/bin/env node
/**
 * gs — the glissade CLI (DESIGN.md §5.7).
 *   gs render <scene-module> [--out <dir|file.mp4|file.webm>] [--fps N] [--range a..b]
 */

import { render, parseFrameRange, renderLocales, parseLocalesList, LocaleArgsError } from './render.js';
import { parseCaptionsMode, type CaptionsMode } from './captions.js';
import { parseArgs } from './args.js';
import type { ApiManifest } from '@glissade/scene/describe';

function fail(msg: string): never {
  console.error(`gs: ${msg}`);
  process.exit(1);
}

/** Validate --fps: a non-positive fps silently renders the WRONG frame
 *  (t = frame/0 = Infinity clamps to the timeline end) — fail loud instead. */
function parseFpsOrFail(raw: string): number {
  const fps = Number(raw);
  if (!Number.isFinite(fps) || fps <= 0) {
    fail(`--fps must be a positive number, got '${raw}'`);
  }
  return fps;
}

function parseCaptionsModeOrFail(raw: string | undefined): CaptionsMode {
  try {
    return parseCaptionsMode(raw);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

const USAGE = `usage:
  gs render <scene-module> [options]
  gs diff <scene-module> --at <t> --against <baseline.dl.json|.png>
  gs critique <scene-module> [--json]   machine-readable RENDERED diagnostics (OFF_CANVAS/TEXT_OVERFLOW/OCCLUSION) from the DisplayList — the rendered-geometric half of validateScene; samples an integer-frame grid, prints the flat canonically-sorted diagnostics (--json for the raw result)
  gs critique --by-beat <scene-module> --timing <narration.timing.json> [--json]   the SAME diagnostics, GROUPED by the narration beat that owns each flagged node (node-entrance keyframe → committed timing window); full-duration-span nodes → '[likely FRAME-owned]', keyframeless nodes → 'unattributed [no entrance keyframe]' (locate by node-id, not frame-owned), node-less → 'static' (no bucket is ever a silent seg-0); non-mutating
  gs verify-determinism <scene-module> [--shards <n>] [--against <frames.manifest>] [--range a..b] [--bisect] [--emit <p>]
  gs dev <scene-module> [--record] [--port <n>]
  gs import <lottie.json|asset.svg> [--out <dir>] [--allow-degraded]
  gs scaffold <narration.timing.json> [--out <dir>] [--force] [--frame <module>]   # → a first-draft beat-skeleton scene module to refine (--frame wraps it in your episode frame's scaffoldFrame adapter)
  gs export --lottie <scene-module> --out <file.json> [--width <n>] [--height <n>] [--fps <n>]
  gs narrate <scene-module|script.narration.json> [--provider <id>] [--align <id>] [--force]
  gs narration-lint <scene-module|script.narration.timing.json> [--json] [--fix] [--max-cps <n>]
  gs sfx <scene-module|script.sfx.json> [--verbose]
  gs prepare <scene-module>  [--provider <id>] [--align <id>] [--force]
  gs measure-loudness <scene-module> [--profile <youtube|shorts|podcast|broadcast|ebu>] [--locale <code>]
  gs master <glissade.master.json>   SERIES loudness: measure all members, pick the loudest shared LUFS target the set hits under a shared true-peak ceiling, ship the brickwall limiter, write <scene>.loudness.json ×N (applies as a mix-only remux; mixHash unchanged)
  gs fonts audit <scene-module>   list registered families, formats, and missing-glyph runs (§3.6)
  gs cache verify <scene-module> [--range a..b] [--sample <n>]   assert cache hits == cold renders (§3.5)
  gs mcp <scene-module>   start an MCP stdio server for this scene: describe / list_targets / apply_patch / undo / render_frame (the AI-native write layer)
  gs build [filter...] [--config <glissade.config.ts>] [--affected <git-ref>] [--explain]   content-graph DAG runner: narrate→sfx→loudness→render per scene, runs ONLY the stale subtree. --affected <ref> pre-filters to scenes a git diff since <ref> touched (rebuild only what a change set touched; composed with the per-step content-hash staleness)
  gs describe [--out <api.json>] [--examples] [--lint]   snapshot THIS engine's describe() API manifest (stdout, or --out to a file) — the input to gs migrate. --lint reconciles the manifest against the window.glissade runtime surface (every helper/node/surface member resolves, no type surfaced as a value, no arity drift) and exits non-zero on drift
  gs types [--out <file.ts>] [--from <api.json>] [--check] [--global]   codegen a type-checked track() SDK from the describe() manifest: only registered animatable paths + their value types compile, so a typo'd path or wrong value-type id is a COMPILE error (import track from the generated file). --check fails if --out is stale. Zero-runtime (types + a re-typed re-export of the real track). --global (alias --iife) instead emits a SELF-CONTAINED ambient window.glissade .d.ts for the no-build <script src> author (typed IIFE surface — a typo'd window.glissade member is a compile error)
  gs migrate <baseline-api.json> [--json] [--check]   diff a saved API manifest against the current engine: moved imports / removed / added / changed, with a suggested fix per breaking item (advisory; --check exits non-zero on any breaking change for CI gating)
  gs repin <scene-module> --golden <dir> [--name <p>] [--frames a,b,..] [--fps <n>] [--since <ref>] [--write] [--only a,b] [--heatmap <dir>] [--floor <ssim>] [--force]   narration-aware golden reviewer: render current vs committed goldens, report perceptual delta + the re-narration cause, re-pin only frames you allow (default dry-run; --floor refuses a bigger-than-expected drop)
  gs parity <scene-module> [--backends skia,lottie] [--frames a,b,..] [--fps <n>] [--width <n>] [--height <n>] [--heatmap <dir>] [--min <ssim>] [--baseline <file>] [--update-baseline] [--tolerance <eps>]   cross-backend perceptual review: render ONE scene across backends and report per-frame SSIM vs the Skia reference + the worst 8×8 tile (skia = reference, lottie = export↔import round-trip). --heatmap writes a thermal PNG per frame; --min is the SSIM floor (default 0.98) — a below-floor frame exits non-zero. --baseline turns it into a KNOWN-DROP regression gate: compare each mean vs a committed per-scene baseline of EXPECTED drops and fail ONLY on a deviation (a new/worse drop), so documented scope-outs that legitimately fail the floor PASS while a real regression FAILs; --update-baseline (re)writes that baseline from the live run; --tolerance is the expected-SSIM band (default 1e-4). --baseline takes precedence over --min. (dom = Phase B, not yet shipped)
  gs parity <scene-module> --semantic [--all] [--frames a,b,..] [--fps <n>] [--width <n>] [--height <n>] [--min <ssim>] [--baseline <file>] [--update-baseline] [--json]   the STRUCTURED Skia↔Lottie round-trip drop-diff: fuse the exporter's own warn-list (which element dropped + why) with the SSIM residual localized to each node's rendered bbox → source:'parity' diagnostics (LOTTIE_DROP/APPROXIMATE = warn-explained expected drops masked from the default view; ANCHOR_RECENTER = report-only; UNEXPLAINED_RESIDUAL = a residual with NO matching warn, the only thing in the default error-only view). --all shows every finding; --baseline pins the expected-drop keys (a NEW expected drop still flags); --update-baseline re-pins
  gs localize <scene-module> --to <locale> [--from <locale>] [--write] [--strict] [--keep-voice] [--tm] [--json]   fork a narration into a new locale (clone segment/pause structure, PRESERVING beat ids so .start() anchors survive) + stub messages.<locale>.json from the scene's t() ids, running the render path's parity + localize checks BEFORE any TTS. Default dry-run (exits non-zero on drift); --write emits <base>.<locale>.narration.json + messages.<locale>.json (re-localize CARRIES existing translations over — never clobbers); --strict refuses to write on a preflight failure; --tm classifies carried translations against a .tm.<locale>.json sidecar (source-hash memory) → surfaces ONLY the STALE ones whose EN source changed since they were translated, and rewrites the sidecar on --write
  gs --version   print the engine version

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
  --incremental    dirty-beat: re-render ONLY the frames whose per-frame key changed since the last render, splicing
                   the rest verbatim from a retained FFV1 intermediate (video out only). WINS the re-narrate / move-one-
                   beat edit that MISSES the whole-frame cache: a timing shift changes every downstream frame's key, so
                   the cache re-renders all of them — incremental re-renders only the changed run. A warm splice is
                   byte-identical to a cold --incremental render. First run builds the intermediate; edits splice it
  --cache[=<dir>]  persistent whole-frame raster cache in <dir> (default .gscache; §3.5). OFF by default — opting in
                   never changes output, only speed. A hit serves a stored frame byte-identical to a cold render.
                   WINS: repeated renders + the UNCHANGED-PREFIX of a single-segment edit. Does NOT win a re-narrate —
                   that shifts every frame's timing, so every DisplayList changes and every frame MISSES. Shards share
                   one .gscache. Verify safety with 'gs cache verify'.
  --cache-mode <m> read-write (default with --cache) | read-only (serve hits, never write) | off (bypass = baseline)
  --cache-max-size <bytes|2GB>  LRU size cap; oldest entries evicted when exceeded (default 2GB). Whole-frame RGBA is
                   ~MBs/frame (tens of GB/episode) — the cap keeps .gscache from eating the disk
  --certify        emit the per-frame determinism certificate (<out>.cert.json + <out>.audio-cert.json); populates --cert-cache
  --cert-cache[=<dir>]  content-addressed render cache keyed by certHash (default .gscertcache); a HIT skips render, byte-identical
  --cert-cache-mode <m> read-write (default) | read-only | off
  --verify <cert>  re-render from the cert's inputs and assert every frame's byteHash matches (self-verify the determinism carry)
  --verify-cache <cert> [--sample <n>]  spot-audit: re-render a SAMPLE of the certified frames, confirm byteHash
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
  --allow-system-fonts  exempt true-OS-installed families from the unregistered-family check (host-dependent;
                   off by default, IGNORED under --strict so the strict verdict stays host-independent; §3.6)
  --locale <code>  resolve the scene against messages.<code>.json (node-id text + free-standing t() keys) and prefer
                   the <base>.<code>.narration.timing.json sibling (0.14). No --locale resolves the BASE files
  --locales <a,b>  (0.15) fan out: render the scene ONCE PER comma-separated locale, each over the --locale <code>
                   path, to a DISTINCT per-locale output. A video/png --out gets a locale segment before the
                   extension (out/ep.mp4 → out/ep.<locale>.mp4); a directory --out gets a per-locale subdir
                   (out/ → out/<locale>/). Mutually exclusive with --locale. A locale with NO resolvable assets
                   aborts the whole fan-out with the same UnknownLocaleError --locale throws (never silently skipped)

diff options (DisplayList diff vs a committed baseline — exits non-zero on any divergence):
  --at <t>         time in SECONDS to evaluate the scene at (required)
  --against <p>    baseline to compare to: <name>.dl.json (command-level structural diff)
                   or <name>.png (raw encodePng byte-compare only — no pixel-diff)
  --snapshot <p>   instead of diffing, write the scene's .dl.json snapshot at --at to <p>

verify-determinism options (the cross-shard/backend byte-divergence LOCATOR — exits non-zero on any divergence):
  --shards <n>     diff a linear render vs an n-shard render of the same range (byte-identical is the contract)
  --against <p>    diff against a committed / other-machine frames.manifest (REJECTS a cross-backend byte-compare)
  --range <a..b>   integer FRAME indices to verify, inclusive (default: whole timeline)
  --bisect         drill the first divergence to the exact (frame, node, op) via the command-level diff
  --emit <p>       instead of comparing, write the linear frames.manifest baseline to <p>
                   (byte-equality is Skia↔Skia / cross-machine only — browser↔Skia is perceptual SSIM, not bytes)

dev options:
  --record         add a Record button; writes .trace.json sidecars next to the module
  --port <n>       listen port (default: any free port)

import options (.json = Lottie; .svg = static SVG → a scene that defers to @glissade/svg):
  --out <dir>          output directory for the generated scene module (default: .)
  --allow-degraded     (Lottie only) downgrade degradable rejections (expressions, merge-paths modes != 1) to warnings

export options (--lottie: a glissade scene → a Lottie/bodymovin .json — the inverse of gs import):
  --out <file.json>    output Lottie document (required)
  --width <n>          document width in px (default: the scene size)
  --height <n>         document height in px (default: the scene size)
  --fps <n>            frame rate (default: the timeline fps, else 60). cubicBezier/hold eases round-trip
                       exactly; named eases / springs / expr tracks are sampled to dense linear keys.
                       MVP: Group / Rect / Circle / Path with a solid fill (+ optional stroke); Text,
                       gradient/mesh paint, and images are dropped with a warning

measure-loudness options (the explicit publish-loudness measure step; commits *.loudness.json):
  --profile <id>   youtube (default) | shorts (both -14 LUFS) | podcast (-16) | broadcast/ebu (-23); all cap at -1 dBTP
                   measures the final mix (ebur128) and commits a deterministic peak-clamped gain; render applies it
                   as a pure scalar. Needs ffmpeg. Brickwall limiter deferred — peaky un-normalized profiles warn.
  --locale <code>  (0.15) measure the per-locale mix (the localized narration sibling) and commit
                   <stem>.<locale>.loudness.json. A localized 'gs render --locale <code>' REQUIRES this per-locale
                   file (the base measurement can't gate the per-locale mix). No --locale measures the base mix.

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
  // gs --version / gs version — answer from the live scene registry (the same
  // source describe() reports), so a stale dist can't misreport the engine.
  if (command === '--version' || command === '-v' || command === 'version') {
    const { describe } = await import('@glissade/scene/describe');
    process.stdout.write(`${describe().version}\n`);
    return;
  }
  if (command !== 'render' && command !== 'diff' && command !== 'critique' && command !== 'verify-determinism' && command !== 'dev' && command !== 'import' && command !== 'export' && command !== 'narrate' && command !== 'narration-lint' && command !== 'sfx' && command !== 'prepare' && command !== 'measure-loudness' && command !== 'fonts' && command !== 'cache' && command !== 'mcp' && command !== 'build' && command !== 'describe' && command !== 'migrate' && command !== 'repin' && command !== 'parity' && command !== 'master' && command !== 'localize' && command !== 'types' && command !== 'scaffold') {
    console.error(USAGE);
    process.exit(command === undefined || command === 'help' || command === '--help' ? 0 : 1);
  }

  // gs fonts audit <scene-module> (§3.6) — self-contained font front-door report.
  // Parsed before the generic <scene-module> requirement because its first
  // positional is the subcommand, not the module path.
  if (command === 'fonts') {
    const { positional: fp } = parseArgs(rest);
    const sub = fp[0];
    const sceneModule = fp[1];
    if (sub !== 'audit') fail(`unknown 'fonts' subcommand '${sub ?? ''}' (expected: audit)\n${USAGE}`);
    if (!sceneModule) fail(`fonts audit needs <scene-module>\n${USAGE}`);
    const { fontsAuditCommand } = await import('./fonts.js');
    const { resolveAssetPath } = await import('./audioMix.js');
    try {
      const { text } = await fontsAuditCommand({
        modulePath: sceneModule,
        resolvePath: (url) => resolveAssetPath(url, sceneModule),
      });
      process.stdout.write(`${text}\n`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // gs build [filter...] — the content-graph DAG runner. Reads glissade.config.ts
  // (or --config), derives narrate→sfx→loudness→render per scene, and runs ONLY the
  // stale subtree. Self-contained: no <scene-module> positional (positionals filter).
  if (command === 'build') {
    const { positional: bp, flags: bf } = parseArgs(rest);
    if (bf.has('help')) { process.stdout.write(`${USAGE}\n`); return; }
    const { buildCommand } = await import('./build.js');
    const config = bf.get('config') || 'glissade.config.ts';
    const explain = bf.has('explain');
    // A positional is a scene FILTER (substring), not a config path — flag a mis-passed
    // config file so it doesn't silently fall back to glissade.config.ts + filter nothing.
    if (bp.some((p) => /\.(ts|js|mjs|cjs)$/.test(p))) {
      const { existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      for (const p of bp) {
        if (/\.(ts|js|mjs|cjs)$/.test(p) && existsSync(resolve(process.cwd(), p))) {
          process.stderr.write(`note: '${p}' is a scene FILTER (substring match), not a config path — to point gs build at a config file, use --config ${p}\n`);
        }
      }
    }
    try {
      const r = await buildCommand({
        config,
        explain,
        ...(bp.length ? { only: bp } : {}),
        ...(bf.get('affected') ? { affected: bf.get('affected')! } : {}),
        onLog: (line) => process.stderr.write(`${line}\n`),
      });
      process.stderr.write(
        `gs build: ${r.ran} step${r.ran === 1 ? '' : 's'} ${explain ? 'WOULD run' : 'ran'}, ${r.skipped} fresh, across ${r.scenes} scene${r.scenes === 1 ? '' : 's'}${explain ? ' (--explain: nothing executed)' : ''}\n`,
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // gs master <glissade.master.json> — SERIES-level loudness (shared target +
  // brickwall limiter). Self-contained: its positional is a config path, not a
  // scene module, so it parses before the generic <scene-module> requirement.
  if (command === 'master') {
    const { positional: mp } = parseArgs(rest);
    const configPath = mp[0] || 'glissade.master.json';
    const { masterCommand } = await import('./master.js');
    try {
      const r = await masterCommand({
        configPath,
        onLog: (line) => process.stderr.write(`${line}\n`),
      });
      process.stderr.write(`${r.report}\n`);
      // a member whose verified output true-peak still exceeds the ceiling is a
      // failure to master safely — exit non-zero so a pipeline notices.
      if (r.members.some((m) => m.overCeiling)) process.exit(1);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // gs cache verify <scene-module> (§3.5) — THE persistent-cache verify gate.
  // Self-contained block (mirrors `fonts`): its first positional is the
  // subcommand, not the module path, so it parses before the generic requirement.
  if (command === 'cache') {
    const { positional: cp, flags: cf } = parseArgs(rest);
    const sub = cp[0];
    const sceneModule = cp[1];
    if (sub !== 'verify') fail(`unknown 'cache' subcommand '${sub ?? ''}' (expected: verify)\n${USAGE}`);
    if (!sceneModule) fail(`cache verify needs <scene-module>\n${USAGE}`);
    let cvRange: [number, number] | undefined;
    const cvRangeFlag = cf.get('range');
    if (cvRangeFlag) {
      try {
        cvRange = parseFrameRange(cvRangeFlag);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    }
    const sampleFlag = cf.get('sample');
    if (sampleFlag !== undefined && (!/^\d+$/.test(sampleFlag) || Number(sampleFlag) < 1)) {
      fail(`--sample must be a positive integer (1-of-N frame sampling), got '${sampleFlag}'`);
    }
    const cvFpsFlag = cf.get('fps');
    const { cacheVerifyCommand } = await import('./cacheVerify.js');
    try {
      const result = await cacheVerifyCommand({
        modulePath: sceneModule,
        ...(cvRange ? { frameRange: cvRange } : {}),
        ...(sampleFlag !== undefined ? { sample: Number(sampleFlag) } : {}),
        ...(cvFpsFlag ? { fps: parseFpsOrFail(cvFpsFlag) } : {}),
      });
      process.stdout.write(`${result.report}\n`);
      if (!result.ok) process.exit(1);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // gs describe [--out <file>] — snapshot this engine's describe() API manifest.
  // Self-contained (no <scene-module>): the manifest is the global API taxonomy,
  // not a scene. This is the artifact you commit per release + feed to gs migrate.
  if (command === 'describe') {
    const { flags: df } = parseArgs(rest);
    const { describe } = await import('@glissade/scene/describe');
    if (df.has('examples')) await import('@glissade/scene/examples'); // register the corpus first
    const manifest = describe(df.has('examples') ? { examples: true } : {});
    // --lint: reconcile the manifest against the window.glissade runtime surface and
    // exit non-zero on any drift (a helper/node that doesn't resolve, a type surfaced
    // as a value, an arity mismatch). Headless: the CLI assembles the surface from the
    // embed packages it can reach and exempts the browser-only helpers it can't import
    // (the check:describe CI gate covers those against the built @glissade/browser).
    if (df.has('lint')) {
      const { describeLint, collectRuntimeSurface, exemptFromUnreachable } = await import('./describeLint.js');
      const { surface, unreachable } = await collectRuntimeSurface(manifest);
      const exempt = exemptFromUnreachable(manifest, unreachable);
      const violations = describeLint(manifest, surface, { exempt });
      if (violations.length > 0) {
        process.stderr.write(`gs describe --lint: ${violations.length} violation(s) — describe() drifted from the window.glissade surface:\n`);
        for (const v of violations) process.stderr.write(`  ✗ [${v.kind}] ${v.name}: ${v.detail}\n`);
        process.exit(1);
      }
      const skipped = exempt.size > 0
        ? ` (${exempt.size} browser-only helper(s) not verifiable headlessly — the check:describe CI gate covers them against the built @glissade/browser bundle)`
        : '';
      process.stderr.write(`gs describe --lint: OK — every described node/helper/surface member resolves on the runtime bundle${skipped}\n`);
      return;
    }
    const json = `${JSON.stringify(manifest, null, 2)}\n`;
    const outPath = df.get('out');
    if (outPath) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(outPath, json);
      process.stderr.write(`gs describe: wrote ${manifest.version} API manifest → ${outPath}\n`);
    } else {
      process.stdout.write(json);
    }
    return;
  }

  // gs types [--out <file>] [--from <api.json>] [--check] — codegen a typed `track()`
  // surface from the describe() manifest so a typo'd prop-path or wrong value-type id
  // is a COMPILE error. Reads the LIVE manifest (or a committed --from api.json). The
  // output is types + a re-typed re-export of the real `track` — zero runtime.
  if (command === 'types') {
    const { flags: tf } = parseArgs(rest);
    // --global (alias --iife): emit the SELF-CONTAINED ambient window.glissade .d.ts
    // for the no-build <script src> author, instead of the ESM typed-track() SDK.
    const global = tf.has('global') || tf.has('iife');
    const { generateTypedSdk, generateAmbientDts } = await import('./typedSdk.js');
    const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
    const from = tf.get('from');
    let manifest: import('@glissade/scene/describe').ApiManifest;
    if (from) {
      try {
        manifest = JSON.parse(readFileSync(from, 'utf8')) as import('@glissade/scene/describe').ApiManifest;
      } catch (err) {
        fail(`gs types: could not read manifest '${from}': ${err instanceof Error ? err.message : String(err)}`);
      }
      if (typeof manifest!.version !== 'string' || manifest!.nodes === undefined) {
        fail(`'${from}' is not a describe() API manifest (missing version/nodes)`);
      }
    } else {
      const { describe } = await import('@glissade/scene/describe');
      manifest = describe();
    }
    const src = global ? generateAmbientDts(manifest!) : generateTypedSdk(manifest!);
    const outPath = tf.get('out');
    if (tf.has('check')) {
      if (!outPath) fail(`gs types ${global ? '--global ' : ''}--check needs --out <file> (the committed ${global ? 'ambient .d.ts' : 'typed-SDK'} file to verify)`);
      const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
      if (current !== src) {
        process.stderr.write(`gs types: ${outPath} is STALE — run \`gs types ${global ? '--global ' : ''}--out ${outPath}\` to regenerate\n`);
        process.exit(1);
      }
      process.stderr.write(`gs types: ${outPath} is up to date\n`);
      return;
    }
    if (outPath) {
      writeFileSync(outPath, src);
      process.stderr.write(global
        ? `gs types --global: wrote the self-contained ambient window.glissade .d.ts → ${outPath}\n`
        : `gs types: wrote a typed track() SDK (${Object.keys(manifest!.nodes).length} node types) → ${outPath}\n`);
    } else {
      process.stdout.write(src);
    }
    return;
  }

  // gs migrate <baseline-api.json> — diff a saved manifest against the current
  // engine. The report is generated FROM the real registry, so it can't claim a
  // move that didn't happen (the no-drift guarantee extends to migration).
  if (command === 'migrate') {
    const { positional: mp, flags: mf } = parseArgs(rest);
    const baselinePath = mp[0];
    if (!baselinePath) fail(`gs migrate needs <baseline-api.json> (a manifest from an older 'gs describe --out')\n${USAGE}`);
    const { readFileSync } = await import('node:fs');
    const { describe } = await import('@glissade/scene/describe');
    const { diffManifests, formatReport } = await import('./migrate.js');
    let baseline: ApiManifest;
    try {
      baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as ApiManifest;
    } catch (err) {
      fail(`could not read baseline manifest '${baselinePath}': ${err instanceof Error ? err.message : String(err)}`);
    }
    if (typeof baseline.version !== 'string' || baseline.nodes === undefined) {
      fail(`'${baselinePath}' is not a describe() API manifest (missing version/nodes) — did you point at the right file?`);
    }
    const report = diffManifests(baseline, describe());
    if (mf.has('json')) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatReport(report)}\n`);
    }
    // --check: a CI gate — exit non-zero when the bump has breaking changes, so
    // a pipeline can fail the build on an un-migrated engine (advisory by default)
    if (mf.has('check') && report.summary.breaking > 0) process.exit(1);
    return;
  }

  // gs repin <scene-module> --golden <dir> — the narration-aware golden reviewer.
  // Self-contained (needs --golden + its own comma-list flags); default is a
  // dry-run report, --write re-pins, --floor refuses a bigger-than-expected drop.
  if (command === 'repin') {
    const { positional: rp, flags: rf } = parseArgs(rest);
    const sceneModule = rp[0];
    if (!sceneModule) fail(`gs repin needs <scene-module>\n${USAGE}`);
    const goldenDir = rf.get('golden');
    if (!goldenDir) fail(`gs repin needs --golden <dir> (the committed golden PNG directory)\n${USAGE}`);
    const nums = (raw: string | undefined): number[] | undefined =>
      raw === undefined ? undefined : raw.split(',').map((s) => {
        const n = Number(s.trim());
        if (!Number.isInteger(n) || n < 0) fail(`repin: '${s}' is not a frame number (expected comma-separated non-negative integers)`);
        return n;
      });
    const floorRaw = rf.get('floor');
    let floor: number | undefined;
    if (floorRaw !== undefined) {
      floor = Number(floorRaw);
      if (!(floor >= -1 && floor <= 1)) fail(`repin: --floor must be an SSIM in [-1, 1], got '${floorRaw}'`);
    }
    const { repinCommand } = await import('./repin.js');
    try {
      const result = await repinCommand({
        modulePath: sceneModule,
        goldenDir,
        ...(rf.get('name') ? { name: rf.get('name')! } : {}),
        ...(nums(rf.get('frames')) ? { frames: nums(rf.get('frames'))! } : {}),
        ...(rf.get('fps') ? { fps: parseFpsOrFail(rf.get('fps')!) } : {}),
        ...(rf.get('since') ? { since: rf.get('since')! } : {}),
        ...(rf.has('write') ? { write: true } : {}),
        ...(nums(rf.get('only')) ? { only: nums(rf.get('only'))! } : {}),
        ...(rf.get('heatmap') ? { heatmapDir: rf.get('heatmap')! } : {}),
        ...(floor !== undefined ? { floor } : {}),
        ...(rf.has('force') ? { force: true } : {}),
      });
      process.stdout.write(`${result.report}\n`);
      // exit non-zero when a write was refused below floor (a real regression),
      // or on any staleness in a dry-run (so CI catches un-repinned goldens).
      if (result.blocked > 0 || (!rf.has('write') && result.changed > 0)) process.exit(1);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // gs parity <scene-module> — the cross-backend perceptual reviewer (Phase A).
  // Renders one scene across backends and reports per-frame SSIM vs the Skia
  // reference. Self-contained (its own comma-list flags); exits non-zero when any
  // frame falls below the --min floor. dom fails loud (Phase B, not yet shipped).
  if (command === 'parity') {
    const { positional: pp, flags: pf } = parseArgs(rest);
    const sceneModule = pp[0];
    if (!sceneModule) fail(`gs parity needs <scene-module>\n${USAGE}`);
    const nums = (raw: string | undefined): number[] | undefined =>
      raw === undefined ? undefined : raw.split(',').map((s) => {
        const n = Number(s.trim());
        if (!Number.isInteger(n) || n < 0) fail(`parity: '${s}' is not a frame number (expected comma-separated non-negative integers)`);
        return n;
      });
    const dim = (flagName: string): number | undefined => {
      const raw = pf.get(flagName);
      if (raw === undefined || raw === '') return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) fail(`parity: --${flagName} must be a positive number, got '${raw}'`);
      return n;
    };
    const minRaw = pf.get('min');
    let min: number | undefined;
    if (minRaw !== undefined) {
      min = Number(minRaw);
      if (!(min >= -1 && min <= 1)) fail(`parity: --min must be an SSIM floor in [-1, 1], got '${minRaw}'`);
    }

    // --semantic: the structured Skia↔Lottie round-trip drop-diff (fuses the export
    // warn-list with the SSIM residual per node → source:'parity' diagnostics). A
    // DIFFERENT lane from the cross-backend SSIM reviewer below — dispatch here.
    if (pf.has('semantic')) {
      const { semanticParityCommand } = await import('./semanticParity.js');
      const { existsSync, readFileSync, writeFileSync } = await import('node:fs');
      // --baseline (semantic) pins EXPECTED-drop finding keys as a JSON string[]; a
      // NEW expected drop absent from the pin still flags. --update-baseline re-pins.
      const sBaselinePath = pf.get('baseline');
      const sUpdate = pf.has('update-baseline');
      let sBaseline: string[] | undefined;
      if (sBaselinePath !== undefined && !sUpdate && existsSync(sBaselinePath)) {
        try {
          const raw = JSON.parse(readFileSync(sBaselinePath, 'utf8')) as unknown;
          sBaseline = Array.isArray(raw) ? (raw as string[]) : ((raw as { keys?: string[] }).keys ?? []);
        } catch (err) {
          fail(`parity --semantic: could not read baseline '${sBaselinePath}': ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      try {
        const result = await semanticParityCommand({
          modulePath: sceneModule,
          ...(nums(pf.get('frames')) ? { frames: nums(pf.get('frames'))! } : {}),
          ...(pf.get('fps') ? { fps: parseFpsOrFail(pf.get('fps')!) } : {}),
          ...(dim('width') !== undefined ? { width: dim('width')! } : {}),
          ...(dim('height') !== undefined ? { height: dim('height')! } : {}),
          ...(min !== undefined ? { min } : {}),
          ...(pf.has('all') ? { all: true } : {}),
          ...(sBaseline !== undefined ? { baseline: sBaseline } : {}),
          ...(pf.has('json') ? { json: true } : {}),
        });
        if (sUpdate && sBaselinePath !== undefined) {
          const keys = result.findings
            .filter((f) => f.detail?.expected === true)
            .map((f) => `${f.node ?? ''}|${f.code}|${String(f.detail?.property ?? '')}`);
          writeFileSync(sBaselinePath, `${JSON.stringify([...new Set(keys)].sort(), null, 2)}\n`);
          process.stdout.write(`gs parity --semantic: wrote ${keys.length} expected-drop key(s) → ${sBaselinePath}\n`);
          return;
        }
        process.stdout.write(pf.has('json') ? `${JSON.stringify(result, null, 2)}\n` : `${result.report}\n`);
        // default view gates on UNEXPLAINED residuals (errors); baseline mode also
        // fails on a NEW expected drop.
        if (result.hasErrors || (sBaseline !== undefined && result.newExpected.length > 0)) process.exit(1);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    // known-drop regression gate: --baseline pins EXPECTED drops (gate mode, takes
    // precedence over --min); --update-baseline re-pins the live numbers; --tolerance
    // is the expected-SSIM band. --update-baseline without --baseline fails loud.
    const baselinePath = pf.get('baseline');
    const updateBaseline = pf.has('update-baseline');
    if (updateBaseline && baselinePath === undefined) {
      fail(`parity: --update-baseline needs --baseline <file> (the baseline path to write to)\n${USAGE}`);
    }
    const tolRaw = pf.get('tolerance');
    let tolerance: number | undefined;
    if (tolRaw !== undefined) {
      tolerance = Number(tolRaw);
      if (!(tolerance >= 0) || !Number.isFinite(tolerance)) {
        fail(`parity: --tolerance must be a non-negative number, got '${tolRaw}'`);
      }
    }
    const { parityCommand, parseBackends, ParityBackendError } = await import('./parity.js');
    // dom / unknown backends fail loud HERE (never silently skip a requested backend).
    let backends: string[];
    try {
      backends = parseBackends(pf.get('backends'));
    } catch (err) {
      fail(err instanceof ParityBackendError ? err.message : err instanceof Error ? err.message : String(err));
    }
    const width = dim('width');
    const height = dim('height');
    try {
      const result = await parityCommand({
        modulePath: sceneModule,
        backends,
        ...(nums(pf.get('frames')) ? { frames: nums(pf.get('frames'))! } : {}),
        ...(pf.get('fps') ? { fps: parseFpsOrFail(pf.get('fps')!) } : {}),
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(pf.get('heatmap') ? { heatmapDir: pf.get('heatmap')! } : {}),
        ...(min !== undefined ? { min } : {}),
        ...(baselinePath !== undefined ? { baselinePath } : {}),
        ...(updateBaseline ? { updateBaseline: true } : {}),
        ...(tolerance !== undefined ? { tolerance } : {}),
      });
      process.stdout.write(`${result.report}\n`);
      // --update-baseline is a re-pin (exit 0). --baseline is the regression gate:
      // exit non-zero only on a DEVIATION (a new/worse drop), so documented scope-outs
      // that match their pin PASS. Otherwise the strict --min floor gates the run.
      if (updateBaseline) {
        // re-pin succeeded → exit 0 (default).
      } else if (baselinePath !== undefined) {
        if (result.gateOk !== true) process.exit(1);
      } else if (!result.ok) {
        process.exit(1);
      }
    } catch (err) {
      fail(err instanceof ParityBackendError ? err.message : err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // gs localize <scene-module> --to <locale> — fork a narration into a new locale,
  // stub messages.<locale>.json from the scene's t() ids, and run the render path's
  // parity + localize checks BEFORE any TTS. Dry-run by default; --write emits.
  if (command === 'localize') {
    const { positional: lp, flags: lf } = parseArgs(rest);
    const sceneModule = lp[0];
    if (!sceneModule) fail(`gs localize needs <scene-module>\n${USAGE}`);
    const to = lf.get('to');
    if (!to) fail(`gs localize needs --to <locale> (e.g. --to zh)\n${USAGE}`);
    const { localizeCommand, formatLocalizeReport } = await import('./localize.js');
    try {
      const report = await localizeCommand(sceneModule, {
        to,
        ...(lf.get('from') ? { from: lf.get('from')! } : {}),
        ...(lf.has('write') ? { write: true } : {}),
        ...(lf.has('keep-voice') ? { keepVoice: true } : {}),
        ...(lf.has('strict') ? { strict: true } : {}),
        ...(lf.has('tm') ? { tm: true } : {}),
      });
      process.stdout.write(lf.has('json') ? `${JSON.stringify(report, null, 2)}\n` : `${formatLocalizeReport(report)}\n`);
      // drift is a CI-failing signal: on a dry run always, and on --write only under
      // --strict (which also REFUSED the write). Plain --write is the fix-forward (exit 0).
      if (report.preflight.issues.length > 0 && (!lf.has('write') || lf.has('strict'))) process.exit(1);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  const { positional, flags } = parseArgs(rest);
  const modulePath = positional[0];
  if (!modulePath) fail(`missing ${command === 'import' ? '<lottie.json|asset.svg>' : command === 'scaffold' ? '<narration.timing.json>' : '<scene-module>'}\n${USAGE}`);

  if (command === 'mcp') {
    // the AI-native write layer: a stdio MCP server for this scene (author→render→verify)
    const { startMcpServer } = await import('./mcp.js');
    try {
      await startMcpServer(modulePath);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

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
      const mlLocale = flags.get('locale');
      const result = await measureLoudnessCommand({
        modulePath,
        ...(flags.has('profile') ? { profile: flags.get('profile')! } : {}),
        ...(flags.get('narration') === 'off' ? { narration: 'off' as const } : {}),
        ...(flags.get('music') === 'off' ? { music: 'off' as const } : {}),
        ...(flags.get('sfx') === 'off' ? { sfx: 'off' as const } : {}),
        // 0.15 FIX 2: measure the per-locale mix → commit <stem>.<locale>.loudness.json
        ...(mlLocale !== undefined && mlLocale !== '' ? { locale: mlLocale } : {}),
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

  // critique: machine-readable RENDERED diagnostics (OFF_CANVAS / TEXT_OVERFLOW /
  // OCCLUSION) from the DisplayList — the rendered-geometric half of validateScene.
  // Self-contained block (mirrors diff; hand-merges cleanly).
  if (command === 'critique') {
    const { critiqueCommand } = await import('./critique.js');
    const byBeat = flags.has('by-beat');
    const timingPath = flags.get('timing');
    // fail-loud EARLY: --by-beat is a report OVER a narration manifest.
    if (byBeat && !timingPath) {
      fail('gs critique --by-beat requires --timing <narration.timing.json>');
    }
    try {
      const out = await critiqueCommand({
        modulePath,
        json: flags.has('json'),
        byBeat,
        ...(timingPath ? { timingPath } : {}),
      });
      process.stdout.write(`${out.report}\n`);
      if (out.hasErrors) process.exit(1);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // verify-determinism: the cross-shard/backend byte-divergence locator (§5.5/§5.6).
  // Self-contained block (mirrors diff/measure-loudness; hand-merges cleanly).
  if (command === 'verify-determinism') {
    let frameRange: [number, number] | undefined;
    const rangeFlag = flags.get('range');
    if (rangeFlag) {
      try {
        frameRange = parseFrameRange(rangeFlag);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    }
    const shardsFlag = flags.get('shards');
    let shards: number | undefined;
    if (shardsFlag !== undefined) {
      if (!/^\d+$/.test(shardsFlag) || Number(shardsFlag) < 1) {
        fail(`--shards must be a positive integer, got '${shardsFlag}'`);
      }
      shards = Number(shardsFlag);
    }
    const fpsFlag = flags.get('fps');
    const { verifyDeterminismCommand } = await import('./verifyDeterminism.js');
    try {
      const result = await verifyDeterminismCommand({
        modulePath,
        ...(shards !== undefined ? { shards } : {}),
        ...(flags.has('against') ? { against: flags.get('against')! } : {}),
        ...(frameRange ? { frameRange } : {}),
        ...(flags.has('bisect') ? { bisect: true } : {}),
        ...(flags.has('emit') ? { emit: flags.get('emit')! } : {}),
        ...(fpsFlag ? { fps: parseFpsOrFail(fpsFlag) } : {}),
      });
      process.stdout.write(`${result.report}\n`);
      if (!result.ok) process.exit(1);
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

  if (command === 'scaffold') {
    // Era B: a committed narration timing manifest → a first-draft beat-skeleton
    // scene module the author refines (require-guard + caption/narration wiring +
    // one anchored beat entry per segment; honest // TODO for the frame + bespoke beats).
    const { scaffoldCommand } = await import('./scaffold.js');
    try {
      const result = scaffoldCommand({
        input: modulePath,
        ...(flags.has('out') ? { out: flags.get('out')! } : {}),
        force: flags.has('force'),
        ...(flags.has('frame') ? { frame: flags.get('frame')! } : {}),
      });
      process.stderr.write(
        `gs scaffold: wrote ${result.out} — ${result.recipes.length} recipe beat(s), ${result.stubs.length} labeled stub(s) to refine` +
          (result.continuations.length > 0 ? `, ${result.continuations.length} pause-split continuation(s) coalesced` : '') +
          `\n`,
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (command === 'export') {
    // MVP: only --lottie. modulePath is the scene module; --out is a .json file.
    if (!flags.has('lottie')) {
      fail(`gs export currently supports only --lottie\n  gs export --lottie <scene-module> --out <file.json> [--width <n>] [--height <n>] [--fps <n>]`);
    }
    const out = flags.get('out');
    if (!out) fail(`gs export needs --out <file.json>\n${USAGE}`);
    const dim = (name: string): number | undefined => {
      const raw = flags.get(name);
      if (raw === undefined || raw === '') return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) fail(`--${name} must be a positive number, got '${raw}'`);
      return n;
    };
    const width = dim('width');
    const height = dim('height');
    const { exportCommand } = await import('./export.js');
    try {
      const result = await exportCommand({
        input: modulePath,
        out,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(flags.get('fps') ? { fps: parseFpsOrFail(flags.get('fps')!) } : {}),
      });
      for (const w of result.warnings) process.stderr.write(`gs export: warning: ${w}\n`);
      process.stderr.write(`gs export: wrote ${result.out}\n`);
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

  // --cache [<dir>] [--cache-mode <m>] [--cache-max-size <bytes|2GB>] (§3.5):
  // persistent whole-frame raster cache. Default OFF (the exact current baseline);
  // --cache opts in (read-write) with a default `.gscache` dir + 2 GB LRU cap.
  let cache: { dir: string; mode: import('./frameCache.js').CacheMode; maxSize?: number } | undefined;
  if (flags.has('cache')) {
    const dir = flags.get('cache') || '.gscache';
    const modeFlag = flags.get('cache-mode');
    let mode: import('./frameCache.js').CacheMode = 'read-write';
    if (modeFlag !== undefined) {
      if (modeFlag !== 'read-write' && modeFlag !== 'read-only' && modeFlag !== 'off') {
        fail(`--cache-mode must be read-write|read-only|off, got '${modeFlag}'`);
      }
      mode = modeFlag;
    }
    let maxSize: number | undefined;
    const maxSizeFlag = flags.get('cache-max-size');
    if (maxSizeFlag !== undefined && maxSizeFlag !== '') {
      const { parseCacheMaxSize } = await import('./frameCache.js');
      try {
        maxSize = parseCacheMaxSize(maxSizeFlag);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    }
    cache = { dir, mode, ...(maxSize !== undefined ? { maxSize } : {}) };
  }

  // 0.62 --certify / --cert-cache / --verify / --verify-cache. The verify paths run
  // INSTEAD of a render (re-render → byteHash-match = the determinism carry keyed by
  // cert). --cert-cache[=<dir>] enables the content-addressed render cache.
  if (flags.has('verify') || flags.has('verify-cache')) {
    const certPath = flags.get('verify') || flags.get('verify-cache');
    if (!certPath) fail('--verify / --verify-cache needs a cert manifest path (e.g. --verify out.cert.json)');
    let sample: number | undefined;
    if (flags.has('verify-cache')) {
      const sFlag = flags.get('sample');
      if (sFlag !== undefined && sFlag !== '') {
        if (!/^\d+$/.test(sFlag) || Number(sFlag) < 1) fail(`--sample must be a positive integer, got '${sFlag}'`);
        sample = Number(sFlag);
      }
    }
    try {
      const { verifyCert } = await import('./render.js');
      const res = await verifyCert({
        modulePath,
        certPath: certPath!,
        ...(sample !== undefined ? { sample } : {}),
        ...(flags.has('locale') && flags.get('locale') ? { locale: flags.get('locale')! } : {}),
        ...(flags.has('strict') ? { strictFonts: true } : {}),
        ...(flags.has('allow-system-fonts') ? { allowSystemFonts: true } : {}),
      });
      if (!res.baseMatches) {
        process.stderr.write('verify: WARNING — re-derived cert base does not match the manifest (an input drifted)\n');
      }
      if (res.mismatches.length > 0) {
        for (const m of res.mismatches) {
          process.stderr.write(`verify: frame ${m.i} MISMATCH — cert ${m.expected.slice(0, 12)} != render ${m.got.slice(0, 12)}\n`);
        }
        fail(`verify FAILED: ${res.mismatches.length}/${res.checked} frame(s) diverged (a determinism break)`);
      }
      process.stderr.write(
        `verify ok: ${res.ok}/${res.checked} frame${res.checked === 1 ? '' : 's'} byte-match the cert` +
          `${res.baseMatches ? '' : ' (base drift — see warning)'}\n`,
      );
      return;
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  // --cert-cache[=<dir>] [--cert-cache-mode <m>]: the content-addressed render cache.
  let certCache: { dir: string; mode: import('./cert.js').CertCacheMode } | undefined;
  if (flags.has('cert-cache')) {
    const dir = flags.get('cert-cache') || '.gscertcache';
    const modeFlag = flags.get('cert-cache-mode');
    let mode: import('./cert.js').CertCacheMode = 'read-write';
    if (modeFlag !== undefined && modeFlag !== '') {
      if (modeFlag !== 'read-write' && modeFlag !== 'read-only' && modeFlag !== 'off') {
        fail(`--cert-cache-mode must be read-write|read-only|off, got '${modeFlag}'`);
      }
      mode = modeFlag;
    }
    certCache = { dir, mode };
  }

  if (flags.has('watch')) {
    process.stderr.write('note: --watch is not yet implemented in this release; rendering once\n');
  }

  // --locales <a,b,c> (0.15 fan-out): render once per locale to distinct paths.
  // Mutually exclusive with --locale (a single render can't be many locales at
  // once); passing both is a user error. Self-contained block (clean hand-merge
  // with the i18n-hardening edits to render.ts).
  let locales: string[] | undefined;
  if (flags.has('locales') && flags.get('locales')) {
    if (flags.has('locale') && flags.get('locale')) {
      fail('--locale and --locales are mutually exclusive — pass one (--locale renders a single locale; --locales fans out over many)');
    }
    try {
      locales = parseLocalesList(flags.get('locales')!);
    } catch (err) {
      fail(err instanceof LocaleArgsError ? err.message : err instanceof Error ? err.message : String(err));
    }
  }

  const fpsFlag = flags.get('fps');
  const started = performance.now();
  try {
    const sharedOpts = {
      modulePath,
      out: flags.get('out') ?? 'out',
      ...(fpsFlag ? { fps: parseFpsOrFail(fpsFlag) } : {}),
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
      ...(flags.has('allow-system-fonts') ? { allowSystemFonts: true } : {}),
      ...(workers !== undefined ? { workers } : {}),
      ...(flags.has('lossless-intermediate') ? { losslessIntermediate: true } : {}),
      ...(flags.has('incremental') ? { incremental: true } : {}),
      ...(flags.has('allow-gpu-shards') ? { allowGpuShards: true } : {}),
      ...(cache !== undefined ? { cache } : {}),
      ...(flags.has('certify') ? { certify: true } : {}),
      ...(certCache !== undefined ? { certCache } : {}),
      captions: parseCaptionsModeOrFail(flags.get('captions')),
      narration: flags.get('narration') === 'off' ? ('off' as const) : ('auto' as const),
      music: flags.get('music') === 'off' ? ('off' as const) : ('auto' as const),
      sfx: flags.get('sfx') === 'off' ? ('off' as const) : ('auto' as const),
      loudness: flags.get('loudness') === 'off' ? ('off' as const) : ('auto' as const),
      onProgress: (n: number, total: number) => {
        // TTY: live \r line; piped/CI: sparse newline-terminated updates
        if (process.stderr.isTTY) {
          if (n % 30 === 0 || n === total) process.stderr.write(`\rrendering ${n}/${total} frames`);
        } else if (n % 300 === 0 || n === total) {
          process.stderr.write(`rendering ${n}/${total} frames\n`);
        }
      },
    } satisfies import('./render.js').RenderOptions;

    const cr = process.stderr.isTTY ? '\r' : '';
    if (locales) {
      // 0.15 fan-out: render once per locale to distinct per-locale paths. A bad
      // locale throws UnknownLocaleError from inside render(), aborting the loop.
      const fan = await renderLocales(sharedOpts, locales);
      const secs = ((performance.now() - started) / 1000).toFixed(2);
      for (const { locale, result } of fan) {
        process.stderr.write(`${cr}rendered [${locale}] ${result.frames} frames → ${result.out}\n`);
      }
      process.stderr.write(`done: ${fan.length} locale${fan.length === 1 ? '' : 's'} in ${secs}s\n`);
    } else {
      const result = await render({
        ...sharedOpts,
        ...(flags.has('locale') && flags.get('locale') ? { locale: flags.get('locale')! } : {}),
      });
      const secs = ((performance.now() - started) / 1000).toFixed(2);
      process.stderr.write(`${cr}rendered ${result.frames} frames in ${secs}s → ${result.out}\n`);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

void main();
