/**
 * Scene-graph node base (DESIGN.md §3.1): every animatable property is a
 * signal; transforms are computed matrix signals; emit() is pure — it reads
 * signals and ctx only, and produces IR commands, never canvas calls.
 */

import {
  computed,
  signal,
  vec2Signal,
  TARGET_PATH,
  type BindableSignal,
  type ReadonlySignal,
  type Vec2,
  type Vec2Signal,
} from '@glissade/core';
import {
  type BlendMode,
  type DisplayListBuilder,
  type FilterSpec,
} from './displayList.js';
import { fromTRS, multiply, matEquals, IDENTITY, type Mat2x3 } from './matrix.js';

export interface EvalContext {
  /** The playhead value at evaluate() entry — the only time channel (§3.1). */
  readonly time: number;
  /** Derived: round(time * fps) when the timeline carries an fps advisory; -1 otherwise. */
  readonly frame: number;
}

/** A property initializer: a value, or a computed source (§2.1). */
export type PropInit<T> = T | (() => T);

export interface NodeProps {
  id?: string;
  position?: PropInit<Vec2>;
  rotation?: PropInit<number>;
  scale?: PropInit<Vec2>;
  opacity?: PropInit<number>;
  blend?: PropInit<BlendMode>;
  zIndex?: PropInit<number>;
}

export interface BindablePropTarget {
  bindSource(fn: () => unknown): void;
  unbindSource(): void;
}

function initScalar<T>(sig: BindableSignal<T>, init: PropInit<T> | undefined): BindableSignal<T> {
  if (typeof init === 'function') sig.bindSource(init as () => T);
  else if (init !== undefined) sig.set(init);
  return sig;
}

function initVec2(sig: Vec2Signal, init: PropInit<Vec2> | undefined): Vec2Signal {
  if (typeof init === 'function') sig.bindSource(init);
  else if (init !== undefined) sig.set(init);
  return sig;
}

export abstract class Node {
  readonly id: string | undefined;
  readonly position: Vec2Signal;
  readonly rotation: BindableSignal<number>;
  readonly scale: Vec2Signal;
  readonly opacity: BindableSignal<number>;
  readonly blend: BindableSignal<BlendMode>;
  readonly zIndex: BindableSignal<number>;
  readonly filters: BindableSignal<FilterSpec[]>;

  parent: Node | null = null;

  readonly localMatrix: ReadonlySignal<Mat2x3>;
  readonly worldMatrix: ReadonlySignal<Mat2x3>;

  /** Track-target paths → bindable signals; subclasses register their own props. */
  protected readonly targets = new Map<string, BindablePropTarget>();

  constructor(props: NodeProps = {}) {
    this.id = props.id;
    this.position = initVec2(vec2Signal([0, 0]), props.position);
    this.rotation = initScalar(signal(0), props.rotation);
    this.scale = initVec2(vec2Signal([1, 1]), props.scale);
    this.opacity = initScalar(signal(1), props.opacity);
    this.blend = initScalar(signal<BlendMode>('source-over'), props.blend);
    this.zIndex = initScalar(signal(0), props.zIndex);
    this.filters = initScalar(signal<FilterSpec[]>([]), undefined);

    this.localMatrix = computed(() => fromTRS(this.position(), this.rotation(), this.scale()), {
      equals: matEquals,
    });
    this.worldMatrix = computed(
      () => (this.parent ? multiply(this.parent.worldMatrix(), this.localMatrix()) : this.localMatrix()),
      { equals: matEquals },
    );

    this.registerTarget('position', this.position);
    this.registerTarget('position.x', this.position.x);
    this.registerTarget('position.y', this.position.y);
    this.registerTarget('rotation', this.rotation);
    this.registerTarget('scale', this.scale);
    this.registerTarget('scale.x', this.scale.x);
    this.registerTarget('scale.y', this.scale.y);
    this.registerTarget('opacity', this.opacity);
    this.registerTarget('zIndex', this.zIndex);
  }

  protected registerTarget(path: string, sig: BindablePropTarget): void {
    this.targets.set(path, sig);
    // builder targets (§2.6): a prop signal of an id-bearing node carries its path
    if (this.id !== undefined) {
      (sig as unknown as Record<symbol, string>)[TARGET_PATH] = `${this.id}/${path}`;
    }
  }

  resolveTarget(path: string): BindablePropTarget | undefined {
    return this.targets.get(path);
  }

  /** Subclass drawing: emit own commands (and children for containers). */
  protected abstract draw(out: DisplayListBuilder, ctx: EvalContext): void;

  /** §3.5 predicate: composite-as-a-unit when opacity/blend demand it. */
  protected requiresGroup(): boolean {
    return this.opacity() < 1 || this.blend() !== 'source-over';
  }

  emit(out: DisplayListBuilder, ctx: EvalContext): void {
    const opacity = this.opacity();
    if (opacity <= 0) return;
    const local = this.localMatrix();
    const isIdentity = matEquals(local, IDENTITY);
    const group = this.requiresGroup();
    out.push({ op: 'save' });
    if (!isIdentity) out.push({ op: 'transform', m: local });
    if (group) out.push({ op: 'pushGroup', opacity, blend: this.blend(), filters: this.filters() });
    this.draw(out, ctx);
    if (group) out.push({ op: 'popGroup' });
    out.push({ op: 'restore' });
  }
}
