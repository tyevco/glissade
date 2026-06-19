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
import type { Clip, ApplyOpts } from './clip.js';
import { clip } from './clip.js';

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

export interface PresenceOpts {
  /** Wall-clock second the node ENTERS (becomes visible). */
  show: number;
  /** Wall-clock second the node has fully EXITED (the exit LANDS here). */
  hide: number;
  /** Entrance clip (default = a plain opacity fade-in 0→1, ~0.3s). */
  enter?: Clip;
  /** Exit clip (default = a plain opacity fade-out 1→0, ~0.3s). Back-timed to land on `hide`. */
  exit?: Clip;
  /** Forwarded to `enter.apply` (speed / per-channel overrides). */
  enterOpts?: ApplyOpts;
  /** Forwarded to `exit.apply` (speed / per-channel overrides). */
  exitOpts?: ApplyOpts;
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
 * Schedule a node's enter/exit presence. Emits keyed `Track[]` only.
 *
 *   presence('card', { show: 1, hide: 5 })  // fade in at 1, fade out to land on 5
 */
export function presence(nodeId: TweenTarget, opts: PresenceOpts): PresenceResult {
  const { show, hide } = opts;
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

  const enter = opts.enter ?? defaultEnter();
  const exit = opts.exit ?? defaultExit();

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
  const merged = [...bareGuard, ...overlay];
  const sorted = stableSortByT(merged);
  const deduped: Key[] = [];
  for (const k of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.t === k.t) deduped[deduped.length - 1] = k;
    else deduped.push(k);
  }

  const opacityTrack = track(opacityTarget, 'number', deduped);

  // Non-opacity channels (scale / position / …) from BOTH clips pass through.
  const tracks: Track[] = [opacityTrack, ...enterRest, ...exitRest];

  return { tracks, end: hide, shownAt: show, hiddenAt: hide };
}
