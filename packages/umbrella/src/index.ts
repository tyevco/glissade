// glissade — the unscoped umbrella package (DESIGN.md §7.2).
//
// A single import for the realtime *embed* surface: core + scene + player.
// This is the import-direction floor (§7.1) — it MUST re-export ONLY these
// three packages. Pulling in backend-skia / cli / studio / export-web here
// would drag the export/editor toolchain into every embed bundle and break
// the embed import-direction promise.
//
// `Paint` and `ColorStop` are declared in @glissade/core and merely re-exported
// by @glissade/scene, so the two `export *` lines resolve to the *same* symbol
// — no ambiguous re-export. There are no other name collisions across the three
// packages' public surfaces.

export * from '@glissade/core';
export * from '@glissade/scene';
export * from '@glissade/player';
