/**
 * The byte-preserving collapse-replacer (DESIGN.md §3.3 / §3.5).
 *
 * Extracted to its OWN tiny module in the 0.20 budget review so the heavy
 * DEV/CLI diagnostic surface (`diffDisplayLists`/`serializeDisplayList`/… in
 * `displayDiff.ts`, now on the `@glissade/scene/diagnostics` subpath) can leave
 * the base scene graph while THIS function — which IS on the render path — stays
 * reachable from `displayList.ts` (the §3.5 cacheKey serializer) at a few bytes.
 * Before the split, `displayList.ts` imported `collapseReplacer` from
 * `displayDiff.ts`, dragging the entire diff/snapshot module into every embed.
 *
 * Shared by the cacheKey serializer (`createDisplayListBuilder().cacheKey`),
 * `cacheColdAudit.hashDisplayList`, and `serializeDisplayList`. CRITICAL: this is
 * BYTE-PRESERVING — the cacheKey it backs stamps into pushGroup and keys the
 * §3.5 raster cache, so its output must not move. The three call sites previously
 * DUPLICATED this byte-for-byte; it lives here once.
 *
 *  - ArrayBuffer / typed-array views collapse to a `ab:<len>` / `view:<len>`
 *    length marker (opaque binary never belongs in a structural key).
 *  - Functions drop (JSON would already drop them; explicit for parity).
 *  - Non-finite numbers (`NaN`/`Infinity`/`-Infinity`) collapse to DISTINCT
 *    string sentinels. `JSON.stringify` natively serializes all three to the
 *    SAME token (`null`), which would collide the cacheKey of two DisplayLists
 *    that differ only in WHICH non-finite value reaches a draw field — a stale
 *    raster + an `auditCacheCold` false-OK. The distinct sentinels keep them
 *    apart. This does NOT touch FINITE numbers (the common path): only the
 *    three non-finite inputs change, so the §3.5 cacheKey bytes for every real
 *    (finite) list are byte-identical — pinned by the regression guard.
 *
 * NOTE: `-0` is intentionally NOT normalized here. The matrix layer
 * (`matrix.ts`) already normalizes `-0 → 0` at the source, and adding a `-0`
 * pass to THIS replacer would change the cacheKey bytes for any list that ever
 * carried a raw `-0` — silently invalidating the cache cluster-wide. (`-0` is
 * finite, so the non-finite branch never touches it.) Byte preservation wins;
 * the regression guard pins the exact key.
 */
export function collapseReplacer(_key: string, value: unknown): unknown {
  if (value instanceof ArrayBuffer) return `ab:${value.byteLength}`;
  if (ArrayBuffer.isView(value)) return `view:${(value as ArrayBufferView).byteLength}`;
  if (typeof value === 'function') return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) {
    if (Number.isNaN(value)) return 'NaN';
    return value > 0 ? 'Infinity' : '-Infinity';
  }
  return value;
}
