/**
 * The fluent timeline builder (DESIGN.md §2.6): imperative-LOOKING chains that
 * compile to the declarative Timeline document. Nothing executes at play time.
 *
 * Position grammar (GSAP-proven): absolute `1.5`; `'+=0.5'`/`'-=0.2'` from the
 * previous insertion's END; `'<'`/`'>'` previous START/END; `'label'`,
 * `'label+=0.3'`. Implicit from-values resolve in a finalize pass in t-order
 * against the complete document — never sampled live (the GSAP invalidate()
 * bug class, §2.6), with the build-time signal value as the t-order base.
 */

import { DEFAULT_EASE, type EaseSpec } from './easing.js';
import { spring as springFactory } from './spring.js';
import {
  compileTimeline,
  timeline as makeTimeline,
  TimelineValidationError,
  type ChildEntry,
  type Marker,
  type Timeline,
  type TimelineInit,
} from './timeline.js';
import { type Key, type Track } from './track.js';
import { resolveTweenTarget, type TweenTarget } from './targetRef.js';
import { parseColor } from './color.js';
import { type ValueTypeId } from './valueTypes.js';

export type Position = number | string;

export interface TweenOpts {
  duration?: number;
  ease?: EaseSpec;
  at?: Position;
}

export interface TimelineBuilder {
  to<T>(target: TweenTarget, value: T, opts?: TweenOpts): TimelineBuilder;
  fromTo<T>(target: TweenTarget, from: T, to: T, opts?: TweenOpts): TimelineBuilder;
  /** Hold key: the value snaps at the resolved position (§2.6). */
  set<T>(target: TweenTarget, value: T, opts?: { at?: Position }): TimelineBuilder;
  label(name: string, at?: Position): TimelineBuilder;
  add(child: Timeline, at?: Position, opts?: { mode?: 'add' | 'sync'; timeScale?: number }): TimelineBuilder;
  /** Compiles to a marker; the callback is Player-registered, never serialized (§4.2). */
  call(fn: () => void, at?: Position): TimelineBuilder;
  /** Mark the preceding track editable for the studio (§6.2). */
  editable(): TimelineBuilder;
}

interface Insertion {
  kind: 'tween' | 'set';
  target: string;
  explicitFrom?: unknown;
  value: unknown;
  duration: number;
  ease: EaseSpec;
  at: Position | undefined;
  /** Build-time signal value, the t-order base for derived from-values. */
  baseValue: unknown;
  editable: boolean;
  start: number; // resolved by finalize
}

export class PositionError extends Error {
  constructor(pos: string, detail: string) {
    super(`invalid position '${pos}': ${detail}`);
    this.name = 'PositionError';
  }
}

function inferValueType(value: unknown): ValueTypeId {
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
  throw new TimelineValidationError(`cannot infer a value type for ${JSON.stringify(value)}; register a custom type`);
}

function peekBase(target: TweenTarget): unknown {
  return typeof target !== 'string' && typeof (target as { peek?: () => unknown }).peek === 'function'
    ? (target as { peek: () => unknown }).peek()
    : undefined;
}

/** Callbacks registered via .call(), keyed by the produced document. */
const timelineCallbacks = new WeakMap<Timeline, Map<string, () => void>>();

export function getTimelineCallbacks(doc: Timeline): ReadonlyMap<string, () => void> {
  return timelineCallbacks.get(doc) ?? new Map();
}

