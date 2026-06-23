/**
 * The SLIM construction-prop NAME set (0.20) — the embed-path-safe half of the
 * describe() schema. A construction prop (`animatable: false`) is passed to a
 * node's constructor and is NEVER a track target; binding one is rejected.
 *
 * This module carries ONLY the per-node-type set of construction-prop NAMES
 * (plus the shared base set), nothing else — no value types, no `required`
 * flags, no manifest scaffolding. That keeps it tiny: it rides on the
 * embed/bind path (the bind guard imports it to turn a generic UnboundTarget
 * into a friendlier "that's a construction prop" message), so it must stay
 * byte-cheap. `describe.ts` imports the SAME sets and layers its richer
 * per-prop metadata (type/required) on top, so the manifest and this lookup
 * can't drift.
 */

/**
 * Base `NodeProps` construction-prop names shared by EVERY node — set once at
 * `new Node({...})`, never animatable (none is a registered target).
 */
export const BASE_CONSTRUCTION_PROP_NAMES: readonly string[] = ['id', 'blend', 'filters', 'anchor', 'cache'];

/**
 * Each built-in node's OWN construction-prop names (the base set is merged in
 * separately, via {@link isConstructionProp}). Keyed by the describe TYPE NAME
 * (e.g. `Image`, not the `ImageNode` class name).
 */
const SKETCH = ['sketch', 'sketchFill', 'sketchSeed'];
// Layout family (curated, lives on @glissade/scene/layout). Stack/Row/Column
// are ergonomic factories over Layout — same construction surface, so they
// share the one array.
const LAYOUT = ['direction', 'justify', 'align', 'children'];

export const NODE_CONSTRUCTION_PROP_NAMES: { readonly [typeName: string]: readonly string[] } = {
  Group: ['children'],
  Rect: SKETCH,
  Circle: SKETCH,
  Path: SKETCH,
  Text: ['fontFamily', 'fontWeight', 'fontStyle', 'align', 'lineHeight', 'fontVariationSettings', 'letterSpacing'],
  Image: ['assetId'],
  Video: ['assetId', 'at', 'trimStart', 'playbackRate', 'clipDuration', 'sourceFps'],
  Layout: LAYOUT,
  Stack: LAYOUT,
  Row: LAYOUT,
  Column: LAYOUT,
};

/**
 * Is `prop` a KNOWN construction-only prop for a node of describe-type
 * `typeName`? True for the shared base set or that type's own set. Used by the
 * bind guard to special-case the unbound-target error: a construction prop gets
 * a "set it at construction" message instead of the generic one.
 */
export function isConstructionProp(typeName: string, prop: string): boolean {
  if (BASE_CONSTRUCTION_PROP_NAMES.includes(prop)) return true;
  const own = NODE_CONSTRUCTION_PROP_NAMES[typeName];
  return own !== undefined && own.includes(prop);
}

/**
 * Construction keys that are NEITHER a construction-prop name NOR the same-named
 * animatable target — so the `acceptedConstructionKeys` union below would miss
 * them and the constructor guard would false-positive. Today this is ONLY
 * `Path`: you construct it with `{ data }`, but its animatable target is
 * registered as `d` (so `d` is in the target set, `data` is in neither). Without
 * this alias `new Path({ data })` would wrongly throw.
 */
const CONSTRUCTION_KEY_ALIASES: { readonly [typeName: string]: readonly string[] } = {
  Path: ['data'],
};

/**
 * The FULL set of prop keys a node of describe-type `typeName` accepts at
 * CONSTRUCTION — the allow-list the node constructor guard ({@link Node.checkProps})
 * validates incoming `props` against, so an unknown key throws instead of being
 * silently dropped (the `new Rect({ size:[…] })` → invisible-box footgun).
 *
 * It's the union of three drift-free sources, so it can never disagree with what
 * the constructors actually honor:
 *  - the shared base construction props + this type's own construction props
 *    (the SAME name sets `describe()` and the bind guard read);
 *  - the **un-dotted** names of this node's registered animatable targets
 *    (`targetPaths` — the live `registerTarget` set; animatable props are settable
 *    at construction too). A dotted sub-path like `position.x` collapses to its
 *    head `position`: the dotted form is a TWEEN target (`to('id/position.x', …)`),
 *    never a constructor key, so it is correctly NOT accepted at construction;
 *  - the per-type construction-key aliases above (Path's `data`).
 */
export function acceptedConstructionKeys(typeName: string, targetPaths: Iterable<string>): Set<string> {
  const keys = new Set<string>(BASE_CONSTRUCTION_PROP_NAMES);
  const own = NODE_CONSTRUCTION_PROP_NAMES[typeName];
  if (own !== undefined) for (const k of own) keys.add(k);
  const alias = CONSTRUCTION_KEY_ALIASES[typeName];
  if (alias !== undefined) for (const k of alias) keys.add(k);
  for (const path of targetPaths) {
    const dot = path.indexOf('.');
    keys.add(dot === -1 ? path : path.slice(0, dot));
  }
  return keys;
}
