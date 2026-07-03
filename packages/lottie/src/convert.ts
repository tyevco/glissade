/**
 * Document conversion (lottie-import.md §3 Stage 1): layers → constructor
 * specs + Timeline tracks. Structural rules: the anchor sandwich (outer node
 * carries p/r/s, inner child offset by −a), parent chains nest into the
 * parent's anchor group, layer opacity lives on a CONTENT sibling (Lottie
 * parenting never inherits opacity), ip/op become hold-key opacity wrappers,
 * and Lottie's top-layer-first stacking maps to zIndex = −ind.
 */

import {
  formatColor,
  track as makeTrack,
  type AssetRef,
  type ColorStop,
  type Key,
  type Paint,
  type PathValue,
  type Timeline,
  type Track,
  type Vec2,
  sampleTrack,
} from '@glissade/core';
import {
  convertKeys,
  convertPositionKeys,
  easesDifferPerDim,
  enforceMonotonic,
  isKeyframed,
  normalizeKeys,
  scalarOf,
  toSeconds,
  vec2Of,
  type NormKey,
  type TimeMap,
} from './keyframes.js';
import { ellipseContour, mergeContours, rectContour, reverseContour, shToContour } from './pathvalue.js';
import type { GroupSpec, ImageSpec, NodeSpec, PathSpec, RectSpec, TextSpec } from './spec.js';
import type {
  LottieDocument,
  LottieFont,
  LottieKeyframe,
  LottieLayer,
  LottieProp,
  LottieShapeItem,
  LottieShapePathData,
  LottieSplitPosition,
  LottieTextDocKeyframe,
  LottieTransform,
} from './types.js';

interface Ctx {
  doc: LottieDocument;
  tracks: Track[];
  warnings: string[];
  assets: Record<string, AssetRef>;
  ids: Set<string>;
  /** Seconds shift so the document's ip lands at t = 0. */
  offset: number;
}

function uid(ctx: Ctx, base: string): string {
  const clean = base.replace(/[^A-Za-z0-9_]/g, '_') || 'node';
  let id = clean;
  for (let n = 2; ctx.ids.has(id); n++) id = `${clean}_${n}`;
  ctx.ids.add(id);
  return id;
}

const norms = (prop: LottieProp | undefined): NormKey[] | undefined =>
  isKeyframed(prop) ? normalizeKeys(prop!.k as LottieKeyframe[]) : undefined;

/**
 * Lottie color array → hex. The byte-vs-float format is a property of the
 * EXPORTER (whole prop), never of one key: a [1,1,1] key inside a byte-format
 * track is rgb(1,1,1) near-black, not white — so callers classify once over
 * every value of the prop and pass `bytes` in.
 */
export function lottieColor(value: unknown, bytes: boolean): string {
  const arr = value as number[];
  const ch = (i: number): number => (bytes ? (arr[i] ?? 0) : (arr[i] ?? 0) * 255);
  const a = arr.length > 3 ? (bytes ? (arr[3] ?? 255) / 255 : (arr[3] ?? 1)) : 1;
  return formatColor({ r: ch(0), g: ch(1), b: ch(2), a });
}

/** True when ANY component across the prop's values exceeds 1 (old byte exports). */
export function colorPropIsBytes(values: unknown[]): boolean {
  return values.some((v) => Array.isArray(v) && (v as number[]).some((c) => c > 1));
}

function pushTrack<T>(ctx: Ctx, target: string, type: string, keys: Key<T>[]): void {
  if (keys.length === 0) return;
  ctx.tracks.push(makeTrack(target, type, keys));
}

// --- transforms ---

const isSplitPosition = (p: LottieProp | LottieSplitPosition | undefined): p is LottieSplitPosition =>
  p !== undefined && (p as LottieSplitPosition).s === true;

function applyScalarProp(
  ctx: Ctx,
  spec: { id: string },
  prop: LottieProp | undefined,
  targetPath: string,
  map: (v: number) => number,
  assign: (v: number) => void,
  tm: TimeMap,
): void {
  if (prop === undefined) return;
  const n = norms(prop);
  if (n) {
    const keys = convertKeys(n, tm, (v) => map(scalarOf(v)));
    assign(keys[0]!.value);
    pushTrack(ctx, `${spec.id}/${targetPath}`, 'number', keys);
  } else if (prop.k !== undefined) {
    assign(map(scalarOf(prop.k)));
  }
}

