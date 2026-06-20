/**
 * Render-seam asset pre-validation (0.14 DX). The render path resolves every
 * Image/Video `assetId` against `timeline.assets` BEFORE warming/evaluate, so a
 * missing or undefined asset id surfaces the REAL authoring mistake — an
 * Image/Video needs an `assetId` + a `timeline.assets` entry { kind, url }, NOT
 * a `src` URL (§2.5: remote URLs are not fetched at render) — instead of the
 * downstream `asset 'undefined' not ready` ColdAssetError.
 *
 * This lives in the CLI (the only render-path consumer), not `scene`, so the
 * error-class string never enters the browser embed bundle. The node-walk reads
 * the `assetKind` static marker scene stamps on Image/Video, so it stays robust
 * even when jiti loads a second `@glissade/scene` instance (no `instanceof`).
 */

/** A minimal node shape — duck-typed so jiti's second scene instance still works. */
interface WalkNode {
  readonly id?: string | undefined;
  readonly children?: readonly WalkNode[];
  readonly assetId?: string;
  readonly constructor: { assetKind?: 'image' | 'video' };
}

/** A referenced asset id and the node kind that references it. */
export interface AssetReference {
  assetId: string | undefined;
  kind: 'image' | 'video';
  /** The referencing node's id, when it has one (for a clearer message). */
  nodeId: string | undefined;
}

/**
 * Walk a scene's node tree and collect every Image/Video asset reference. Pure
 * (no playhead) — the asset id a node references is structural, not a function
 * of time. `assetId` may be `undefined` at runtime (a JS caller that passed a
 * `src` URL instead of an `assetId` — the common codegen mistake), even though
 * scene's type says `string`; surfaced as-is.
 */
export function collectAssetReferences(root: WalkNode): AssetReference[] {
  const out: AssetReference[] = [];
  const visit = (node: WalkNode): void => {
    const kind = node.constructor.assetKind;
    if (kind !== undefined) out.push({ assetId: node.assetId, kind, nodeId: node.id });
    if (node.children) for (const child of node.children) visit(child);
  };
  visit(root);
  return out;
}

/**
 * An Image/Video node references an asset id that isn't declared in
 * `timeline.assets`. Distinct from ColdAssetError (a declared-but-not-warmed
 * asset) — this is an AUTHORING mistake caught before evaluation, and the
 * message names the most common cause: passing a `src` URL instead of an
 * `assetId` + a `timeline.assets` entry.
 */
export class UnknownAssetError extends Error {
  readonly assetId: string | undefined;
  readonly declared: readonly string[];

  constructor(ref: AssetReference, declared: readonly string[]) {
    const id = ref.assetId;
    const at = ref.nodeId !== undefined ? ` on ${ref.kind} node '${ref.nodeId}'` : ` on an ${ref.kind} node`;
    const declaredList = declared.length > 0 ? declared.join(', ') : '(none)';
    super(
      `assetId ${id === undefined ? '<undefined>' : `'${id}'`}${at} is not declared in ` +
        `timeline.assets (declared: ${declaredList}) — an Image/Video needs an \`assetId\` plus a ` +
        '`timeline.assets` entry { kind, url }, not a `src` URL; remote URLs are not fetched at render ' +
        '(§2.5 offline determinism)',
    );
    this.name = 'UnknownAssetError';
    this.assetId = id;
    this.declared = declared;
  }
}

/**
 * Pre-validate Image/Video asset references against the declared timeline asset
 * ids. Throws an UnknownAssetError naming the real mistake when a referenced id
 * is undefined or absent from `declaredIds`. A no-op when every reference is
 * declared.
 */
export function validateAssetReferences(refs: readonly AssetReference[], declaredIds: Iterable<string>): void {
  const declared = new Set(declaredIds);
  for (const ref of refs) {
    if (ref.assetId === undefined || !declared.has(ref.assetId)) {
      throw new UnknownAssetError(ref, [...declared]);
    }
  }
}
