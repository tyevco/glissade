/**
 * `gs build` (0.29): the content-graph DAG runner. A `glissade.config.ts` lists the
 * project's scenes; `gs build` derives each scene's narrate → sfx → measure-loudness
 * → render pipeline, content-hashes every step's inputs (source + upstream outputs +
 * glissade version), and runs ONLY the stale subtree. A one-segment re-narration
 * re-narrates that asset, re-syncs ITS sfx, re-measures ITS loudness, re-renders it —
 * and touches nothing else. `--explain` prints the plan without running anything.
 *
 * Step execution is injectable (`deps.runStep`) so the orchestration — staleness
 * across builds, propagation, the manifest — is unit-testable without a TTS venv or
 * ffmpeg; the default `runStep` delegates to the shipped narrate/sfx/loudness/render.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { glissadeVersion } from './version.js';
import { type BuildStep, PIPELINE, planScene, type StepPlan } from './buildPlan.js';
import type { MasterRunOptions } from './master.js';

export interface ProjectConfig {
  /** scene module paths or globs (`episodes/**\/*.ts`), relative to the config file. */
  scenes: string[];
  /** output dir for rendered videos (default: alongside each scene as `<base>.mp4`). */
  out?: string;
  /**
   * 0.43 project runtime: master the WHOLE project to a SHARED loudness target after
   * rendering. When set, `gs build` runs a second, cross-scene phase — render all →
   * BARRIER → master (one shared LUFS target + limiter across every member) → the
   * render staleness (a changed `<scene>.loudness.json`) remuxes exactly the members
   * whose gain moved. Absent → the classic per-scene pipeline, unchanged.
   */
  master?: MasterRunOptions;
  /** per-scene render/cache defaults. */
  defaults?: {
    fps?: number;
    /** persistent frame-cache dir (speed only — NEVER changes output, so it is
     *  excluded from the staleness hash). */
    cache?: string;
    /** captions mode for every render (0.33, consumer-pulled): a series that
     *  ships SOFT captions sets `captions: 'sidecar'` here — before this, gs
     *  build always used render's `burn` default and baked captions into the
     *  masters. Folded into the render staleness hash, so flipping it re-renders. */
    captions?: 'burn' | 'sidecar' | 'off';
    /** narration/music/sfx auto-mix modes ('auto' default). Threaded into BOTH
     *  render and measure-loudness so the measured mix always matches the
     *  rendered mix (a mismatch would trip render's stale-mixHash guard). */
    narration?: 'auto' | 'off';
    music?: 'auto' | 'off';
    sfx?: 'auto' | 'off';
    /** apply the committed publish gain at render ('auto' default). */
    loudness?: 'auto' | 'off';
  };
}

/** The defaults that change a RENDER's output — folded into its staleness hash
 *  (a captions/mix-mode flip must re-run render, never serve a stale cached
 *  master) and spread into the render call. `cache` is deliberately absent
 *  (byte-identical speed knob). */
export function renderDefaults(cfg: ProjectConfig): {
  fps?: number;
  captions?: 'burn' | 'sidecar' | 'off';
  narration?: 'auto' | 'off';
  music?: 'auto' | 'off';
  sfx?: 'auto' | 'off';
  loudness?: 'auto' | 'off';
} {
  const d = cfg.defaults ?? {};
  return {
    ...(d.fps !== undefined ? { fps: d.fps } : {}),
    ...(d.captions !== undefined ? { captions: d.captions } : {}),
    ...(d.narration !== undefined ? { narration: d.narration } : {}),
    ...(d.music !== undefined ? { music: d.music } : {}),
    ...(d.sfx !== undefined ? { sfx: d.sfx } : {}),
    ...(d.loudness !== undefined ? { loudness: d.loudness } : {}),
  };
}

/** The mix-mode defaults measure-loudness shares with render (measured mix ==
 *  rendered mix, or render's stale-mixHash guard trips). */