function applyVecProp(
  ctx: Ctx,
  spec: { id: string },
  prop: LottieProp | undefined,
  targetPath: string,
  map: (v: Vec2) => Vec2,
  assign: (v: Vec2) => void,
  tm: TimeMap,
): void {
  if (prop === undefined) return;
  const n = norms(prop);
  if (n) {
    if (easesDifferPerDim(n, 2)) {
      // per-dimension eases (e.g. differing o.x[d] on scale): split to component number tracks
      for (const dim of [0, 1] as const) {
        const keys = convertKeys(n, tm, (v) => map(vec2Of(v))[dim], dim);
        pushTrack(ctx, `${spec.id}/${targetPath}.${dim === 0 ? 'x' : 'y'}`, 'number', keys);
      }
      assign(map(vec2Of(n[0]!.value)));
    } else {
      const keys = convertKeys(n, tm, (v) => map(vec2Of(v)));
      assign(keys[0]!.value);
      pushTrack(ctx, `${spec.id}/${targetPath}`, 'vec2', keys);
    }
  } else if (prop.k !== undefined) {
    assign(map(vec2Of(prop.k)));
  }
}

function applyPosition(ctx: Ctx, spec: GroupSpec, p: LottieProp | LottieSplitPosition | undefined, tm: TimeMap): void {
  if (p === undefined) return;
  if (isSplitPosition(p)) {
    const pos: [number, number] = [0, 0];
    for (const [dim, axis, prop] of [[0, 'x', p.x], [1, 'y', p.y]] as const) {
      const n = norms(prop);
      if (n) {
        const keys = convertKeys(n, tm, (v) => scalarOf(v));
        pos[dim] = keys[0]!.value;
        pushTrack(ctx, `${spec.id}/position.${axis}`, 'number', keys);
      } else if (prop.k !== undefined) pos[dim] = scalarOf(prop.k);
    }
    spec.position = pos;
    return;
  }
  const n = norms(p);
  if (n) {
    const hasSpatial = n.some((k) =>
      [k.to, k.ti].some((t) => t && (Math.abs(t[0] ?? 0) > 1e-9 || Math.abs(t[1] ?? 0) > 1e-9)),
    );
    if (!hasSpatial && easesDifferPerDim(n, 2)) {
      for (const [dim, axis] of [[0, 'x'], [1, 'y']] as const) {
        const keys = convertKeys(n, tm, (v) => vec2Of(v)[dim], dim);
        pushTrack(ctx, `${spec.id}/position.${axis}`, 'number', keys);
      }
      spec.position = vec2Of(n[0]!.value);
    } else {
      const keys = convertPositionKeys(n, tm, ctx.doc.fr);
      spec.position = keys[0]!.value;
      pushTrack(ctx, `${spec.id}/position`, 'vec2', keys);
    }
  } else if (p.k !== undefined) {
    spec.position = vec2Of(p.k);
  }
}

/**
 * Anchor sandwich: returns the inner group (offset by −a) when the anchor is
 * non-zero or animated; otherwise content attaches to the outer group
 * directly. Negation commutes with lerp, so animated anchors stay exact.
 */
function applyAnchor(ctx: Ctx, outer: GroupSpec, a: LottieProp | undefined, tm: TimeMap): GroupSpec {
  const makeInner = (): GroupSpec => {
    const inner: GroupSpec = { kind: 'group', id: uid(ctx, `${outer.id}__a`), children: [] };
    outer.children.push(inner);
    return inner;
  };
  const n = norms(a);
  if (n) {
    const negated: NormKey[] = n.map((k) => ({
      ...k,
      value: (k.value as number[]).map((c) => -c),
      to: k.to?.map((c) => -c),
      ti: k.ti?.map((c) => -c),
    }));
    const inner = makeInner();
    const keys = convertPositionKeys(negated, tm, ctx.doc.fr);
    inner.position = keys[0]!.value;
    pushTrack(ctx, `${inner.id}/position`, 'vec2', keys);
    return inner;
  }
  if (a?.k !== undefined) {
    const [ax, ay] = vec2Of(a.k);
    if (ax !== 0 || ay !== 0) {
      const inner = makeInner();
      inner.position = [-ax, -ay];
      return inner;
    }
  }
  return outer;
}

/** p/r/s onto `spec`; returns the attach point (anchor inner group or spec). */
function applyPRS(ctx: Ctx, spec: GroupSpec, ks: LottieTransform, tm: TimeMap): GroupSpec {
  applyPosition(ctx, spec, ks.p, tm);
  applyScalarProp(ctx, spec, ks.r, 'rotation', (v) => v, (v) => (spec.rotation = v), tm);
  applyVecProp(
    ctx,
    spec,
    ks.s,
    'scale',
    (v) => [v[0] / 100, v[1] / 100],
    (v) => (spec.scale = v),
    tm,
  );
  return applyAnchor(ctx, spec, ks.a, tm);
}

