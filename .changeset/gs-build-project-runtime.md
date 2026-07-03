---
"@glissade/cli": minor
---

`gs build` project runtime — `--affected <git-ref>` + a shared-master phase

`gs build` becomes a DAG-aware project runtime, not just a per-scene loop:

- **`gs build --affected <git-ref>`** pre-filters to the scenes a git diff since `<ref>` touched (source or any sidecar input), composed with the existing per-step content-hash staleness — the "rebuild only what this change set touched" CI story. Never runs a scene the diff didn't touch; never skips a real change within the ones it keeps.
- **A shared-master phase.** A `master` block on the config (`defineProject({ scenes, master: { profile, consistency, limiter } })`) makes `gs build` run a two-phase schedule with an explicit barrier: render every stale scene → **barrier** → master the whole project to one shared LUFS target + true-peak limiter (`runMaster`, extracted from `gs master` so both drive the same core) → the render staleness remuxes exactly the members whose committed `loudness.json` moved (a fast mix-only re-encode, not a full re-render). The master always measures all members (the shared target is the quietest member's reach), so `--affected` narrows the render phase while the master still considers the whole project. An unchanged project settles — byte-identical loudness, nothing remuxes.

CLI-only (no scene/embed surface, base embed unchanged); the per-scene staleness, hashes, and determinism are untouched. This is the first slice of the DAG-project-runtime capstone; `toolchain.lock`, sub-scene `anchorHash`, and `gs remaster` are follow-on work.
