---
"@glissade/lottie": minor
"@glissade/cli": minor
---

Lottie export now bakes width-wrapped text so it survives the round-trip.

Previously a Text node with a wrap `width` (no explicit `\n`) exported its raw string and dropped the width, so the re-imported/played Lottie collapsed the paragraph onto one line — a real interchange fidelity gap (measured on `gs parity`: a wrapped caption band dropped to ~0.20–0.88 SSIM vs the Skia reference). `exportLottie` gains an optional `measurer?: TextMeasurer`; when present and a Text uses width-wrap, it materializes glissade's own line breaks (`breakLines`) into the Lottie text document `t` (joined with `\n`, the same path explicit-`\n` text already round-trips through). Baking is done on the sampled value per frame, so animated text/fontSize/width re-wrap correctly. `gs export --lottie` and the `gs parity` lottie leg pass a real Skia measurer, so exported captions now round-trip faithfully.

Gated strictly on width-wrap being active with a measurer present — non-wrapped Text and the no-measurer path are byte-identical to before (existing goldens/exports unchanged). CLI/lottie-only; zero base-embed impact; determinism preserved (`breakLines` is a pure function of text + width + font + measurer).