function applyOpacity(ctx: Ctx, spec: NodeSpec, o: LottieProp | undefined, tm: TimeMap): void {
  applyScalarProp(ctx, spec, o, 'opacity', (v) => v / 100, (v) => (spec.opacity = v), tm);
}

// --- shape geometry sources ---

type GeomSource =
  | { kind: 'static'; value: PathValue }
  | { kind: 'animated'; keys: Key<PathValue>[] };

interface ParamProp {
  norm: NormKey[] | undefined;
  staticVal: unknown;
  /** sampling type when dense-baking misaligned multi-prop animation */
  type: 'number' | 'vec2';
  map: (v: unknown) => unknown;
}

const aligned = (a: NormKey[], b: NormKey[]): boolean =>
  a.length === b.length && a.every((k, j) => k.t === b[j]!.t);

/** el/rc: animated parameters convert per-key (exact when key grids align). */
function combineParametric(
  ctx: Ctx,
  props: ParamProp[],
  build: (values: unknown[]) => PathValue,
  tm: TimeMap,
  where: string,
): GeomSource {
  const animated = props.filter((p) => p.norm !== undefined);
  const valuesAt = (pick: (p: ParamProp) => unknown): unknown[] => props.map(pick);
  if (animated.length === 0) {
    return { kind: 'static', value: build(valuesAt((p) => p.map(p.staticVal))) };
  }
  const first = animated[0]!.norm!;
  if (animated.every((p) => aligned(p.norm!, first))) {
    const easesMatch = animated.every((p) =>
      p.norm!.every(
        (k, j) =>
          k.hold === first[j]!.hold &&
          JSON.stringify(k.o ?? null) === JSON.stringify(first[j]!.o ?? null) &&
          JSON.stringify(k.i ?? null) === JSON.stringify(first[j]!.i ?? null),
      ),
    );
    if (!easesMatch) {
      ctx.warnings.push(
        `[approximation] ${where}: co-keyed parameters with differing eases use the first parameter's ease (endpoints exact, mid-segment may differ)`,
      );
    }
    const keys: Key<PathValue>[] = convertKeys(first, tm, (_v, _n) => [] as PathValue);
    for (let j = 0; j < keys.length; j++) {
      keys[j]!.value = build(
        valuesAt((p) => p.map(p.norm !== undefined ? p.norm[j]!.value : p.staticVal)),
      );
    }
    return { kind: 'animated', keys };
  }
  // misaligned grids: dense-bake at the document fps (linear keys)
  ctx.warnings.push(
    `[approximation] ${where}: independently-keyed parameters baked densely at ${ctx.doc.fr} fps`,
  );
  const samplers = props.map((p) => {
    if (p.norm === undefined) return () => p.map(p.staticVal);
    const keys =
      p.type === 'vec2'
        ? convertKeys(p.norm, tm, (v) => vec2Of(v))
        : convertKeys(p.norm, tm, (v) => scalarOf(v));
    const tr = makeTrack(`__bake/${p.type}`, p.type, keys as Key<unknown>[]);
    return (t: number) => p.map(sampleTrack(tr, t));
  });
  const times = animated.flatMap((p) => p.norm!.map((k) => toSeconds(tm, k.t)));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const step = 1 / ctx.doc.fr;
  const keys: Key<PathValue>[] = [];
  for (let t = t0; t < t1 + step / 2; t += step) {
    keys.push({ t: Math.min(t, t1), value: build(samplers.map((s) => s(Math.min(t, t1)))) });
  }
  return { kind: 'animated', keys: enforceMonotonic(keys) };
}

