// @glissade/cli — programmatic render API; the `gs` binary wraps this.
export {
  render,
  loadSceneModule,
  ffmpegAvailable,
  planFinalAudio,
  collectAudioClips,
  resolveLoudnessGainDb,
  buildMixWav,
  SceneModuleError,
  type RenderOptions,
} from './render.js';
export {
  measureLoudnessCommand,
  computeGainDb,
  peakClampBinds,
  computeMixHash,
  resolveProfile,
  readLoudness,
  loudnessPathFor,
  parseLoudnormJson,
  measureFile,
  PUBLISH_PROFILES,
  DEFAULT_PROFILE_ID,
  LOUDNESS_SCHEMA_VERSION,
  LoudnessError,
  type PublishProfile,
  type LoudnessMeasurement,
  type MeasureLoudnessOptions,
  type MeasureLoudnessResult,
} from './loudness.js';
export {
  renderSharded,
  splitFrameRange,
  sceneHasGpuNodes,
  ShardError,
  type ShardRange,
  type RenderShardedArgs,
} from './shards.js';
export { FfmpegVideoFrameSource, probeVideo, VideoProbeError, type VideoInfo } from './videoSource.js';
export { planAudioMix, applyMixGainDb, gainExpression, atempoChain, resolveAssetPath, AudioMixError, type AudioMixPlan } from './audioMix.js';
export { pickEncoder, availableEncoders, parseEncoderList, NoEncoderError, type EncoderChoice } from './encoders.js';
export { resolveRenderDoc, MachineExportError, type MachineRenderFlags } from './machines.js';
export { dev, type DevOptions, type DevServer } from './dev.js';
export { importCommand, type ImportOptions, type ImportCommandResult } from './import.js';
export { diffCommand, snapshotAt, evaluateAt, type DiffOptions, type DiffResult } from './diff.js';
