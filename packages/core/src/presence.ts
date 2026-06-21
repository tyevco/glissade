/**
 * Presence scheduling (the 0.13 enter/exit sugar): build-time sugar over `clip`
 * that schedules a node's ENTER on `show`, its EXIT to land exactly on `hide`,
 * and authors a real `<nodeId>/opacity` WINDOW GUARD so the node is culled
 * (opacity<=0, see scene/node.ts §3) outside the live window.
 *
 * Like `clip`/`springTo`/`stagger`, this is authoring SUGAR — it compiles to
 * ordinary keyed `Track[]` via `track()`, byte-INDISTINGUISHABLE from the
 * hand-authored form. There is NO runtime visibility flag and no non-track
 * document state: a presence is a pure function of its arguments. Back-timing
 * the exit is pure arithmetic; reconciling the enter/exit opacity keys with the
 * guard uses the builder's deterministic later-wins coincident-`t` dedup with a
 * fixed merge order, so goldens stay byte-identical.
 *
 * The canonical case is a "send-line agency moment": a node enters, lives, and
 * exits on a beat. Siblings anchor to the real exit via the returned `end`.
 */

import { key, track, type Key, type Track } from './track.js';
import { resolveTweenTarget, type TweenTarget } from './targetRef.js';
import type { Clip, ApplyOpts, ClipChannel } from './clip.js';
import { clip } from './clip.js';
import type { SlideEdge } from './clipStdlib.js';
import type { EaseSpec } from './easing.js';
import type { Vec2 } from './valueTypes.js';

export class PresenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresenceError';
  }
}

/** The default enter/exit: a plain opacity fade over `DEFAULT_FADE` seconds. */
const DEFAULT_FADE = 0.3;

/** Plain opacity fade-in 0→1 (the default enter). */
function defaultEnter(): Clip {
  return clip({ channels: { opacity: { path: 'opacity', keys: [key(0, 0), key(DEFAULT_FADE, 1)] } } });
}

/** Plain opacity fade-out 1→0 (the default exit). */
function defaultExit(): Clip {
  return clip({ channels: { opacity: { path: 'opacity', keys: [key(0, 1), key(DEFAULT_FADE, 0)] } } });
}

/**
 * An inline ENTER/EXIT literal (0.18 sugar): a terse alternative to hand-building
 * a `clip({channels})`. `transitionToClip` compiles it to the SAME `Clip` an author
 * would write by hand, so presence() then runs UNCHANGED on the result — the inline
 * spelling is byte-INDISTINGUISHABLE from the hand-authored clip path.
 *
 * Conventions mirror clipStdlib (`slideIn`/`popIn`): a scalar `offset` slides that
 * magnitude in along `edge` (default 'bottom' = slide up from below); a scalar
 * `scale` broadcasts to a Vec2; OMITTING `opacity` emits NO opacity channel so
 * presence()'s synthesized rise/fall takes over (matching the Clip path exactly).
 */
export interface PresenceTransition {
  /** Opacity endpoints [from,to]. OMIT to rely on presence()'s synthesized rise/fall. */
  opacity?: [number, number];
  /**
   * Slide displacement. A scalar slides that magnitude along `edge`; a single Vec2
   * is the displaced point (animates to/from [0,0]); a [Vec2,Vec2] is explicit
   * endpoints. Omit for no position channel.
   */
  offset?: number | Vec2 | [Vec2, Vec2];
  /** Slide edge for a scalar `offset` (clipStdlib convention). Default 'bottom'. */
  edge?: SlideEdge;
  /** Scale endpoints. A scalar pair broadcasts each value to a Vec2 (popIn convention). */
  scale?: [number, number] | [Vec2, Vec2];
  /** Transition length in seconds. Default = the presence DEFAULT_FADE (0.3). */
  dur?: number;
  /** Arriving ease of every channel's last segment. */
  ease?: EaseSpec;
}

export interface PresenceOpts {
  /** Wall-clock second the node ENTERS (becomes visible). */
  show?: number;
  /** Wall-clock second the node has fully EXITED (the exit LANDS here). */
  hide?: number;
  /** Alias for `{ show: window[0], hide: window[1] }`. */
  window?: [number, number];
  /** Entrance clip, or an inline transition literal (default = a plain opacity fade-in 0→1, ~0.3s). */
  enter?: Clip | PresenceTransition;
  /** Exit clip, or an inline transition literal (default = a plain opacity fade-out 1→0, ~0.3s). Back-timed to land on `hide`. */
  exit?: Clip | PresenceTransition;
  /** Forwarded to `enter.apply` (speed / per-channel overrides). */
  enterOpts?: ApplyOpts;
  /** Forwarded to `exit.apply` (speed / per-channel overrides). */
  exitOpts?: ApplyOpts;
}