function geometrySource(ctx: Ctx, item: LottieShapeItem, tm: TimeMap, where: string): GeomSource | null {
  switch (item.ty) {
    case 'sh': {
      const toValue = (v: unknown): PathValue =>
        (Array.isArray(v) ? v : [v]).map((d) => shToContour(d as LottieShapePathData, item.closed));
      const n = norms(item.ks);
      if (n) return { kind: 'animated', keys: convertKeys(n, tm, toValue) };
      const k = item.ks?.k;
      if (k === undefined) return null;
      return { kind: 'static', value: toValue(k) };
    }
    case 'el': {
      const p: ParamProp = { norm: norms(item.p), staticVal: item.p?.k ?? [0, 0], type: 'vec2', map: (v) => vec2Of(v) };
      const s: ParamProp = { norm: norms(item.s), staticVal: item.s?.k ?? [0, 0], type: 'vec2', map: (v) => vec2Of(v) };
      const reversed = item.d === 3; // winding decides nonzero-merge holes
      return combineParametric(
        ctx,
        [p, s],
        (vals) => {
          const c = ellipseContour(vals[0] as Vec2, vals[1] as Vec2);
          return [reversed ? reverseContour(c) : c];
        },
        tm,
        where,
      );
    }
    case 'rc': {
      const rProp = typeof item.r === 'number' ? { k: item.r } : item.r;
      const p: ParamProp = { norm: norms(item.p), staticVal: item.p?.k ?? [0, 0], type: 'vec2', map: (v) => vec2Of(v) };
      const s: ParamProp = { norm: norms(item.s), staticVal: item.s?.k ?? [0, 0], type: 'vec2', map: (v) => vec2Of(v) };
      const r: ParamProp = { norm: norms(rProp), staticVal: rProp?.k ?? 0, type: 'number', map: (v) => scalarOf(v) };
      const reversed = item.d === 3;
      return combineParametric(
        ctx,
        [p, s, r],
        (vals) => {
          const c = rectContour(vals[0] as Vec2, vals[1] as Vec2, vals[2] as number);
          return [reversed ? reverseContour(c) : c];
        },
        tm,
        where,
      );
    }
    default:
      return null;
  }
}

/** mm mode 1: concatenate contours into one multi-contour source. */
function mergeGeomSources(ctx: Ctx, sources: GeomSource[], tm: TimeMap, where: string): GeomSource {
  if (sources.length === 1) return sources[0]!;
  const animated = sources.filter((s): s is Extract<GeomSource, { kind: 'animated' }> => s.kind === 'animated');
  if (animated.length === 0) {
    return { kind: 'static', value: mergeContours(sources.map((s) => (s as { value: PathValue }).value)) };
  }
  const first = animated[0]!.keys;
  const timesMatch = animated.every(
    (s) => s.keys.length === first.length && s.keys.every((k, j) => k.t === first[j]!.t),
  );
  if (timesMatch) {
    const keys: Key<PathValue>[] = first.map((k, j) => ({
      ...k,
      value: mergeContours(
        sources.map((s) => (s.kind === 'static' ? s.value : s.keys[j]!.value)),
      ),
    }));
    return { kind: 'animated', keys };
  }
  // misaligned animated members: dense-bake the merged value at the doc fps
  ctx.warnings.push(
    `[approximation] ${where}: merge-paths members with misaligned keys baked densely at ${ctx.doc.fr} fps`,
  );
  const trackOf = (s: Extract<GeomSource, { kind: 'animated' }>) =>
    makeTrack('__bake/d', 'path', s.keys as Key<unknown>[]);
  const samplers = sources.map((s) =>
    s.kind === 'static' ? () => s.value : ((tr) => (t: number) => sampleTrack(tr, t) as PathValue)(trackOf(s)),
  );
  const times = animated.flatMap((s) => s.keys.map((k) => k.t));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const step = 1 / ctx.doc.fr;
  const keys: Key<PathValue>[] = [];
  for (let t = t0; t < t1 + step / 2; t += step) {
    const at = Math.min(t, t1);
    keys.push({ t: at, value: mergeContours(samplers.map((s) => s(at))) });
  }
  return { kind: 'animated', keys: enforceMonotonic(keys) };
}

// --- gradient fill (gf → linear/radial Paint) ---

/** Lottie gf color ramp (`g.k`) → glissade ColorStop[]. The first `p` groups of
 * `[offset,r,g,b]` are colors (0–1 floats); trailing `[offset,a]` groups are alpha
 * stops, merged onto each color offset (interpolated across the alpha ramp). */
function gradientStops(k: number[], p: number): ColorStop[] {
  const alphas: { offset: number; a: number }[] = [];
  for (let i = p * 4; i + 1 < k.length; i += 2) alphas.push({ offset: k[i]!, a: k[i + 1]! });
  const alphaAt = (offset: number): number => {
    if (alphas.length === 0) return 1;
    let lo = alphas[0]!;
    if (offset <= lo.offset) return lo.a;
    for (let j = 1; j < alphas.length; j++) {
      const hi = alphas[j]!;
      if (offset <= hi.offset) {
        const span = hi.offset - lo.offset;
        return span > 0 ? lo.a + ((hi.a - lo.a) * (offset - lo.offset)) / span : hi.a;
      }
      lo = hi;
    }
    return lo.a;
  };
  const stops: ColorStop[] = [];
  for (let i = 0; i < p; i++) {
    const o = i * 4;
    const offset = k[o] ?? 0;
    stops.push({
      offset,
      color: formatColor({ r: (k[o + 1] ?? 0) * 255, g: (k[o + 2] ?? 0) * 255, b: (k[o + 3] ?? 0) * 255, a: alphaAt(offset) }),
    });
  }
  return stops;
}

