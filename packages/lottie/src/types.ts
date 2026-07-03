/**
 * Loose typings for the subset of the Lottie/bodymovin JSON schema the S1
 * importer reads. Old bodymovin exports (s/e keyframe pairs, top-level
 * `closed` on sh, 0–255 colors) and modern exports (s-only keys, `c` inside
 * the path object, 0–1 colors) are both accepted.
 */

/** Animatable property: static (`k` value) or keyframed (`k` array of LottieKeyframe). */
export interface LottieProp {
  a?: number;
  k?: unknown;
  /** Expression source (audited; stripped under allowDegraded). */
  x?: unknown;
  ix?: number | string;
}

/** Split position: `{ s: true, x, y }` — per-axis animatable scalars. */
export interface LottieSplitPosition {
  s: true;
  x: LottieProp;
  y: LottieProp;
}

export interface LottieEaseHandle {
  x: number | number[];
  y: number | number[];
}

export interface LottieKeyframe {
  t: number;
  /** Start value (modern files: the only value). */
  s?: unknown;
  /** End value (old bodymovin files; equals the next key's start). */
  e?: unknown;
  /** Ease of the DEPARTING segment (this key → the next one). */
  i?: LottieEaseHandle;
  o?: LottieEaseHandle;
  /** Hold: the departing segment is constant. */
  h?: number;
  /** Spatial out/in tangents (position keys), relative to s / next s. */
  to?: number[] | null;
  ti?: number[] | null;
}

export interface LottieShapePathData {
  v: number[][];
  i: number[][];
  o: number[][];
  c?: boolean;
}

/**
 * A gradient color ramp (`gf`/`gs` `.g`): `p` = the number of COLOR stops, `k`
 * the animatable flattened array. Static `k` is `[offset,r,g,b, …]` (p color
 * stops, 0–1 floats) optionally followed by `[offset,a, …]` alpha stops when any
 * stop is translucent; the split point is `p*4`.
 */
export interface LottieGradient {
  p: number;
  k: LottieProp;
}

export interface LottieShapeItem {
  /** shape direction: 3 = reversed winding (el/rc). */
  d?: number | { k?: unknown };
  ty: string;
  nm?: string;
  hd?: boolean;
  /** gr */
  it?: LottieShapeItem[];
  /** sh */
  ks?: LottieProp;
  closed?: boolean;
  /** el / rc / tr — also gf/gs gradient START point (s) + highlight angle (a). */
  p?: LottieProp;
  s?: LottieProp;
  a?: LottieProp;
  /** rc corner radius / fl-st opacity-adjacent fields / gf-gs fill rule. */
  r?: LottieProp | number;
  /** fl / st */
  c?: LottieProp;
  o?: LottieProp;
  w?: LottieProp;
  /** mm */
  mm?: number;
  /** gf / gs gradient: type (1 linear, 2 radial), END point, highlight length, color ramp. */
  t?: number;
  e?: LottieProp;
  h?: LottieProp;
  g?: LottieGradient;
}

export interface LottieTransform {
  a?: LottieProp;
  p?: LottieProp | LottieSplitPosition;
  s?: LottieProp;
  r?: LottieProp;
  o?: LottieProp;
  sk?: LottieProp;
  sa?: LottieProp;
}

/**
 * A text document (`t.d.k[n].s`) — the paint + font state of a ty:5 text layer
 * at one keyframe. Modern bodymovin: `fc` is a 0–1 rgb(a) array, `j` is the
 * justification (0 left, 1 right, 2 center — the Lottie/bodymovin convention).
 * Optional fields (`tr`/`lh`) are OMITTED when at their glissade default so the
 * emitted JSON stays minimal + deterministic (mirrors fontSpec()'s omissions).
 */
export interface LottieTextDocument {
  /** the text string */
  t: string;
  /** font name — references a `fonts.list[n].fName` */
  f: string;
  /** font size (px) */
  s: number;
  /** fill color, 0–1 `[r,g,b]` or `[r,g,b,a]` */
  fc: number[];
  /** justification: 0 = left, 1 = right, 2 = center */
  j: number;
  /** tracking / letter-spacing (px) — omitted when unset */
  tr?: number;
  /** line height (px) — omitted when the glissade lineHeight is the 1.25 default */
  lh?: number;
  /** baseline shift — read-through only (never emitted) */
  ls?: number;
  /** wrap box size `[w,h]` — read-through only (never emitted) */
  sz?: number[];
  /** wrap box position `[x,y]` — read-through only */
  ps?: number[];
}

/** One text-document keyframe: the document `s` applied from frame `t` (hold). */
export interface LottieTextDocKeyframe {
  t: number;
  s: LottieTextDocument;
}

/** ty:5 text data: keyframed documents (`d.k`) + animators (`a`, always empty here). */
export interface LottieTextData {
  d: { k: LottieTextDocKeyframe[] };
  a?: unknown[];
  m?: unknown;
  p?: unknown;
}

/** A `fonts.list[n]` entry — a font REFERENCE (never embedded; the player supplies it). */
export interface LottieFont {
  fName: string;
  fFamily: string;
  fStyle: string;
  fWeight?: string;
  fPath?: string;
  origin?: number;
  ascent?: number;
}

export interface LottieLayer {
  ty: number;
  nm?: string;
  /** Hidden: never rendered — skipped by audit and conversion alike. */
  hd?: boolean;
  ind?: number;
  parent?: number;
  ip: number;
  op: number;
  st?: number;
  sr?: number;
  ks?: LottieTransform;
  ddd?: number;
  ao?: number;
  /** shape layer */
  shapes?: LottieShapeItem[];
  /** text layer (ty:5) */
  t?: LottieTextData;
  /** solid */
  sw?: number;
  sh?: number;
  sc?: string;
  /** image / precomp */
  refId?: string;
  /** rejections */
  masksProperties?: unknown[];
  hasMask?: boolean;
  tt?: number;
  td?: number;
  tm?: unknown;
  ef?: unknown[];
  sy?: unknown[];
  w?: number;
  h?: number;
}

export interface LottieAsset {
  id: string;
  /** image assets */
  w?: number;
  h?: number;
  p?: string;
  u?: string;
  e?: number;
  /** precomp assets */
  layers?: LottieLayer[];
}

export interface LottieDocument {
  /** bodymovin schema version (`v`) — strict lottie-web/dotLottie validators require it. */
  v?: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  nm?: string;
  ddd?: number;
  layers: LottieLayer[];
  assets?: LottieAsset[];
  /** Font references (ty:5 layers name into `fonts.list[n].fName`). */
  fonts?: { list: LottieFont[] };
}
