---
'@glissade/eslint-plugin': patch
---

`@glissade/eslint-plugin` now exports a flat-config preset `configs.recommended` that applies all three determinism rules and ignores test files (`**/*.test.ts`, `**/*.spec.ts`, `**/test(s)/**`) — so async golden tests don't trip `no-async-in-evaluate`. Spread it into your config: `export default [...glissade.configs.recommended]` (scope with `files` as needed). Reported downstream.
