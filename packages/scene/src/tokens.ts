// @glissade/scene/tokens — the production token-highlight render component.
//
// `tokenHighlight` / `TokenHighlight` draw VISIBLE sub-line token tell-tags in
// real episodes (four-color category passes, per-token flips, karaoke-with-color)
// — this is PRODUCTION rendering UI, not a DEV/CLI diagnostic. The 0.20 budget
// review first relocated it (with the genuine diff/audit diagnostics) onto
// `@glissade/scene/diagnostics`, which read as a debug import for visible UI; the
// ai-training finding split it back out onto this OWN production subpath. It stays
// OFF the base scene index — it's opt-in production UI only token-highlight scenes
// import (the base embed never pays for it). It is npm-subpath-only: re-exporting
// it onto the `@glissade/browser` IIFE measured +1.16 kB gz (47.47 → 48.63),
// busting the 48 kB convenience-bundle ceiling, so the no-build author reaches it
// via this npm subpath rather than `window.glissade.*`. See scripts/check-size.mjs
// guard `base scene excludes tokens`.

export {
  TokenHighlight,
  tokenHighlight,
  matchTokenRun,
  TokenMatchError,
  type TokenHighlightProps,
  type TokenRange,
} from './tokenHighlight.js';