/** A `PresenceTransition` is a plain bag; a `Clip` carries `apply`. Discriminate on that. */
function isClip(t: Clip | PresenceTransition): t is Clip {
  return typeof (t as Clip).apply === 'function';
}

/** Is a value a Vec2 ([number, number])? */
function isVec2(v: number | Vec2): v is Vec2 {
  return Array.isArray(v);
}

/**
 * Compile an inline `PresenceTransition` literal into the SAME `Clip` an author
 * would hand-write — an opacity channel (only when `opacity` is given), a position
 * channel from `offset`+`edge` (slideIn convention), and a scale channel (scalar
 * broadcast to Vec2, popIn convention). presence() then runs UNCHANGED on it.
 *
 * `dir` selects the slide direction: an `enter` slides FROM the edge-displaced
 * point TO [0,0]; an `exit` slides FROM [0,0] TO the edge-displaced point (so a
 * back-timed exit reads as the inverse of the entrance). For an explicit
 * `[Vec2,Vec2]` offset the endpoints are used verbatim (no direction flip).
 */
export function transitionToClip(t: PresenceTransition, dir: 'enter' | 'exit'): Clip {
  const d = t.dur ?? DEFAULT_FADE;
  const ease = t.ease;
  const channels: Record<string, ClipChannel> = {};

  if (t.opacity !== undefined) {
    const [from, to] = t.opacity;
    channels.opacity = { path: 'opacity', keys: [key(0, from), key(d, to, ...easeArg(ease))] };
  }

  if (t.offset !== undefined) {
    const [from, to] = offsetEndpoints(t.offset, t.edge ?? 'bottom', dir);
    channels.offset = { path: 'position', keys: [key(0, from), key(d, to, ...easeArg(ease))] };
  }

  if (t.scale !== undefined) {
    const [from, to] = scaleEndpoints(t.scale);
    channels.scale = { path: 'scale', keys: [key(0, from), key(d, to, ...easeArg(ease))] };
  }

  return clip({ channels });
}

/** Spread-arg helper: pass `ease` to `key()` only when defined (no `undefined` arg). */
function easeArg(ease: EaseSpec | undefined): [EaseSpec] | [] {
  return ease !== undefined ? [ease] : [];
}

/** Edge → unit displacement direction (matches clipStdlib's slideIn `from` vectors). */
function edgeVec(edge: SlideEdge, dist: number): Vec2 {
  return edge === 'left'
    ? [-dist, 0]
    : edge === 'right'
      ? [dist, 0]
      : edge === 'top'
        ? [0, -dist]
        : [0, dist];
}

/**
 * Resolve the `offset` field to position [from, to] endpoints. A scalar slides that
 * magnitude along `edge`; a single Vec2 is the displaced point; a [Vec2,Vec2] is
 * verbatim endpoints. enter goes displaced→[0,0]; exit goes [0,0]→displaced.
 */
function offsetEndpoints(
  offset: number | Vec2 | [Vec2, Vec2],
  edge: SlideEdge,
  dir: 'enter' | 'exit',
): [Vec2, Vec2] {
  // Explicit [Vec2, Vec2] endpoints: a tuple whose first element is itself a Vec2.
  if (Array.isArray(offset) && isVec2(offset[0] as number | Vec2)) {
    return offset as [Vec2, Vec2];
  }
  const displaced: Vec2 = isVec2(offset as number | Vec2)
    ? (offset as Vec2)
    : edgeVec(edge, offset as number);
  const origin: Vec2 = [0, 0];
  return dir === 'enter' ? [displaced, origin] : [origin, displaced];
}

/** Resolve the `scale` field to [from, to] Vec2 endpoints (scalar pair → broadcast). */
function scaleEndpoints(scale: [number, number] | [Vec2, Vec2]): [Vec2, Vec2] {
  const [a, b] = scale;
  const broadcast = (v: number | Vec2): Vec2 => (isVec2(v) ? v : [v, v]);
  return [broadcast(a), broadcast(b)];
}

/** Normalize an enter/exit option (Clip or inline literal) to a Clip. */
function resolveTransition(
  t: Clip | PresenceTransition | undefined,
  dir: 'enter' | 'exit',
  fallback: () => Clip,
): Clip {
  if (t === undefined) return fallback();
  return isClip(t) ? t : transitionToClip(t, dir);
}

export interface PresenceResult {
  /** Reconciled tracks: the opacity guard (fused with enter/exit opacity keys) + any non-opacity channels. */
  tracks: Track[];
  /** The real exit second — siblings anchor here. Equals `hide`. */
  end: number;
  /** When the node became visible (= `show`). */
  shownAt: number;
  /** When the node finished exiting (= `hide`). */
  hiddenAt: number;
}

