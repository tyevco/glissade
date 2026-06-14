---
'@glissade/narrate': patch
---

Piper detection fix + Vosk via `vosk-align` (validated on real audio). `piperProvider.version()` now gates on `spawnSync` ENOENT, not exit code — piper-tts 1.x has no `--version` action (argparse exits non-zero), so the old check false-rejected a perfectly good install. The `vosk` aligner now shells out to a `vosk-align` command (Apache-2.0 Python Vosk + ffmpeg, JSON `{words:[{word,start,end}]}` on stdout) instead of the npm `vosk` package, whose `ffi-napi` native build is broken on modern Node; this also removes the now-redundant pure-JS WAV decode/resample (ffmpeg handles it). Find the command via `VOSK_ALIGN` (default `vosk-align`). The full piper→heuristic and piper→vosk pipelines were verified end-to-end against real piper-tts 1.4.2 + vosk-align, including graceful interpolation of words Vosk mis-recognizes.
