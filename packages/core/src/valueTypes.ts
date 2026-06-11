/**
 * Value-type registry with pluggable per-type interpolation (DESIGN.md §2.2).
 * `extrapolates` declares whether a type's lerp accepts easedT outside [0,1]
 * (spring overshoot); non-extrapolating types clamp.
 */

import { lerpColor, parseColor } from './color.js';

export type Vec2 = readonly [number, number];

export interface ValueType<T> {
  id: string;
  lerp(a: T, b: T, t: number): T;
  /** Accepts easedT outside [0,1] (spring overshoot)? Otherwise clamped. */
  extrapolates: boolean;
  equals(a: T, b: T): boolean;
}

export type ValueTypeId = 'number' | 'vec2' | 'color' | 'string' | 'boolean' | (string & {});

const registry = new Map<string, ValueType<never>>();

export function registerValueType<T>(vt: ValueType<T>): void {
  registry.set(vt.id, vt as ValueType<never>);
}

export class UnknownValueTypeError extends Error {
  constructor(id: string) {
    super(`unknown value type '${id}'; register it via registerValueType()`);
    this.name = 'UnknownValueTypeError';
  }
}

export function getValueType<T = unknown>(id: ValueTypeId): ValueType<T> {
  const vt = registry.get(id);
  if (!vt) throw new UnknownValueTypeError(id);
  return vt as ValueType<T>;
}

export const numberType: ValueType<number> = {
  id: 'number',
  lerp: (a, b, t) => a + (b - a) * t,
  extrapolates: true,
  equals: Object.is,
};

export const vec2Equals = (a: Vec2, b: Vec2): boolean => a[0] === b[0] && a[1] === b[1];

export const vec2Type: ValueType<Vec2> = {
  id: 'vec2',
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  extrapolates: true,
  equals: vec2Equals,
};

export const colorType: ValueType<string> = {
  id: 'color',
  lerp: lerpColor,
  extrapolates: true,
  equals: (a, b) => a === b,
};

/** Discrete types: hold-only by construction (§2.2); lerp snaps at t=1. */
function discrete<T>(id: string): ValueType<T> {
  return {
    id,
    lerp: (a, b, t) => (t >= 1 ? b : a),
    extrapolates: false,
    equals: (a, b) => Object.is(a, b),
  };
}

export const stringType = discrete<string>('string');
export const booleanType = discrete<boolean>('boolean');

export class ValueTypeInferenceError extends Error {
  constructor(value: unknown) {
    super(`cannot infer a value type for ${JSON.stringify(value)}; register a custom type`);
    this.name = 'ValueTypeInferenceError';
  }
}

/** Infer a registered type id from a sample value (builder + bake authoring surfaces). */
export function inferValueType(value: unknown): ValueTypeId {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number')) {
    return 'vec2';
  }
  if (typeof value === 'string') {
    try {
      parseColor(value);
      return 'color';
    } catch {
      return 'string';
    }
  }
  throw new ValueTypeInferenceError(value);
}

registerValueType(numberType);
registerValueType(vec2Type);
registerValueType(colorType);
registerValueType(stringType);
registerValueType(booleanType);
