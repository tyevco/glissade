---
'@glissade/core': minor
---

Studio foundation (DESIGN §6.3/§6.4), the core half of the StudioHost work: a new tree-shaken entry **`@glissade/core/studio-host`** exporting the `StudioHost` interface types (`MergedTimeline = Timeline & { orphans }`, `NodeDescriptor`, `SignalPath`, `StudioEvent`), the `isEditableNodeId` rule (only explicit, non-structural ids host editable tracks), and the **`TimelinePatch` engine**: `applyPatches(doc, patches, baseline?)` applies a fine-grained, by-stable-key-id edit transaction **atomically** (an invalid patch rejects the whole batch, doc untouched) and returns a snapshot-restore **inverse** for undo that round-trips byte-for-byte — even through `normalizeEditedKeys`' spring re-pin. Every patch variant is plain JSON (structured-clone-safe for a future postMessage host). Kept entirely out of the embed `.` bundle. (The studio's in-process host + App.tsx rewire onto this land next.)
