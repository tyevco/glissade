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
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { glissadeVersion } from './version.js';
import { type BuildStep, PIPELINE, planScene, type StepPlan } from './buildPlan.js';

export interface ProjectConfig {
  /** scene module paths or globs (`episodes/**\/*.ts`), relative to the config file. */
  scenes: string[];
  /** output dir for rendered videos (default: alongside each scene as `<base>.mp4`). */
  out?: string;
  /** per-scene render/cache defaults. */
  defaults?: { fps?: number; cache?: string };
}

/** Identity helper for a typed `glissade.config.ts` default export. */
export function defineProject(config: ProjectConfig): ProjectConfig {
  return config;
}

// ── config + scene resolution ────────────────────────────────────────────────
export async function loadConfig(configPath: string): Promise<ProjectConfig> {
  const { createJiti } = await import('jiti');
  const jiti = createJiti(pathToFileURL(`${process.cwd()}/`).href);
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
}

export interface BuildOptions {
  config: string;
  /** print the plan, run nothing. */
  explain?: boolean;
  /** restrict to scenes whose path contains one of these substrings (`gs build e07`). */
  only?: string[];
  onLog?: (line: string) => void;
}

export interface BuildResult {
  scenes: number;
  ran: number;
  skipped: number;
  plans: StepPlan[];
}

export async function buildCommand(opts: BuildOptions, deps: BuildDeps = { runStep: defaultRunStep }): Promise<BuildResult> {
  const cfg = await loadConfig(opts.config);
  const root = dirname(resolve(opts.config));
  let scenes = resolveScenes(cfg.scenes, root);
  if (opts.only?.length) scenes = scenes.filter((s) => opts.only!.some((o) => s.includes(o)));
  const version = glissadeVersion();
  const manifest = loadManifest(root);
  const log = opts.onLog ?? (() => {});
  const allPlans: StepPlan[] = [];
  let ran = 0;
  let skipped = 0;

  for (const scene of scenes) {
    const key = relative(root, scene);
    const rec = manifest.scenes[key] ?? {};
    const videoPath = outputVideo(scene, cfg, root);
    const steps = applicableSteps(scene);
    const plans = planScene(key, steps, {
      currentHash: (step) => hashInputs(stepInputs(scene, step), version),
      recordedHash: (step) => rec[step],
      outputExists: (step) => existsSync(stepOutput(scene, step, videoPath)),
    });
    for (const plan of plans) {
      log(`${key}  ${plan.step}: ${plan.action} (${plan.reason})`);
      if (plan.action === 'skip') {
        skipped++;
        continue;
      }
      ran++;
      if (!opts.explain) {
        await deps.runStep(scene, plan.step, cfg, videoPath);
        // record the input hash AFTER the step ran (upstream outputs are now fresh)
        rec[plan.step] = hashInputs(stepInputs(scene, plan.step), version);
      }
    }
    manifest.scenes[key] = rec;
    allPlans.push(...plans);
  }
  if (!opts.explain) saveManifest(root, manifest);
  return { scenes: scenes.length, ran, skipped, plans: allPlans };
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
      await measureLoudnessCommand({ modulePath: scene });
      return;
    }
    case 'render': {
      const { render } = await import('./render.js');
      await render({
        modulePath: scene,
        out: videoPath,
        ...(cfg.defaults?.fps !== undefined ? { fps: cfg.defaults.fps } : {}),
        ...(cfg.defaults?.cache ? { cache: { dir: cfg.defaults.cache, mode: 'read-write' as const } } : {}),
      });
      return;
    }
  }
}
