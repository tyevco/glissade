---
'@glissade/cli': patch
'@glissade/narrate': patch
'@glissade/core': patch
---

Two 0.12.1 consumer papercut fixes from the 0.12.0 validation.

**Fix A — narration-lint no longer over-flags sidecar caption workflows.**
`caption-fit` is now Tier-2 (WARN, never fails CI) **by default**, escalating to
Tier-1 (error, CI-failing) only when the NarrationScript declares caption-fit
intent — `captionMode: 'burn'` or a `captionMaxLines` budget. The escalation
signal travels with the content in the committed script/manifest (not a CLI
flag). The warn variant carries a nudge telling the author how to promote it to
a hard gate. A sidecar project with no declaration now exits 0 out of the box.
Adds `captionMode?: 'burn' | 'sidecar'` and `captionMaxLines?: number` to
`NarrationScript`, persisted into `NarrationTiming`.

**Fix B — `registerFont({ src: './Inter.ttf' })` accepts a string path.**
A string `src` is now fs-read to bytes node-side (on the export/prepare-only
`@glissade/core/font-ingest` subpath; `node:fs` does not leak into the embed).
An unreadable path throws a clear `FontIngestError` naming the path instead of
the downstream "too short to be a font". Raw `Uint8Array | ArrayBuffer` keeps
working unchanged.
