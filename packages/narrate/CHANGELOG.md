# @glissade/narrate

## 0.4.2

### Patch Changes

- Updated dependencies [53f6f9f]
  - @glissade/scene@0.4.2
  - @glissade/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [80d9ac1]
  - @glissade/scene@0.4.1
  - @glissade/core@0.4.1

## 0.4.0

### Minor Changes

- cc57dfc: TTS narration + caption primitives. `@glissade/narrate` (new): narration scripts collocated with scenes, pluggable TTS providers (espeak / openai / deterministic fake) behind an explicit `gs narrate` prepare step with sha256 segment caching, narration-derived timeline anchors (`narration(timing).start('seg')`), captions as hold-key string tracks + safe-area caption nodes (16:9 and 9:16), and `.srt`/`.vtt` exporters. CLI: `gs narrate` command and `gs render --captions burn|sidecar|off` with sidecars that match the burned timing by construction. Render stays fully offline after prepare.

### Patch Changes

- Updated dependencies [056817c]
- Updated dependencies [869d406]
- Updated dependencies [3986798]
  - @glissade/scene@0.4.0
  - @glissade/core@0.4.0
