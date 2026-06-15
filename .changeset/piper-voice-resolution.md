---
'@glissade/narrate': patch
---

Fix `piper` provider: a bare voice filename like `"voice": "en_US-joe-medium.onnx"` now works. piper-tts 1.x's `--model` needs a filesystem path (or a downloadable voice key), not a bare `.onnx` name, so it failed with `Unable to find voice`. The provider now resolves the voice before spawn — an existing path is used as-is; a bare `<name>`/`<name>.onnx` is looked up under `piperProvider({ voicesDir })` → `PIPER_VOICES` env → `~/.local/share/piper-voices`; a `.onnx` name that resolves nowhere raises a clear error naming the dir; a bare key (no `.onnx`) passes through so piper can download it. Piper failures now surface the **tail** of stderr (where the Python exception actually is) instead of the truncated head. Reported downstream.