/** Reconstruct a static Paint from a gf's start/end points + ramp — the inverse of
 * export.ts's gradientStart/gradientEnd (radial: centre = s, radius = |s→e|). */
function buildStaticPaint(t: number | undefined, s: Vec2, e: Vec2, k: number[], p: number): Paint {
  const stops = gradientStops(k, p);
  if (t === 2) {
    return { kind: 'radial', stops, center: [s[0], s[1]], radius: Math.hypot(e[0] - s[0], e[1] - s[1]) };
  }
  return { kind: 'linear', stops, from: [s[0], s[1]], to: [e[0], e[1]] };
}

/** Set `spec.fill` to a linear/radial Paint (static) or push a `paint` track (animated). */
function applyGradientFill(ctx: Ctx, spec: PathSpec, style: LottieShapeItem, tm: TimeMap): void {
  const t = style.t;
  const p = style.g?.p ?? 0;
  const sNorm = norms(style.s);
  const eNorm = norms(style.e);
  const gNorm = norms(style.g?.k);
  const staticS = (): Vec2 => vec2Of(style.s?.k ?? [0, 0]);
  const staticE = (): Vec2 => vec2Of(style.e?.k ?? [0, 0]);
  const staticG = (): number[] => (Array.isArray(style.g?.k.k) ? (style.g!.k.k as number[]) : []);
  if (!sNorm && !eNorm && !gNorm) {
    spec.fill = buildStaticPaint(t, staticS(), staticE(), staticG(), p);
    return;
  }
  const channels = [sNorm, eNorm, gNorm].filter((n): n is NormKey[] => n !== undefined);
  const first = channels[0]!;
  const aligned = channels.every((n) => n.length === first.length && n.every((kk, j) => kk.t === first[j]!.t));
  let keys: Key<Paint>[];
  if (aligned) {
    // shared grid (our own export): one channel supplies times + eases, read per-index
    const driver = gNorm ?? sNorm ?? eNorm!;
    keys = convertKeys(driver, tm, () => ({ kind: 'linear', stops: [] }) as Paint);
    for (let j = 0; j < keys.length; j++) {
      const s = sNorm ? vec2Of(sNorm[j]!.value) : staticS();
      const e = eNorm ? vec2Of(eNorm[j]!.value) : staticE();
      const g = gNorm ? (gNorm[j]!.value as number[]) : staticG();
      keys[j]!.value = buildStaticPaint(t, s, e, g, p);
    }
  } else {
    // misaligned / foreign grids: union of times, hold-previous per channel (linear eases)
    const times = [...new Set(channels.flatMap((n) => n.map((kk) => kk.t)))].sort((a, b) => a - b);
    const at = <R>(norm: NormKey[] | undefined, ft: number, fallback: () => R, read: (v: unknown) => R): R => {
      if (!norm) return fallback();
      let v = norm[0]!.value;
      for (const kk of norm) {
        if (kk.t <= ft) v = kk.value;
        else break;
      }
      return read(v);
    };
    keys = enforceMonotonic(
      times.map((ft) => ({
        t: toSeconds(tm, ft),
        value: buildStaticPaint(
          t,
          at(sNorm, ft, staticS, vec2Of),
          at(eNorm, ft, staticE, vec2Of),
          at(gNorm, ft, staticG, (v) => v as number[]),
          p,
        ),
      })),
    );
  }
  spec.fill = keys[0]!.value;
  pushTrack(ctx, `${spec.id}/fill`, 'paint', keys);
}

// --- painter-model denormalization ---

