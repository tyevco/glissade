---
'@glissade/narrate': patch
'@glissade/cli': patch
---

Fix `--provider kokoro` under pnpm (downstream canary findings on 0.8.1-pre.0):

- **Resolve `kokoro-js` from the user's project, not from `@glissade/narrate`'s own location.** Under pnpm's isolated layout an optional peer isn't linked into narrate's store dir, so the bare `import('kokoro-js')` failed even when it was installed and loadable. It's now resolved via `createRequire(cwd).resolve('kokoro-js')` (falling back to this module for hoisted/global installs) and loaded through a computed `file://` import — which also keeps it out of any bundle.
- **Surface the real error.** The `catch {}` that masked every failure as a generic "not found" now includes the actual error `code` + `message`, so resolution/load problems are diagnosable.
- **Read the version without the non-exported subpath.** `kokoro-js` doesn't export `./package.json`; `version()` now walks up from the resolved entry instead of resolving that subpath (which threw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
- **Docs:** package-manager-agnostic install, and a pnpm note that downstreams must allow/ignore the native build scripts (`onnxruntime-node` / `sharp` / `protobufjs`) or `pnpm install --frozen-lockfile` exits non-zero.
