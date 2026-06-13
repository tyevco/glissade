/**
 * gs narrate — the explicit TTS prepare step. Provider calls happen here and
 * only here; gs render consumes the committed timing manifest + cached wavs,
 * fully offline.
 */

import { scriptPathFor, synthesizeScript } from '@glissade/narrate/providers';

export interface NarrateOptions {
  /** a scene module (resolves the sibling .narration.json) or the script itself */
  input: string;
  provider?: string;
  /** word-timing aligner: 'heuristic' (default) | 'vosk' | 'none' */
  aligner?: string;
  force?: boolean;
}

export async function narrateCommand(opts: NarrateOptions): Promise<{
  timingPath: string;
  synthesized: string[];
  reused: string[];
  aligned: string[];
  aligner: string | null;
}> {
  const scriptPath = scriptPathFor(opts.input);
  const result = await synthesizeScript(scriptPath, {
    ...(opts.provider !== undefined ? { provider: opts.provider } : {}),
    ...(opts.aligner !== undefined ? { aligner: opts.aligner } : {}),
    ...(opts.force !== undefined ? { force: opts.force } : {}),
  });
  return {
    timingPath: result.timingPath,
    synthesized: result.synthesized,
    reused: result.reused,
    aligned: result.aligned,
    aligner: result.aligner,
  };
}