export function mixDefaults(cfg: ProjectConfig): {
  narration?: 'auto' | 'off';
  music?: 'auto' | 'off';
  sfx?: 'auto' | 'off';
} {
  const d = cfg.defaults ?? {};
  return {
    ...(d.narration !== undefined ? { narration: d.narration } : {}),
    ...(d.music !== undefined ? { music: d.music } : {}),
    ...(d.sfx !== undefined ? { sfx: d.sfx } : {}),
  };
}

/** Per-step staleness salt: the engine version PLUS any config options that
 *  change the step's OUTPUT. Options ride the salt (not stepInputs) because
 *  they aren't files; a flipped option changes the hash exactly like an edited
 *  input, so the step re-runs instead of serving a stale artifact. */
export function stepSalt(step: BuildStep, cfg: ProjectConfig, version: string): string {
  if (step === 'render') return `${version}\0render:${JSON.stringify(renderDefaults(cfg))}`;
  if (step === 'measure-loudness') return `${version}\0mix:${JSON.stringify(mixDefaults(cfg))}`;
  return version;
}

/** Identity helper for a typed `glissade.config.ts` default export. */
export function defineProject(config: ProjectConfig): ProjectConfig {
  return config;
}

// ── config + scene resolution ────────────────────────────────────────────────
export async function loadConfig(configPath: string): Promise<ProjectConfig> {
  const { createJiti } = await import('jiti');
  // moduleCache off: always read the config fresh from disk — a long-lived
  // process (tests, a future watch mode) must see edits, and configs are tiny
  const jiti = createJiti(pathToFileURL(`${process.cwd()}/`).href, { moduleCache: false });
  const cfg = (await jiti.import(pathToFileURL(resolve(configPath)).href, { default: true })) as ProjectConfig;
  if (!cfg || !Array.isArray(cfg.scenes)) {
    throw new Error(`${configPath}: config must default-export { scenes: string[] } — use defineProject({ scenes: [...] })`);
  }
  return cfg;
}

