// @glissade/cli — programmatic render API; the `gs` binary wraps this.
export {
  render,
  renderLocales,
  parseLocalesList,
  localeOutPath,
  loadSceneModule,
  ffmpegAvailable,
  planFinalAudio,
  collectAudioClips,
  resolveLoudnessGainDb,
  buildMixWav,
  SceneModuleError,
  LocaleArgsError,
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
  type CommittedLimiter,
  type MeasureLoudnessOptions,
  type MeasureLoudnessResult,
} from './loudness.js';
export {
  masterCommand,
  planMaster,
  normalizeMasterConfig,
  masterAfChain,
  MasterError,
  DEFAULT_MAX_GR_DB,
  type MasterConfig,
  type MasterLimiter,
  type MasterResult,
  type MasterMemberResult,
  type MemberMeasure,
  type MemberPlan,
  type MasterPlan,
} from './master.js';
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
export { repinCommand, DEFAULT_FRAMES, DEFAULT_FPS, type RepinOptions, type RepinResult, type RepinFrame, type RepinStatus } from './repin.js';
export {
  lintNarration,
  hasErrors,
  formatTable,
  fixDiff,
  type Diagnostic,
  type LintRule,
  type LintOptions,
  type CaptionProbe,
} from './narrationLint.js';
export {
  narrationLintCommand,
  buildCaptionProbe,
  lintTimingPathFor,
  type NarrationLintOptions,
  type NarrationLintResult,
} from './narrationLintCommand.js';
export {
  FrameCache,
  frameCacheKey,
  capsId,
  parseCacheMaxSize,
  probeEntryHeader,
  clearFrameCache,
  DEFAULT_CACHE_MAX_SIZE,
  FrameCacheError,
  type CacheMode,
  type CacheKeyContext,
  type FrameCacheOptions,
} from './frameCache.js';
export {
  cacheVerifyCommand,
  type CacheVerifyOptions,
  type CacheVerifyResult,
} from './cacheVerify.js';
export { glissadeVersion } from './version.js';
