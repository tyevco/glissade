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
  /** el / rc / tr */
  p?: LottieProp;
  s?: LottieProp;
  a?: LottieProp;
  /** rc corner radius / fl-st opacity-adjacent fields */
  r?: LottieProp | number;
  /** fl / st */
  c?: LottieProp;
  o?: LottieProp;
  w?: LottieProp;
  /** mm */
  mm?: number;
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
}
