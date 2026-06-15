// @glissade/svg — static SVG import: parse an SVG document into a glissade
// scene (Group of shape nodes). Pure, Node-and-browser-safe. Path `d` strings,
// the basic shapes, `<g>` grouping, transforms, and fill/stroke presentation
// are supported; text/images/gradients/filters/masks are dropped with warnings.

import { timeline } from '@glissade/core';
import { createScene, type Group, type SceneModule } from '@glissade/scene';
import { convertSvg } from './convert.js';
import { parseXml } from './xml.js';

export class SvgImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgImportError';
  }
}

export interface SvgImportResult {
  /** Intrinsic size from width/height or viewBox (falls back to 100×100). */
  size: { w: number; h: number };
  /** The imported tree as a single Group node (positioned in SVG user units). */
  root: Group;
  /** Non-fatal feature gaps (dropped elements, unsupported paint/transform). */
  warnings: string[];
  /** Wrap the import as a static, renderable SceneModule. */
  toSceneModule(): SceneModule;
}

/** Parse an SVG string and convert it to a glissade scene. Throws on no `<svg>`. */
export function importSvg(svg: string): SvgImportResult {
  const root = parseXml(svg);
  if (root === null || root.tag.replace(/^.*:/, '') !== 'svg') {
    throw new SvgImportError('[invalid-document] no root <svg> element found');
  }
  const { size, root: group, warnings } = convertSvg(root);
  return {
    size,
    root: group,
    warnings,
    toSceneModule(): SceneModule {
      return {
        createScene: () => createScene({ size, children: [group] }),
        timeline: timeline({ fps: 60, duration: 1, tracks: [] }),
      };
    },
  };
}

export { parseSvgPath } from './parser.js';
export { parseXml, type XmlNode } from './xml.js';
export { convertSvg, type ConvertResult } from './convert.js';