/** Effective duration of a clip after a speed multiplier (`apply` divides every t by speed). */
function effectiveDuration(c: Clip, opts: ApplyOpts | undefined): number {
  return c.duration / (opts?.speed ?? 1);
}

/**
 * Sort keys by `t`, breaking ties by original index (a STABLE sort, so that at a
 * coincident t the LATER-emitted key survives the later-wins dedup regardless of
 * the engine's `Array.sort` stability). Pure: returns a new array.
 */
function stableSortByT(keys: Key[]): Key[] {
  return keys
    .map((k, i): [Key, number] => [k, i])
    .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
    .map(([k]) => k);
}

/**
 * Pull the keys of the clip's OWN `<nodeId>/opacity` track out of an applied
 * result (if it authored one). Non-opacity tracks pass straight through.
 */
function partitionOpacity(
  tracks: Track[],
  opacityTarget: string,
): { opacityKeys: Key[]; rest: Track[] } {
  const rest: Track[] = [];
  let opacityKeys: Key[] = [];
  for (const tr of tracks) {
    if (tr.target === opacityTarget) opacityKeys = tr.keys as Key[];
    else rest.push(tr);
  }
  return { opacityKeys, rest };
}

/**
 * The same stable-sort + coincident-`t` later-wins dedup the opacity guard uses,
 * factored out so the NON-opacity channels reconcile identically. Given keys
 * already in merge order (earlier-emitted first), sort by `t` keeping that order
 * at ties, then collapse a coincident-`t` run to its LAST key. Pure.
 */
function reconcileKeys(keys: Key[]): Key[] {
  const sorted = stableSortByT(keys);
  const deduped: Key[] = [];
  for (const k of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.t === k.t) deduped[deduped.length - 1] = k;
    else deduped.push(k);
  }
  return deduped;
}

/**
 * Reconcile the enter's then the exit's NON-opacity tracks per target. When enter
 * AND exit animate the SAME non-opacity channel (e.g. both slide `position` — a
 * slide-in-hold-slide-out), emit ONE track per target whose keys are the enter's
 * then the exit's, fused with the SAME stable-sort + later-wins dedup as opacity:
 * at a coincident `t` (the enter's settle vs the exit's start) the exit wins, so
 * the merged ramp is continuous and no key is silently dropped by
 * `compileTimeline`'s `coalesce()`. Disjoint targets pass straight through.
 * Output order is stable: first appearance across [enterRest, exitRest].
 */
function reconcileNonOpacity(enterRest: Track[], exitRest: Track[]): Track[] {
  const order: string[] = [];
  const byTarget = new Map<string, Track[]>();
  for (const tr of [...enterRest, ...exitRest]) {
    const bucket = byTarget.get(tr.target);
    if (bucket) bucket.push(tr);
    else {
      byTarget.set(tr.target, [tr]);
      order.push(tr.target);
    }
  }
  return order.map((target) => {
    const group = byTarget.get(target)!;
    if (group.length === 1) return group[0]!;
    // enter keys precede exit keys (array order above), so the exit wins at any
    // coincident t — deep-equal to the hand-authored single reconciled track.
    const merged = group.flatMap((tr) => tr.keys as Key[]);
    return track(target, group[0]!.type, reconcileKeys(merged));
  });
}

/**
 * Schedule a node's enter/exit presence. Emits keyed `Track[]` only.
 *
 *   presence('card', { show: 1, hide: 5 })  // fade in at 1, fade out to land on 5
 */
