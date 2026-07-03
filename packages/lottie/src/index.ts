// @glissade/lottie — Lottie/bodymovin import (S1 MVP, docs/evaluations/
// lottie-import.md): pure conversion, Node-and-browser-safe. Fail-fast
// feature audit; `allowDegraded` downgrades the defined subset to warnings.

import { createScene, type SceneModule } from '@glissade/scene';
import { auditDocument } from './audit.js';
import { buildNodes } from './build.js';
import { convertDocument } from './convert.js';
import { LottieImportError, type LottieImportResult } from './spec.js';
import type { LottieDocument } from './types.js';

export interface ImportOptions {
  /** Downgrade degradable rejections (expressions, merge-paths modes ≠ 1) to warnings. */
  allowDegraded?: boolean;
}

function assertDocument(json: unknown): LottieDocument {
  const doc = json as Partial<LottieDocument> | null;
  if (
    doc === null ||
    typeof doc !== 'object' ||
    typeof doc.fr !== 'number' ||
    doc.fr <= 0 ||
    typeof doc.ip !== 'number' ||
    typeof doc.op !== 'number' ||
    typeof doc.w !== 'number' ||
    typeof doc.h !== 'number' ||
    !Array.isArray(doc.layers)
  ) {
    throw new LottieImportError(['[invalid-document] not a Lottie document (missing fr/ip/op/w/h/layers)']);
  }
  return doc as LottieDocument;
}

export function importLottie(json: unknown, opts: ImportOptions = {}): LottieImportResult {
  const doc = assertDocument(json);
  const { warnings } = auditDocument(doc, opts.allowDegraded === true);
  const out = convertDocument(doc, warnings);
  return {
    ...out,
    toSceneModule(): SceneModule {
      return {
        createScene: () => createScene({ size: out.size, children: buildNodes(out.nodes) }),
        timeline: out.timeline,
      };
    },
  };
}

export { LottieImportError } from './spec.js';
export type {
  LottieImportResult,
  NodeSpec,
  GroupSpec,
  PathSpec,
  RectSpec,
  ImageSpec,
} from './spec.js';
export { buildNode, buildNodes } from './build.js';
export { generateSceneModule, type CodegenOptions } from './codegen.js';
export { ellipseContour, rectContour, mergeContours, reverseContour, shToContour, KAPPA } from './pathvalue.js';
export { colorPropIsBytes, lottieColor } from './convert.js';
// Track → Lottie EXPORT (the inverse of the importer above): a SceneModule → a
// LottieDocument. Pure conversion, off the base embed.
export { exportLottie, type ExportOptions } from './export.js';
export type { LottieDocument } from './types.js';
