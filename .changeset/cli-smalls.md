---
"@glissade/cli": patch
---

Two authoring-loop papercuts: `gs migrate --check` and `gs dev` layout parity

- **`gs migrate --check`** exits non-zero when the diff has any breaking change — a CI gate for engine bumps (default stays advisory, exit 0). Pairs with committed per-release manifests from `gs describe --out`.
- **`gs dev`** now loads the Yoga layout engine when the scene uses `Layout`/`Stack`/`Row`/`Column` (the same `hasLayout` check `gs render`/`gs mcp` already do) — a layout scene under `gs dev` used to throw `LayoutEngineMissingError`.