export function buildTimeline(
  build: (tl: TimelineBuilder) => void,
  init: Omit<TimelineInit, 'tracks' | 'children' | 'markers'> = {},
): Timeline {
  const insertions: Insertion[] = [];
  const labels: Record<string, number> = { ...init.labels };
  const children: (ChildEntry & { _pos: Position | undefined })[] = [];
  const markers: Marker[] = [];
  const callbacks = new Map<string, () => void>();

  // resolved cursor state, updated per insertion as positions resolve eagerly
  let prevStart = 0;
  let prevEnd = 0;
  let callCount = 0;

  function resolvePosition(at: Position | undefined): number {
    if (at === undefined) return prevEnd;
    if (typeof at === 'number') return at;
    if (at === '<') return prevStart;
    if (at === '>') return prevEnd;
    const rel = /^([+-])=([\d.]+)$/.exec(at);
    if (rel) return prevEnd + (rel[1] === '+' ? 1 : -1) * parseFloat(rel[2]!);
    const labelRel = /^([^+\-=]+?)(?:([+-])=([\d.]+))?$/.exec(at);
    if (labelRel) {
      const name = labelRel[1]!;
      if (!(name in labels)) throw new PositionError(at, `unknown label '${name}' (labels must be declared before use)`);
      const offset = labelRel[2] ? (labelRel[2] === '+' ? 1 : -1) * parseFloat(labelRel[3]!) : 0;
      return labels[name]! + offset;
    }
    throw new PositionError(at, "expected a number, '<', '>', '+=x', '-=x', or 'label[+=x]'");
  }

  const builder: TimelineBuilder = {
    to(target, value, opts = {}) {
      const ease = opts.ease ?? DEFAULT_EASE;
      const isSpring = typeof ease === 'object' && ease.kind === 'spring';
      const duration = isSpring
        ? springFactory.duration(ease) // §2.7: a spring determines its own duration
        : (opts.duration ?? 1);
      if (isSpring && opts.duration !== undefined) {
        throw new TimelineValidationError(
          'a spring ease determines its duration (spring.duration(cfg)); do not pass duration with a spring',
        );
      }
      const start = resolvePosition(opts.at);
      insertions.push({
        kind: 'tween',
        target: resolveTweenTarget(target),
        value,
        duration,
        ease,
        at: opts.at,
        baseValue: peekBase(target),
        editable: false,
        start,
      });
      prevStart = start;
      prevEnd = start + duration;
      return builder;
    },
    fromTo(target, from, to, opts = {}) {
      builder.to(target, to, opts);
      insertions[insertions.length - 1]!.explicitFrom = from;
      return builder;
    },
    set(target, value, opts = {}) {
      const start = resolvePosition(opts.at);
      insertions.push({
        kind: 'set',
        target: resolveTweenTarget(target),
        value,
        duration: 0,
        ease: 'linear',
        at: opts.at,
        baseValue: peekBase(target),
        editable: false,
        start,
      });
      prevStart = start;
      prevEnd = start;
      return builder;
    },
    label(name, at) {
      labels[name] = at === undefined ? prevEnd : resolvePosition(at);
      return builder;
    },
    add(child, at, opts = {}) {
      const start = at === undefined ? prevEnd : resolvePosition(at);
      const mode = opts.mode ?? 'add';
      const entry: ChildEntry & { _pos: Position | undefined } = {
        timeline: child,
        at: start,
        mode,
        _pos: at,
      };
      if (opts.timeScale !== undefined) entry.timeScale = opts.timeScale;
      children.push(entry);
      const scale = mode === 'sync' ? (opts.timeScale ?? 1) : 1;
      prevStart = start;
      prevEnd = start + compileTimeline(child).duration / scale;
      return builder;
    },
    call(fn, at) {
      const t = at === undefined ? prevEnd : resolvePosition(at);
      const name = `call:${callCount++}`;
      markers.push({ t, name });
      callbacks.set(name, fn);
      return builder;
    },
    editable() {
      const last = insertions[insertions.length - 1];
      if (!last) throw new TimelineValidationError('.editable() requires a preceding insertion');
      last.editable = true;
      return builder;
    },
  };

  build(builder);

  // finalize pass (§2.6): per target in t-order, resolve implicit from-values
  // against the complete document — insertion order is irrelevant here.
  const byTarget = new Map<string, Insertion[]>();
  for (const ins of insertions) {
    let list = byTarget.get(ins.target);
    if (!list) {
      list = [];
      byTarget.set(ins.target, list);
    }
    list.push(ins);
  }

  const tracks: Track[] = [];
  for (const [target, list] of byTarget) {
    list.sort((a, b) => a.start - b.start);
    const keys: Key[] = [];
    const editable = list.some((i) => i.editable);
    let prevValue: unknown = list.find((i) => i.baseValue !== undefined)?.baseValue;
    for (const ins of list) {
      if (ins.kind === 'set') {
        keys.push({ t: ins.start, value: ins.value, interp: 'hold' });
        prevValue = ins.value;
        continue;
      }
      const from = ins.explicitFrom !== undefined ? ins.explicitFrom : prevValue;
      const lastKey = keys[keys.length - 1];
      if (from !== undefined && (!lastKey || lastKey.t < ins.start)) {
        const fromKey: Key = { t: ins.start, value: from };
        if (ins.explicitFrom === undefined) fromKey.derived = true;
        // a derived from-key duplicates the held value, so the arriving
        // segment is constant — no visual pop (§2.6)
        if (!lastKey || ins.start > lastKey.t) keys.push(fromKey);
      }
      keys.push({ t: ins.start + ins.duration, value: ins.value, ease: ins.ease });
      prevValue = ins.value;
    }
    // builder may produce coincident keys (back-to-back tweens); later wins
    const deduped: Key[] = [];
    for (const k of keys.sort((a, b) => a.t - b.t)) {
      const last = deduped[deduped.length - 1];
      if (last && last.t === k.t) deduped[deduped.length - 1] = k;
      else deduped.push(k);
    }
    const type = inferValueType(list[0]!.value);
    const tr: Track = { target, type, keys: deduped };
    if (editable) tr.editable = true;
    tracks.push(tr);
  }

  const doc = makeTimeline({
    ...init,
    tracks,
    labels,
    ...(markers.length ? { markers } : {}),
    ...(children.length ? { children: children.map(({ _pos, ...c }) => c) } : {}),
  });
  if (callbacks.size) timelineCallbacks.set(doc, callbacks);
  return doc;
}

/** The two authoring surfaces, one entry point (§2.6). */
export function timeline(init: TimelineInit): Timeline;
export function timeline(
  build: (tl: TimelineBuilder) => void,
  init?: Omit<TimelineInit, 'tracks' | 'children' | 'markers'>,
): Timeline;
export function timeline(
  arg: TimelineInit | ((tl: TimelineBuilder) => void),
  init?: Omit<TimelineInit, 'tracks' | 'children' | 'markers'>,
): Timeline {
  return typeof arg === 'function' ? buildTimeline(arg, init) : makeTimeline(arg);
}
