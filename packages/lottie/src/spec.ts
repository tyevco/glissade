/**
 * Importer output shape: a buildable tree of constructor specs (plain data —
 * Node-and-browser-safe) plus the v1 Timeline. toSceneModule() turns specs
 * into real @glissade/scene nodes.
 */

import type { PathValue, Timeline, Vec2 } from '@glissade/core';

export interface BaseSpec {
  id: string;
  position?: Vec2;
  rotation?: number;
  scale?: Vec2;
  opacity?: number;
  zIndex?: number;
}

export interface GroupSpec extends BaseSpec {
  kind: 'group';
  children: NodeSpec[];
}

export interface PathSpec extends BaseSpec {
  kind: 'path';
  data: PathValue;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface RectSpec extends BaseSpec {
  kind: 'rect';
  width: number;
  height: number;
  fill?: string;
}

export interface ImageSpec extends BaseSpec {
  kind: 'image';
  assetId: string;
  width: number;
  height: number;
}

export interface TextSpec extends BaseSpec {
  kind: 'text';
  text: string;
  fill: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  lineHeight?: number;
}

export type NodeSpec = GroupSpec | PathSpec | RectSpec | ImageSpec | TextSpec;

export interface LottieImportResult {
  size: { w: number; h: number };
  nodes: NodeSpec[];
  timeline: Timeline;
  warnings: string[];
  /** Construct real @glissade/scene nodes: { createScene, timeline }. */
  toSceneModule(): import('@glissade/scene').SceneModule;
}

export class LottieImportError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Lottie import rejected ${problems.length} unsupported feature(s):\n` +
        problems.map((p) => `  - ${p}`).join('\n'),
    );
    this.name = 'LottieImportError';
    this.problems = problems;
  }
}
