---
"@glissade/scene": minor
"@glissade/cli": minor
---

feat(diff): `gs diff` — DisplayList diff + serializable IR snapshots (gs-diff)

The determinism-diagnostic substrate (§3.3). Operating on the already-pure
DisplayList IR (no raster, no audio), it turns an opaque golden-hash mismatch
into a command-level explanation.

- `@glissade/scene`: `diffDisplayLists(a, b): DisplayDiff` — index-aligned,
  positional per-command deltas (changed fields named; `add`/`remove` for
  trailing commands). `serializeDisplayList`/`parseDisplaySnapshot` produce a
  committable `.dl.json` baseline, registered as the third versioned
  interchange schema (`dlSnapshotVersion`, §7.4). The byte-preserving
  collapse-replacer that backs the §3.5 raster cacheKey is extracted to a
  single shared function (a pinned-cacheKey regression guard proves the
  extraction did not move a byte). All diff/snapshot surface tree-shakes out of
  the embed bundle.
- `@glissade/cli`: a `gs diff <scene> --at <t> --against <baseline.dl.json|.png>`
  subcommand — prints a command tree and exits non-zero on divergence
  (`--against .png` is a raw `encodePng` byte-compare only). `--snapshot <out>`
  writes a `.dl.json` baseline.

The golden harness's `assertFrameMatches` now attaches a DisplayList diff (from
a fresh-scene cold re-evaluation) to the thrown error, so a purity break names
the exact op/field that moved.

KNOWN v1 cliff: the positional alignment cascades on a leading insert/remove;
LCS/Myers alignment is deferred.
