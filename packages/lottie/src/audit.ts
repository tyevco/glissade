/**
 * Fail-fast feature audit (lottie-import.md §1): ONE pass over the document
 * collecting EVERY unsupported feature, so users see all rejections at once.
 * `allowDegraded` downgrades the defined degradable subset (expressions,
 * merge-paths modes ≠ 1) to warnings; degradations are never silent.
 */

import { LottieImportError } from './spec.js';
import { isKeyframed, normalizeKeys, scalarOf } from './keyframes.js';
import type {
  LottieDocument,
  LottieKeyframe,
  LottieLayer,
  LottieProp,
  LottieShapeItem,
  LottieSplitPosition,
  LottieTransform,
} from './types.js';

export interface AuditResult {
  warnings: string[];
}

const LAYER_TYPE_NAMES: Record<number, string> = {
  0: 'precomp',
  5: 'text',
  6: 'audio',
  7: 'pholderVideo',
  8: 'imageSeq',
  9: 'video',
  10: 'pholderStill',
  13: 'camera',
};

const SUPPORTED_LAYER_TYPES = new Set([1, 2, 3, 4]);

interface Ctx {
  problems: string[];
  warnings: string[];
  allowDegraded: boolean;
}

function reject(ctx: Ctx, errorClass: string, detail: string): void {
  ctx.problems.push(`[${errorClass}] ${detail}`);
}

function degrade(ctx: Ctx, errorClass: string, detail: string): void {
  if (ctx.allowDegraded) ctx.warnings.push(`[${errorClass}] ${detail} — skipped (degraded)`);
  else {
    ctx.problems.push(
      `[${errorClass}] ${detail} (degradable: re-run with allowDegraded to warn and skip)`,
    );
  }
}

const isProp = (v: unknown): v is LottieProp =>
  typeof v === 'object' && v !== null && ('k' in v || 'a' in v || 'x' in v);

function checkExpression(ctx: Ctx, prop: unknown, where: string): void {
  if (isProp(prop) && typeof prop.x === 'string' && prop.x.length > 0) {
    degrade(ctx, 'unsupported-expression', `expression on ${where}`);
  }
}

/** Non-zero (or animated) skew is unrepresentable in fromTRS. */
function checkSkew(ctx: Ctx, tr: LottieTransform, where: string): void {
  for (const [name, prop] of [
    ['sk', tr.sk],
    ['sa', tr.sa],
  ] as const) {
    if (prop === undefined) continue;
    if (isKeyframed(prop)) {
      const values = normalizeKeys(prop.k as LottieKeyframe[]).map((k) => scalarOf(k.value));
      if (values.some((v) => Math.abs(v) > 1e-9)) {
        reject(ctx, 'unsupported-transform', `animated skew (${name}) on ${where}`);
      }
    } else if (prop.k !== undefined && Math.abs(scalarOf(prop.k)) > 1e-9) {
      reject(ctx, 'unsupported-transform', `skew (${name}) on ${where}`);
    }
  }
}

function checkTransformExpressions(ctx: Ctx, tr: LottieTransform, where: string): void {
  const p = tr.p;
  if (p && (p as LottieSplitPosition).s === true) {
    checkExpression(ctx, (p as LottieSplitPosition).x, `${where}.p.x`);
    checkExpression(ctx, (p as LottieSplitPosition).y, `${where}.p.y`);
  } else checkExpression(ctx, p, `${where}.p`);
  checkExpression(ctx, tr.a, `${where}.a`);
  checkExpression(ctx, tr.s, `${where}.s`);
  checkExpression(ctx, tr.r, `${where}.r`);
  checkExpression(ctx, tr.o, `${where}.o`);
}

const UNSUPPORTED_SHAPE_ITEMS: Record<string, string> = {
  tm: 'trim paths',
  rp: 'repeater',
  rd: 'round corners',
  sr: 'polystar',
  gf: 'gradient fill',
  gs: 'gradient stroke',
  // geometry-modifying modern items: NOT inert, must never pass silently (§1)
  zz: 'zig-zag',
  op: 'offset path',
  pb: 'pucker & bloat',
  tw: 'twist',
};

