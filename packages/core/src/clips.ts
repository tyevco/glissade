// @glissade/core/clips — motion clips: build-time authoring sugar that compiles
// to ordinary keyed Track[] (DESIGN.md §2). Tree-shakeable sub-path so the
// keyframe literals stay off the base embed budget.

export {
  clip,
  clipList,
  ClipError,
  type Clip,
  type ClipSpec,
  type ClipChannel,
  type ChannelOverride,
  type ApplyOpts,
  type ApplyOpts as ClipApplyOpts,
  type ClipResult,
  type ClipTarget,
  type ClipListDelay,
  type ClipListOpts,
} from './clip.js';

export {
  popIn,
  slideIn,
  pulse,
  driftLoop,
  type DurationOpts,
  type SlideEdge,
} from './clipStdlib.js';

// 0.13 shared-element box-FLIP morph (build-time sugar over `clip`).
export {
  morph,
  MorphError,
  type Box,
  type MorphTargets,
  type MorphOpts,
  type MorphResult,
} from './morph.js';

// 0.13 presence — enter/exit scheduling sugar over `clip` (compiles to a keyed
// opacity window-guard track + pass-through channel tracks). Subpath-only, off
// the base embed budget.
export {
  presence,
  PresenceError,
  transitionToClip,
  type PresenceOpts,
  type PresenceResult,
  type PresenceTransition,
} from './presence.js';