function pathSpecFor(
  ctx: Ctx,
  style: LottieShapeItem,
  geom: GeomSource,
  idBase: string,
  tm: TimeMap,
): PathSpec {
  const spec: PathSpec = {
    kind: 'path',
    id: uid(ctx, idBase),
    data: geom.kind === 'static' ? geom.value : geom.keys[0]!.value,
  };
  if (geom.kind === 'animated') {
    // duplicated per node (style × geometry shares geometry, not tracks);
    // type 'path' is EXPLICIT — inferValueType never sees these keys
    pushTrack(ctx, `${spec.id}/d`, 'path', geom.keys.map((k) => ({ ...k })));
  }
  if (style.ty === 'gf') {
    applyGradientFill(ctx, spec, style, tm);
    // gf opacity → node opacity (each Path carries exactly one style, mirrors fl/st)
    applyOpacity(ctx, spec, style.o, tm);
    return spec;
  }
  const colorTarget = style.ty === 'fl' ? 'fill' : 'stroke';
  const cNorm = norms(style.c);
  if (cNorm) {
    // byte-vs-float classified ONCE over the whole prop — a [1,1,1] key in a
    // byte-format track is near-black, not white
    const bytes = colorPropIsBytes(cNorm.map((k) => k.value));
    const keys = convertKeys(cNorm, tm, (v) => lottieColor(v, bytes));
    spec[colorTarget] = keys[0]!.value;
    pushTrack(ctx, `${spec.id}/${colorTarget}`, 'color', keys);
  } else if (style.c?.k !== undefined) {
    spec[colorTarget] = lottieColor(style.c.k, colorPropIsBytes([style.c.k]));
  }
  // style opacity → node opacity: each Path carries exactly one style, so the
  // composite is the per-style alpha Lottie applies
  applyOpacity(ctx, spec, style.o, tm);
  if (style.ty === 'st') {
    applyScalarProp(ctx, spec, style.w, 'strokeWidth', (v) => v, (v) => (spec.strokeWidth = v), tm);
    spec.strokeWidth ??= 1;
  }
  return spec;
}

/**
 * One items list → children, bottom-to-top (Lottie paints array-first on TOP,
 * glissade Groups paint array-last on top, so emission walks in reverse).
 * Each fill/stroke becomes one Path node per preceding geometry; an mm mode-1
 * merges the list's geometries into a single multi-contour source first.
 */
function denormItems(ctx: Ctx, items: LottieShapeItem[], idBase: string, tm: TimeMap, where: string): NodeSpec[] {
  const visible = items.filter((it) => it.hd !== true);
  const hasMerge = visible.some((it) => it.ty === 'mm' && (it.mm ?? 1) === 1);
  interface Slot { index: number; node?: NodeSpec; styleNodes?: NodeSpec[] }
  const slots: Slot[] = [];
  const geoms: { index: number; source: GeomSource; name: string }[] = [];
  let geomCounter = 0;
  for (let i = 0; i < visible.length; i++) {
    const item = visible[i]!;
    const here = `${where}/${item.nm ?? item.ty}`;
    if (item.ty === 'gr') {
      const inner = item.it?.filter((it) => it.hd !== true) ?? [];
      const tr = inner.find((it) => it.ty === 'tr') as LottieTransform | undefined;
      const grSpec: GroupSpec = { kind: 'group', id: uid(ctx, `${idBase}_${item.nm ?? `g${i}`}`), children: [] };
      let attach = grSpec;
      if (tr) {
        attach = applyPRS(ctx, grSpec, tr, tm);
        applyOpacity(ctx, grSpec, tr.o, tm);
        const oStatic = typeof tr.o?.k === 'number' ? tr.o.k : undefined;
        if (tr.o !== undefined && oStatic !== 100) {
          ctx.warnings.push(
            `[approximation] ${here}: shape-group opacity composites the subtree as a unit; Lottie multiplies per shape — overlapping translucent siblings may differ`,
          );
        }
      }
      attach.children.push(
        ...denormItems(ctx, inner.filter((it) => it.ty !== 'tr'), grSpec.id, tm, here),
      );
      slots.push({ index: i, node: grSpec });
    } else if (item.ty === 'sh' || item.ty === 'el' || item.ty === 'rc') {
      const source = geometrySource(ctx, item, tm, here);
      if (source) geoms.push({ index: i, source, name: item.nm ?? `geo${geomCounter++}` });
    } else if (item.ty === 'fl' || item.ty === 'st' || item.ty === 'gf') {
      const preceding = geoms.filter((g) => g.index < i);
      if (preceding.length === 0) continue;
      const applicable = hasMerge
        ? [{ source: mergeGeomSources(ctx, preceding.map((g) => g.source), tm, here), name: 'merged' }]
        : preceding;
      const styleNodes = applicable.map((g) =>
        pathSpecFor(ctx, item, g.source, `${idBase}_${item.nm ?? item.ty}_${g.name}`, tm),
      );
      slots.push({ index: i, styleNodes });
    }
    // mm handled via hasMerge; degraded mm modes were stripped by the audit contract
  }
  const out: NodeSpec[] = [];
  for (let s = slots.length - 1; s >= 0; s--) {
    const slot = slots[s]!;
    if (slot.node) out.push(slot.node);
    if (slot.styleNodes) out.push(...slot.styleNodes);
  }
  return out;
}

// --- text (ty:5) ---