/** Expand scene patterns (explicit paths + `dir/**\/*.ts` / `dir/*.ts` globs) to concrete files under `root`. */
export function resolveScenes(patterns: readonly string[], root: string): string[] {
  const found = new Set<string>();
  for (const pat of patterns) {
    if (!pat.includes('*')) {
      found.add(resolve(root, pat));
      continue;
    }
    // split into a fixed prefix dir + the glob tail
    const starAt = pat.indexOf('*');
    const prefix = pat.slice(0, starAt);
    const baseDir = resolve(root, prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '.');
    const recursive = pat.includes('**');
    const tail = pat.slice(pat.lastIndexOf('/') + 1); // e.g. '*.ts' or 'e*.ts'
    const re = new RegExp(`^${tail.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
    walk(baseDir, recursive, (file) => {
      if (re.test(basename(file))) found.add(file);
    });
  }
  return [...found].sort();
}

function walk(dir: string, recursive: boolean, onFile: (path: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const full = join(dir, e);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (recursive) walk(full, recursive, onFile);
    } else {
      onFile(full);
    }
  }
}

// ── per-step inputs / outputs / applicability ────────────────────────────────
const stripExt = (scene: string): string => scene.replace(/\.[jt]sx?$/, '');
const sib = (scene: string, ext: string): string => `${stripExt(scene)}${ext}`;

/** Where a scene's rendered video lands (config `out` dir, else alongside the source). */
export function outputVideo(scene: string, cfg: ProjectConfig, root: string): string {
  return cfg.out ? join(resolve(root, cfg.out), `${basename(stripExt(scene))}.mp4`) : `${stripExt(scene)}.mp4`;
}

/** The input files whose bytes decide a step's freshness (upstream outputs included). */
export function stepInputs(scene: string, step: BuildStep): string[] {
  switch (step) {
    case 'narrate':
      return [scene, sib(scene, '.narration.json')];
    case 'sfx':
      return [sib(scene, '.sfx.json'), sib(scene, '.narration.timing.json')];
    case 'measure-loudness':
      return [sib(scene, '.narration.timing.json'), sib(scene, '.music.timing.json'), sib(scene, '.sfx.timing.json')];
    case 'render':
      return [scene, sib(scene, '.narration.timing.json'), sib(scene, '.music.timing.json'), sib(scene, '.sfx.timing.json'), sib(scene, '.loudness.json')];
  }
}

/** The committed output whose existence gates a step (missing → must run). */
export function stepOutput(scene: string, step: BuildStep, videoPath: string): string {
  switch (step) {
    case 'narrate':
      return sib(scene, '.narration.timing.json');
    case 'sfx':
      return sib(scene, '.sfx.timing.json');
    case 'measure-loudness':
      return sib(scene, '.loudness.json');
    case 'render':
      return videoPath;
  }
}

/** Which pipeline steps apply to a scene: narrate/sfx only if their source sidecar exists;
 * measure-loudness only if any audio timing is present; render always. */
export function applicableSteps(scene: string): BuildStep[] {
  const steps: BuildStep[] = [];
  if (existsSync(sib(scene, '.narration.json'))) steps.push('narrate');
  if (existsSync(sib(scene, '.sfx.json'))) steps.push('sfx');
  const hasAudio = ['.narration.json', '.music.timing.json', '.sfx.json'].some((e) => existsSync(sib(scene, e)));
  if (hasAudio) steps.push('measure-loudness');
  steps.push('render');
  return PIPELINE.filter((s) => steps.includes(s));
}

// ── affected-scene selection (0.43: gs build --affected <ref>) ───────────────
/** Every input file whose change makes a scene stale — the scene source + every
 *  step's inputs (upstream sidecars included), as absolute paths. */
export function sceneInputFiles(scene: string): string[] {
  const files = new Set<string>([scene]);
  for (const step of applicableSteps(scene)) for (const f of stepInputs(scene, step)) files.add(f);
  return [...files];
}

/**
 * Restrict a scene list to those a git diff TOUCHED — a scene is affected when any
 * of its input files (source + sidecars) is in `changedPaths`. Pure: the caller
 * supplies the resolved changed-file set (from `gitChangedFiles`), so the whole
 * selector is unit-testable without git. This is a COARSE pre-filter on top of the
 * per-step content-hash staleness (planScene still hash-checks each selected scene),
 * so it never runs a scene the diff didn't touch, and never skips a real hash change
 * within the ones it keeps. `changedPaths` are absolute.
 */
export function affectedScenes(scenes: readonly string[], changedPaths: ReadonlySet<string>): string[] {
  return scenes.filter((s) => sceneInputFiles(s).some((f) => changedPaths.has(f)));
}

const isCodeFile = (f: string): boolean => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f);

/**
 * The `--affected` selector with a SAFE-BY-DEFAULT fallback. A scene's staleness is
 * tracked by its own files (source + sidecars), but a scene `.ts` *imports* other
 * modules — and a change to a shared `src/util.ts` (or the config, or any code file
 * not attributable to a scene) affects scenes transitively, invisibly to the
 * file-level diff. Silently narrowing that to nothing would ship stale renders — the
 * exact silent-skip the rest of the system fails loud on. So: if the diff touched a
 * CODE file (`.ts`/`.js`/…) that is NOT any scene's recognized input, we cannot
 * attribute it, so we DON'T narrow — rebuild every scene (the per-step content hash
 * still skips the genuinely-fresh ones). A diff of only non-code files (docs, an
 * unrelated JSON) narrows normally. (Precise import-graph affectedness — rebuild only
 * true dependents — is a follow-up; footgun-free-80% over precise-but-unshipped-100%.)
 */
export function selectAffectedScenes(scenes: readonly string[], changedPaths: ReadonlySet<string>): string[] {
  const accountedFor = new Set(scenes.flatMap(sceneInputFiles));
  const hasUnattributedCode = [...changedPaths].some((f) => isCodeFile(f) && !accountedFor.has(f));
  return hasUnattributedCode ? [...scenes] : affectedScenes(scenes, changedPaths);
}

/** The files changed since a git ref (`git diff --name-only <ref>`), as absolute paths. */
export function gitChangedFiles(ref: string, root: string): Set<string> {
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim();
  const out = execFileSync('git', ['diff', '--name-only', ref], { cwd: root, encoding: 'utf8' });
  const files = new Set<string>();
  for (const line of out.split('\n')) {
    const rel = line.trim();
    if (rel) files.add(resolve(top, rel));
  }
  return files;
}

// ── content hash ─────────────────────────────────────────────────────────────
export function hashInputs(paths: readonly string[], salt: string): string {
  const h = createHash('sha256').update(salt).update('\0');
  for (const p of paths) {
    h.update(p).update('\0');
    h.update(existsSync(p) ? readFileSync(p) : Buffer.from('\0ABSENT\0'));
    h.update('\0');
  }
  return `sha256:${h.digest('hex')}`;
}

// ── manifest ─────────────────────────────────────────────────────────────────
interface BuildManifest {
  version: 1;
  scenes: Record<string, Partial<Record<BuildStep, string>>>;
}
const manifestPath = (root: string): string => join(root, '.gsbuild.json');
function loadManifest(root: string): BuildManifest {
  const p = manifestPath(root);
  if (existsSync(p)) {
    try {
      const m = JSON.parse(readFileSync(p, 'utf8')) as BuildManifest;
      if (m.version === 1 && m.scenes) return m;
    } catch {
      /* corrupt → rebuild */
    }
  }
  return { version: 1, scenes: {} };
}
function saveManifest(root: string, m: BuildManifest): void {
  writeFileSync(manifestPath(root), JSON.stringify(m, null, 2));
}

// ── the runner ───────────────────────────────────────────────────────────────
export interface BuildDeps {
  /** Execute one pipeline step for a scene. Default delegates to the shipped commands. */
  runStep: (scene: string, step: BuildStep, cfg: ProjectConfig, videoPath: string) => Promise<void>;
  /** Master the whole project to a shared target (0.43). Default delegates to `runMaster`;
   *  injectable so the two-phase orchestration is testable without ffmpeg. Returns the
   *  number of members mastered (it commits each member's `loudness.json`). */
  runMaster?: (members: readonly string[], opts: MasterRunOptions, log: (l: string) => void) => Promise<number>;
}

export interface BuildOptions {
  config: string;
  /** print the plan, run nothing. */
  explain?: boolean;
  /** restrict to scenes whose path contains one of these substrings (`gs build e07`). */
  only?: string[];
  /** restrict to scenes a git diff since this ref TOUCHED (`gs build --affected main`) —
   *  the "rebuild only what this change set touched" pre-filter, composed with the
   *  normal content-hash staleness within the selected scenes. */
  affected?: string;
  onLog?: (line: string) => void;
}

export interface BuildResult {
  scenes: number;
  ran: number;
  skipped: number;
  plans: StepPlan[];
  /** members mastered in the shared-target phase (0 when no `master` config). */
  mastered: number;
}

/** One pass of the per-scene pipeline (plan run/skip per step, execute the stale ones,
 *  record hashes). Shared by the render phase and the post-master remux phase — the
 *  same staleness machinery, so the master's committed loudness re-runs exactly the
 *  render steps whose `loudness.json` changed. Mutates `manifest` in place. */
async function runScenePass(
  scenes: readonly string[],
  cfg: ProjectConfig,
  root: string,
  version: string,
  manifest: BuildManifest,
  deps: BuildDeps,
  explain: boolean,
  log: (line: string) => void,
): Promise<{ ran: number; skipped: number; plans: StepPlan[] }> {
  const plans: StepPlan[] = [];
  let ran = 0;
  let skipped = 0;
  for (const scene of scenes) {
    const key = relative(root, scene);
    const rec = manifest.scenes[key] ?? {};
    const videoPath = outputVideo(scene, cfg, root);
    const steps = applicableSteps(scene);
    const scenePlans = planScene(key, steps, {
      currentHash: (step) => hashInputs(stepInputs(scene, step), stepSalt(step, cfg, version)),
      recordedHash: (step) => rec[step],
      outputExists: (step) => existsSync(stepOutput(scene, step, videoPath)),
    });
    for (const plan of scenePlans) {
      log(`${key}  ${plan.step}: ${plan.action} (${plan.reason})`);
      if (plan.action === 'skip') {
        skipped++;
        continue;
      }
      ran++;
      if (!explain) {
        await deps.runStep(scene, plan.step, cfg, videoPath);
        // record the input hash AFTER the step ran (upstream outputs are now fresh)
        rec[plan.step] = hashInputs(stepInputs(scene, plan.step), stepSalt(plan.step, cfg, version));
      }
    }
    manifest.scenes[key] = rec;
    plans.push(...scenePlans);
  }
  return { ran, skipped, plans };
}

export async function buildCommand(opts: BuildOptions, deps: BuildDeps = { runStep: defaultRunStep }): Promise<BuildResult> {
  const cfg = await loadConfig(opts.config);
  const root = dirname(resolve(opts.config));
  const allScenes = resolveScenes(cfg.scenes, root);
  let renderScenes = allScenes;
  if (opts.only?.length) renderScenes = renderScenes.filter((s) => opts.only!.some((o) => s.includes(o)));
  if (opts.affected !== undefined) renderScenes = selectAffectedScenes(renderScenes, gitChangedFiles(opts.affected, root));
  const version = glissadeVersion();
  const manifest = loadManifest(root);
  const log = opts.onLog ?? (() => {});

  // ── Phase 1: the per-scene pipeline for the selected scenes ──
  const p1 = await runScenePass(renderScenes, cfg, root, version, manifest, deps, !!opts.explain, log);
  let ran = p1.ran;
  let skipped = p1.skipped;
  const allPlans = [...p1.plans];
  let mastered = 0;

  // ── Phase 2+3 (project runtime): master the WHOLE project to a shared target, then
  // remux the members whose loudness moved. Master needs ALL members (the shared
  // target is the quietest member's reach), so it uses the full set, not --affected. ──
  if (cfg.master && allScenes.length > 0) {
    if (opts.explain) {
      log(`master: WOULD master ${allScenes.length} member(s) to a shared target, then remux any whose loudness moves`);
    } else {
      log('master: shared-target loudness across the project');
      const doMaster = deps.runMaster ?? defaultRunMaster;
      mastered = await doMaster(allScenes, cfg.master, log);
      // The render staleness (a changed loudness.json) re-runs render as a mix-only remux.
      const p3 = await runScenePass(allScenes, cfg, root, version, manifest, deps, false, log);
      ran += p3.ran;
      skipped += p3.skipped;
      allPlans.push(...p3.plans);
    }
  }

  if (!opts.explain) saveManifest(root, manifest);
  return { scenes: renderScenes.length, ran, skipped, plans: allPlans, mastered };
}

/** Default project-master executor — the real shared-target `runMaster`. */
async function defaultRunMaster(members: readonly string[], opts: MasterRunOptions, log: (l: string) => void): Promise<number> {
  const { runMaster } = await import('./master.js');
  const res = await runMaster(members, opts, log);
  return res.members.length;
}

/** Default step executor — the shipped commands. */
async function defaultRunStep(scene: string, step: BuildStep, cfg: ProjectConfig, videoPath: string): Promise<void> {
  switch (step) {
    case 'narrate': {
      const { narrateCommand } = await import('./narrate.js');
      await narrateCommand({ input: scene });
      return;
    }
    case 'sfx': {
      const { prepareSfx } = await import('./sfx.js');
      prepareSfx(sib(scene, '.sfx.json'));
      return;
    }
    case 'measure-loudness': {
      const { measureLoudnessCommand } = await import('./loudness.js');
      // share the mix modes with render — the measured mix must BE the rendered mix
      await measureLoudnessCommand({ modulePath: scene, ...mixDefaults(cfg) });
      return;
    }
    case 'render': {
      const { render } = await import('./render.js');
      await render({
        modulePath: scene,
        out: videoPath,
        ...renderDefaults(cfg),
        ...(cfg.defaults?.cache ? { cache: { dir: cfg.defaults.cache, mode: 'read-write' as const } } : {}),
      });
      return;
    }
  }
}
