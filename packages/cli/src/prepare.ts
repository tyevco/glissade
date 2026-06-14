/**
 * gs prepare — materialize ALL of a scene's committed audio assets in one step:
 * the narration manifest (gs narrate), the sfx manifest + cache (gs sfx), and
 * any in-code sfx caches the scene writes at module/timeline-build time. The
 * last is flushed simply by IMPORTING the scene module (its top-level
 * renderSfxAssets+writeFileSync run then) — evaluate() is a pure read that
 * writes nothing, so prepare never calls it. After prepare, gs render is a pure
 * read of committed files.
 */

import { existsSync } from 'node:fs';
import { narrateCommand } from './narrate.js';
import { prepareSfx, sfxScriptPathFor, type PrepareSfxResult } from './sfx.js';
import { loadSceneModule } from './render.js';

export interface PrepareOptions {
  /** a scene module (resolves the sibling .narration.json / .sfx.json) or a script path */
  input: string;
  provider?: string;
  aligner?: string;
  force?: boolean;
}

export interface PrepareResult {
  narrationTimingPath: string | null;
  sfx: PrepareSfxResult | null;
  /** whether the scene module was imported (flushing in-code caches) */
  loaded: boolean;
  notes: string[];
}

const sibling = (input: string, ext: string): string => input.replace(/\.[jt]sx?$/, '') + ext;

export async function prepareCommand(opts: PrepareOptions): Promise<PrepareResult> {
  const notes: string[] = [];
  let narrationTimingPath: string | null = null;
  let sfx: PrepareSfxResult | null = null;

  // 1. narration FIRST — anchored sfx hits resolve against the narration timing.
  //    existsSync-probe the candidate (scriptPathFor THROWS on a missing sibling).
  if (opts.input.endsWith('.narration.json') || existsSync(sibling(opts.input, '.narration.json'))) {
    const r = await narrateCommand({
      input: opts.input,
      ...(opts.provider !== undefined ? { provider: opts.provider } : {}),
      ...(opts.aligner !== undefined ? { aligner: opts.aligner } : {}),
      ...(opts.force !== undefined ? { force: opts.force } : {}),
    });
    narrationTimingPath = r.timingPath;
    notes.push(`narration → ${r.timingPath}`);
  }

  // 2. sfx manifest + deduped cache (resolves anchors against the timing above)
  if (opts.input.endsWith('.sfx.json') || existsSync(sibling(opts.input, '.sfx.json'))) {
    sfx = prepareSfx(sfxScriptPathFor(opts.input));
    notes.push(`sfx ${sfx.clipCount} ${sfx.clipCount === 1 ? 'hit' : 'hits'} → ${sfx.timingPath}`);
  }

  // 3. import the scene module LAST — its top-level/timeline-build side effects
  //    (the author's renderSfxAssets+writeFileSync) run on import. A failed
  //    import is a warning, not an abort: steps 1-2 are already committed.
  let loaded = false;
  if (!opts.input.endsWith('.json')) {
    try {
      await loadSceneModule(opts.input);
      loaded = true;
      notes.push('flushed in-code caches (scene module imported)');
    } catch (err) {
      notes.push(`scene import skipped (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  return { narrationTimingPath, sfx, loaded, notes };
}