/** OTF/bodymovin weight-class names → numeric weight, the inverse of the exporter's map. */
const WEIGHT_BY_NAME: Record<string, number> = {
  Thin: 100,
  ExtraLight: 200,
  Light: 300,
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
  ExtraBold: 800,
  Black: 900,
};

/** Numeric weight from a font ref: prefer `fWeight`, else read a class name out of `fStyle`. */
function fontWeightFrom(font: LottieFont | undefined): number | undefined {
  if (font === undefined) return undefined;
  if (font.fWeight !== undefined) {
    const n = Number(font.fWeight);
    if (Number.isFinite(n)) return n;
  }
  for (const word of font.fStyle.split(' ')) {
    if (WEIGHT_BY_NAME[word] !== undefined) return WEIGHT_BY_NAME[word];
  }
  return undefined;
}

/** Justification (0 left / 1 right / 2 center) → glissade align. */
const justificationToAlign = (j: number): 'left' | 'center' | 'right' =>
  j === 1 ? 'right' : j === 2 ? 'center' : 'left';

/**
 * A varying text-document field → a HOLD track (the document switches discretely
 * between keyframes). Consecutive-equal values collapse; a field constant across
 * the whole stream produces no track (the static base value on the spec suffices).
 */
function pushDocTrack<T>(
  ctx: Ctx,
  target: string,
  type: string,
  dks: LottieTextDocKeyframe[],
  tm: TimeMap,
  extract: (s: LottieTextDocKeyframe['s']) => T,
): void {
  const keys: Key<T>[] = [];
  let prev: string | undefined;
  for (const dk of dks) {
    const value = extract(dk.s);
    const sig = JSON.stringify(value);
    if (sig === prev) continue; // hold: the value persists until it changes
    const k: Key<T> = { t: toSeconds(tm, dk.t), value };
    if (keys.length > 0) k.interp = 'hold';
    keys.push(k);
    prev = sig;
  }
  if (keys.length <= 1) return;
  ctx.tracks.push(makeTrack(target, type, enforceMonotonic(keys)));
}

/** ty:5 layer → a Text spec (+ hold tracks for any animated text/fill/fontSize). */
function convertTextLayer(ctx: Ctx, layer: LottieLayer, base: string, tm: TimeMap): TextSpec {
  const dks = layer.t!.d.k; // audit guarantees a non-empty, well-formed stream
  const first = dks[0]!.s;
  const font = (ctx.doc.fonts?.list ?? []).find((f) => f.fName === first.f);
  const spec: TextSpec = {
    kind: 'text',
    id: uid(ctx, `${base}__text`),
    text: first.t,
    fill: lottieColor(first.fc, colorPropIsBytes([first.fc])),
    fontSize: first.s,
    fontFamily: font?.fFamily ?? first.f,
  };
  const weight = fontWeightFrom(font);
  if (weight !== undefined) spec.fontWeight = weight;
  if (font !== undefined && /italic/i.test(font.fStyle)) spec.fontStyle = 'italic';
  const align = justificationToAlign(first.j);
  if (align !== 'left') spec.align = align;
  if (first.tr !== undefined) spec.letterSpacing = first.tr;
  if (first.lh !== undefined && first.s > 0) spec.lineHeight = first.lh / first.s;

  if (dks.length > 1) {
    pushDocTrack(ctx, `${spec.id}/text`, 'string', dks, tm, (s) => s.t);
    pushDocTrack(ctx, `${spec.id}/fontSize`, 'number', dks, tm, (s) => s.s);
    const bytes = colorPropIsBytes(dks.map((k) => k.s.fc));
    pushDocTrack(ctx, `${spec.id}/fill`, 'color', dks, tm, (s) => lottieColor(s.fc, bytes));
  }
  return spec;
}

// --- layers ---

interface LayerRecord {
  layer: LottieLayer;
  outer: GroupSpec;
  attach: GroupSpec;
}

function visibilityWrapper(ctx: Ctx, base: string, layer: LottieLayer, content: GroupSpec, ind: number): GroupSpec {
  const { doc } = ctx;
  const docDur = (doc.op - doc.ip) / doc.fr;
  const ipS = layer.ip / doc.fr + ctx.offset;
  const opS = layer.op / doc.fr + ctx.offset;
  if (ipS <= 0 && opS >= docDur) return content;
  // the wrapper REPLACES content as the paint-order sibling: it must carry
  // the layer's zIndex or a parent layer's own content jumps above its children
  const vis: GroupSpec = { kind: 'group', id: uid(ctx, `${base}__v`), children: [content], zIndex: -ind };
  if (opS <= 0) {
    vis.opacity = 0; // ended before the document starts: never visible
    return vis;
  }
  const keys: Key<number>[] = [];
  if (ipS > 0) {
    keys.push({ t: 0, value: 0 }, { t: ipS, value: 1, interp: 'hold' });
    vis.opacity = 0;
  } else {
    keys.push({ t: 0, value: 1 });
  }
  if (opS < docDur) keys.push({ t: opS, value: 0, interp: 'hold' });
  pushTrack(ctx, `${vis.id}/opacity`, 'number', enforceMonotonic(keys));
  return vis;
}

