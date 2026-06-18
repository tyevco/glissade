// @glissade/cli — programmatic render API; the `gs` binary wraps this.
export { render, loadSceneModule, ffmpegAvailable, planFinalAudio, SceneModuleError, type RenderOptions } from './render.js';
export {
  renderSharded,
  splitFrameRange,
  sceneHasGpuNodes,
  ShardError,
  type ShardRange,
  type RenderShardedArgs,
} from './shards.js';
export { FfmpegVideoFrameSource, probeVideo, VideoProbeError, type VideoInfo } from './videoSource.js';
export { planAudioMix, gainExpression, atempoChain, resolveAssetPath, AudioMixError, type AudioMixPlan } from './audioMix.js';
export { pickEncoder, availableEncoders, parseEncoderList, NoEncoderError, type EncoderChoice } from './encoders.js';
export { resolveRenderDoc, MachineExportError, type MachineRenderFlags } from './machines.js';
export { dev, type DevOptions, type DevServer } from './dev.js';
export { importCommand, type ImportOptions, type ImportCommandResult } from './import.js';
