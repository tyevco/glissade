// @glissade/scene/motion — the motion-path follow helper (DESIGN.md §3).
//
// `followPath` / `motionPath` / `pointAtLength` / `pathLength` are a USER-FACING
// authoring helper (the design agent reaches for `window.glissade.motionPath`),
// but they are NOT on the base evaluate/render path — only scenes that opt into
// path-following import them. The 0.20 budget review moved them OFF the base
// scene index onto this tree-shakeable subpath so the base embed doesn't pay for
// the arc-length sampler. They are re-exported onto the `@glissade/browser` IIFE
// (window.glissade.*) so the no-build consumer keeps them. See scripts/check-size.mjs
// guard `base scene excludes motion`.

export {
  FollowPath,
  followPath,
  motionPath,
  pointAtLength,
  pathLength,
  type FollowPathProps,
  type PathSampler,
} from './motionPath.js';

export {
  OrientToPath,
  orientToPath,
  LookAt,
  lookAt,
  type OrientToPathProps,
  type LookAtProps,
} from './orient.js';

// 0.55 Camera rig + the standalone shake driver — cinematic camera moves
// (push-in/pan/roll/parallax) + deterministic pose jitter. Off the base embed.
export { Camera, camera, CameraError, type CameraLayer, type CameraProps } from './camera.js';
export { shake, shakeOffset, type ShakeSpec } from './shake.js';
