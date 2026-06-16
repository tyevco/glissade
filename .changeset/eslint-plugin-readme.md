---
'@glissade/eslint-plugin': patch
---

Add a README documenting the three determinism rules, flat-config usage, and a note for release-age-gating downstreams: exempt `@glissade/eslint-plugin` alongside the runtime `@glissade/*` scope (e.g. pnpm `minimumReleaseAgeExclude`), or a fresh plugin publish is blocked by `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`.