function auditShapeItems(ctx: Ctx, items: LottieShapeItem[], where: string): void {
  let sawGroup = false;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.hd === true) continue; // hidden items are never rendered
    const here = `${where}/${item.nm ?? `${item.ty}[${i}]`}`;
    if (item.ty === 'st' && (item as { d?: unknown }).d !== undefined) {
      reject(ctx, 'unsupported-feature', `stroke dashes at ${here}`);
    }
    const unsupported = UNSUPPORTED_SHAPE_ITEMS[item.ty];
    if (unsupported) {
      reject(ctx, 'unsupported-shape-item', `${unsupported} at ${here}`);
      continue;
    }
    switch (item.ty) {
      case 'gr': {
        sawGroup = true;
        const inner = item.it ?? [];
        const tr = inner.find((it) => it.ty === 'tr') as LottieTransform | undefined;
        if (tr) {
          checkSkew(ctx, tr, here);
          checkTransformExpressions(ctx, tr, here);
        }
        auditShapeItems(ctx, inner.filter((it) => it.ty !== 'tr'), here);
        break;
      }
      case 'sh':
        checkExpression(ctx, item.ks, here);
        break;
      case 'el':
      case 'rc':
        checkExpression(ctx, item.p, `${here}.p`);
        checkExpression(ctx, item.s, `${here}.s`);
        checkExpression(ctx, item.r, `${here}.r`);
        break;
      case 'fl':
      case 'st': {
        if (item.ty === 'fl' && typeof item.r === 'number' && item.r === 2) {
          reject(ctx, 'unsupported-fill-rule', `even-odd fill at ${here}`);
        }
        // a style after a sibling group would also paint that group's
        // geometry (lottie style inheritance) — out of the S1 cut
        if (sawGroup) {
          reject(ctx, 'unsupported-shape-structure', `style inheriting into a preceding group at ${here}`);
        }
        checkExpression(ctx, item.c, `${here}.c`);
        checkExpression(ctx, item.o, `${here}.o`);
        checkExpression(ctx, item.w, `${here}.w`);
        break;
      }
      case 'mm': {
        const mode = item.mm ?? 1;
        if (mode !== 1) {
          degrade(ctx, 'unsupported-shape-modifier', `merge paths mode ${mode} at ${here}`);
        }
        break;
      }
      default:
        break; // tr handled by the group; unknown inert items pass through
    }
  }
}

function auditLayer(ctx: Ctx, layer: LottieLayer, index: number, doc: LottieDocument): void {
  if (layer.hd === true) return; // hidden layers are never rendered
  const where = `layer ${layer.ind ?? index} '${layer.nm ?? '?'}'`;
  if (!SUPPORTED_LAYER_TYPES.has(layer.ty)) {
    const name = LAYER_TYPE_NAMES[layer.ty] ?? `ty:${layer.ty}`;
    reject(ctx, 'unsupported-layer-type', `${name} ${where}`);
    return; // contents of a rejected layer would only duplicate the rejection
  }
  if (layer.ddd === 1) reject(ctx, 'unsupported-feature', `3D layer ${where}`);
  if ((layer.masksProperties?.length ?? 0) > 0 || layer.hasMask === true) {
    reject(ctx, 'unsupported-masking', `masks on ${where}`);
  }
  if (layer.tt !== undefined && layer.tt !== 0) {
    reject(ctx, 'unsupported-masking', `track matte (tt:${layer.tt}) on ${where}`);
  }
  if (layer.td !== undefined && layer.td !== 0) {
    reject(ctx, 'unsupported-masking', `matte source (td:${layer.td}) ${where}`);
  }
  if (layer.tm !== undefined) reject(ctx, 'unsupported-time-remap', `time remap on ${where}`);
  if ((layer.ef?.length ?? 0) > 0) reject(ctx, 'unsupported-feature', `effects on ${where}`);
  if ((layer.sy?.length ?? 0) > 0) reject(ctx, 'unsupported-feature', `layer styles on ${where}`);
  if (layer.sr !== undefined && layer.sr !== 1) {
    // sr stretches only precomp children in lottie-web (Stage 2 timeScale);
    // on ordinary layers a stretched mapping would diverge from the reference
    reject(ctx, 'unsupported-time-remap', `layer time stretch (sr:${layer.sr}) on ${where}`);
  }
  if (layer.ao === 1) reject(ctx, 'unsupported-transform', `auto-orient on ${where}`);
  if (layer.ks) {
    checkSkew(ctx, layer.ks, where);
    checkTransformExpressions(ctx, layer.ks, where);
  }
  if (layer.ty === 2) {
    const asset = (doc.assets ?? []).find((a) => a.id === layer.refId);
    if (!asset || typeof asset.p !== 'string') {
      reject(ctx, 'invalid-asset', `image ${where} references missing asset '${layer.refId ?? ''}'`);
    }
  }
  if (layer.shapes) auditShapeItems(ctx, layer.shapes, where);
}

/** Throws LottieImportError listing EVERY rejection; returns collected warnings. */
export function auditDocument(doc: LottieDocument, allowDegraded: boolean): AuditResult {
  const ctx: Ctx = { problems: [], warnings: [], allowDegraded };
  if (doc.ddd === 1) reject(ctx, 'unsupported-feature', '3D document');
  doc.layers.forEach((layer, i) => auditLayer(ctx, layer, i, doc));
  if (ctx.problems.length > 0) throw new LottieImportError(ctx.problems);
  return { warnings: ctx.warnings };
}
