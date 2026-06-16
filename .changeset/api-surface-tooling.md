---
---

CI tooling (no package changes): `@arethetypeswrong/cli` and `api-extractor` now gate every published package. `pnpm check:types` verifies all 17 packages resolve cleanly under the `esm-only` profile (catches a broken `types` path or `exports` condition); `pnpm check:api` verifies the committed `packages/<pkg>/etc/<pkg>.api.md` surface reports are current (so any public-API change shows in the diff). Regenerate reports after an intentional API change with `pnpm api:update`. Both run in CI.
