---
'@glissade/export-web': minor
---

Worker-wrapped export (§5.1): `serveExportRequest` (the entire worker body — resolve the scene from a host registry key, export, stream progress, transfer the result) and `requestWorkerExport` (main-thread side with cancel). Audio premixes on the main thread — workers have no `OfflineAudioContext` — and transfers raw planar PCM, fed through mediabunny's `AudioSampleSource`; `exportVideo` gains a `premixedAudio` option and `mixAudio`/`premixTimelineAudio` are exported. Workers loading flexbox scenes pull the Yoga engine themselves.