export function presence(nodeId: TweenTarget, opts: PresenceOpts): PresenceResult {
  // `window:[t0,t1]` is an alias for `{ show: t0, hide: t1 }`. Explicit show/hide
  // take precedence if both are given (window only fills the gaps).
  const show = opts.show ?? opts.window?.[0];
  const hide = opts.hide ?? opts.window?.[1];
  if (show === undefined || hide === undefined) {
    throw new PresenceError(
      `presence() needs a window: pass { show, hide } or { window: [show, hide] }`,
    );
  }
  // Resolve the node id once (rejects '~' structural / anonymous ids). The node
  // id may itself carry slashes (an each() clone like 'card/3'); DO NOT re-split
  // it — APPEND the opacity suffix and trust the caller. The scene's
  // longest-registered-prefix resolver disambiguates node id vs prop path at
  // bind time, so 'card/3' stays the clone (not the wrapping 'card' Group).
  const opacityTarget = resolveTweenTarget(typeof nodeId === 'string' ? `${nodeId}/opacity` : nodeId);
  // for a property-signal carrier the path is already '<nodeId>/opacity'; the
  // nodeId portion (everything before the FINAL slash) re-suffixes the clips.
  const lastSlash = opacityTarget.lastIndexOf('/');
  const nodeIdStr = lastSlash < 0 ? opacityTarget : opacityTarget.slice(0, lastSlash);

  // enter/exit accept a Clip OR an inline PresenceTransition literal; both normalize
  // to a Clip, after which the rest of presence() runs UNCHANGED.
  const enter = resolveTransition(opts.enter, 'enter', defaultEnter);
  const exit = resolveTransition(opts.exit, 'exit', defaultExit);

  // --- enter: applied at `show` ---
  const enterRes = enter.apply(nodeIdStr, show, opts.enterOpts);
  const enterDur = effectiveDuration(enter, opts.enterOpts);
  const enterEnd = show + enterDur;

  // --- exit: BACK-TIMED to land exactly on `hide` (mirror springTo underflow) ---
  const exitDur = effectiveDuration(exit, opts.exitOpts);
  const exitStart = hide - exitDur;
  // `<=`, not `<`: exitStart == show is a NO-PLATEAU window — the exit's value-1
  // key would win the coincident-t dedup at show, destroying the enter fade AND
  // breaking the pre-show cull (opacity would ramp 0→1 across [0,show)). Require
  // a strictly-positive live plateau between the enter end and the exit start.
  if (exitStart <= show) {
    throw new PresenceError(
      `presence('${nodeIdStr}') exit needs ${exitDur.toFixed(3)}s but only ${(hide - show).toFixed(3)}s ` +
        `between show (${show}) and hide (${hide}) — widen the window or shorten/speed up the exit`,
    );
  }
  const exitRes = exit.apply(nodeIdStr, exitStart, opts.exitOpts);

  const { opacityKeys: enterOpacity, rest: enterRest } = partitionOpacity(enterRes.tracks, opacityTarget);
  const { opacityKeys: exitOpacity, rest: exitRest } = partitionOpacity(exitRes.tracks, opacityTarget);

  // --- window guard: a real opacity track holding 0 outside [show,hide], 1 inside ---
  // The BARE guard is three held keys: 0 pre-show (cull), 1 through the live
  // window, 0 post-hide (cull). We then OVERLAY the enter/exit opacity keys so
  // they WIN at coincident t (the merge order puts guard keys first, overlay
  // keys after, and the later-wins dedup keeps the overlay). At the enter end and
  // exit start seams this fuses the clip's real ramp into the guard with NO
  // double-authored key; pre-show / post-hide stay the held 0 that culls.
  const bareGuard: Key[] = [
    key(0, 0, { interp: 'hold' }),
    key(enterEnd, 1, { interp: 'hold' }),
    key(hide, 0, { interp: 'hold' }),
  ];

  // Overlay opacity keys: the enter/exit clip's own opacity ramp if it authored
  // one, else a SYNTHESIZED rise (0→1) / fall (1→0) across the clip span so a
  // no-opacity enter/exit (e.g. scale-only) still un-culls / re-culls the node.
  const overlay: Key[] = [];
  if (enterOpacity.length > 0) {
    // Pre-show cull hold: the segment from the pre-show guard key (0 @ t=0,hold)
    // ARRIVING at the enter's first opacity key would LERP if that key's value is
    // non-zero (sampleTrack reads the hold flag off the ARRIVAL key) — leaking
    // opacity 0→v across [0,show). If the enter starts above 0, hold the cull by
    // marking that first key 'hold' so [0,show) reads 0 and the ramp begins AT
    // show. A first value of exactly 0 needs no flag (lerp 0→0 = 0), so the
    // default-fade bytes are unchanged.
    enterOpacity.forEach((k, i) => {
      if (i === 0 && k.value !== 0 && k.interp !== 'hold') overlay.push({ ...k, interp: 'hold' });
      else overlay.push(k);
    });
  } else {
    overlay.push(key(show, 0), key(enterEnd, 1));
  }
  if (exitOpacity.length > 0) {
    for (const k of exitOpacity) overlay.push(k);
  } else {
    overlay.push(key(exitStart, 1), key(hide, 0));
  }

  // Reconcile: stable-sort by t (guard keys precede overlay keys at equal t), then
  // apply the builder's coincident-`t` later-wins dedup so the overlay ramp keys
  // replace the bare held guard keys they coincide with. Fixed merge order →
  // byte-deterministic output, deep-equal to the hand-authored reconciled track.
  const opacityTrack = track(opacityTarget, 'number', reconcileKeys([...bareGuard, ...overlay]));

  // Non-opacity channels (scale / position / …): reconcile per-target so an enter
  // AND exit animating the SAME channel (a slide-in-hold-slide-out) fuse into ONE
  // track — never two same-target tracks for `compileTimeline`'s coalesce() to
  // silently truncate. Disjoint channels pass straight through.
  const nonOpacity = reconcileNonOpacity(enterRest, exitRest);
  const tracks: Track[] = [opacityTrack, ...nonOpacity];

  return { tracks, end: hide, shownAt: show, hiddenAt: hide };
}