function convertLayer(ctx: Ctx, layer: LottieLayer, index: number): LayerRecord {
  const ind = layer.ind ?? index;
  const base = uid(ctx, layer.nm ?? `layer${ind}`);
  const tm: TimeMap = { fr: ctx.doc.fr, st: layer.st ?? 0, offset: ctx.offset };
  const outer: GroupSpec = { kind: 'group', id: base, children: [], zIndex: -ind };
  const attach = layer.ks ? applyPRS(ctx, outer, layer.ks, tm) : outer;

  const contentChildren: NodeSpec[] = [];
  if (layer.ty === 4 && layer.shapes) {
    contentChildren.push(
      ...denormItems(ctx, layer.shapes, base, tm, `layer '${layer.nm ?? ind}'`),
    );
  } else if (layer.ty === 1) {
    const w = layer.sw ?? 0;
    const h = layer.sh ?? 0;
    const solid: RectSpec = {
      kind: 'rect',
      id: uid(ctx, `${base}__solid`),
      width: w,
      height: h,
      position: [w / 2, h / 2], // Rect is center-anchored; the solid covers [0,0]–[sw,sh]
    };
    if (layer.sc !== undefined) solid.fill = layer.sc;
    contentChildren.push(solid);
  } else if (layer.ty === 2) {
    const asset = (ctx.doc.assets ?? []).find((a) => a.id === layer.refId)!;
    ctx.assets[asset.id] = { kind: 'image', url: `${asset.u ?? ''}${asset.p ?? ''}` };
    const w = asset.w ?? 0;
    const h = asset.h ?? 0;
    const image: ImageSpec = {
      kind: 'image',
      id: uid(ctx, `${base}__img`),
      assetId: asset.id,
      width: w,
      height: h,
      position: [w / 2, h / 2], // ImageNode is center-anchored; Lottie draws from the layer origin
    };
    contentChildren.push(image);
  } else if (layer.ty === 5 && layer.t) {
    contentChildren.push(convertTextLayer(ctx, layer, base, tm));
  }

  if (layer.ty !== 3 && layer.hd !== true) {
    // opacity on a content SIBLING: pushGroup composites over the subtree,
    // and child layers parented here must not inherit it
    const content: GroupSpec = {
      kind: 'group',
      id: uid(ctx, `${base}__c`),
      children: contentChildren,
      zIndex: -ind,
    };
    applyOpacity(ctx, content, layer.ks?.o, tm);
    attach.children.push(visibilityWrapper(ctx, base, layer, content, ind));
  }
  return { layer, outer, attach };
}

export interface ConvertOutput {
  size: { w: number; h: number };
  nodes: NodeSpec[];
  timeline: Timeline;
  warnings: string[];
}

export function convertDocument(doc: LottieDocument, warnings: string[]): ConvertOutput {
  const ctx: Ctx = {
    doc,
    tracks: [],
    warnings,
    assets: {},
    ids: new Set(),
    offset: -doc.ip / doc.fr,
  };
  // hidden (hd) layers stay in the graph as transform-only parents — lottie-web
  // builds them and skips only their rendering; dropping them would silently
  // re-root their children and lose the parent transform chain
  const records = doc.layers.map((layer, i) => convertLayer(ctx, layer, i));
  const byInd = new Map<number, LayerRecord>();
  records.forEach((r, i) => byInd.set(r.layer.ind ?? i, r));
  const roots: NodeSpec[] = [];
  for (const r of records) {
    const parent = r.layer.parent !== undefined ? byInd.get(r.layer.parent) : undefined;
    if (parent && parent !== r) parent.attach.children.push(r.outer);
    else roots.push(r.outer);
  }
  const timeline: Timeline = {
    version: 1,
    duration: (doc.op - doc.ip) / doc.fr,
    fps: doc.fr,
    tracks: ctx.tracks,
    ...(Object.keys(ctx.assets).length > 0 ? { assets: ctx.assets } : {}),
  };
  return { size: { w: doc.w, h: doc.h }, nodes: roots, timeline, warnings: ctx.warnings };
}
