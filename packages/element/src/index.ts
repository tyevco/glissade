/**
 * <gs-player> (DESIGN.md §4.3 tier 2, controls inventory per §8): a
 * zero-framework custom element over mount(). The scene module is assigned
 * via the `scene` property (scene structure is code, §2.3 — there is no URL
 * loading); `controls`, `loop`, `pingpong` (alias `yoyo`), and `autoplay` are
 * attributes (`loop` restarts, `pingpong` alternates/yoyos). Default
 * controls are exactly the decided set — play/pause, scrubber, time readout —
 * themable via CSS parts (controls, button, scrubber, time); everything else
 * belongs to the page via the JS API.
 *
 * Controls are lazy-constructed: with no `controls` attribute the element
 * builds zero controls DOM and attaches zero control listeners (and the
 * playhead subscription that drives the scrubber/time readout never runs).
 * Adding the attribute builds them live; removing it tears them down.
 */

import { type SceneModule } from '@glissade/scene';
import { mount, type Mounted } from '@glissade/player';
import { renderToDataURL } from '@glissade/backend-canvas2d/snapshot';

const TEMPLATE = `
<style>
  :host { display: inline-block; }
  /* Only when a poster overlay is present do we make the host a positioning
     context — a bare <gs-player> is byte/behavior-identical (no positioned
     descendants, no stacking change). */
  :host(.has-poster) { position: relative; }
  canvas { display: block; width: 100%; height: auto; }
  /* The poster is a real <img> overlaying the canvas region (same intrinsic
     aspect → exact cover): pre-play still, prefers-reduced-motion rest state,
     and a DOM paint a screenshotter can capture. Absolute so it never disturbs
     controls flow; [hidden] reveals the live canvas once playback begins. */
  img[part='poster'] { position: absolute; top: 0; left: 0; width: 100%; height: auto; display: block; }
  img[part='poster'][hidden] { display: none; }
  .controls { display: flex; gap: 8px; align-items: center; padding: 6px 4px; font: 12px system-ui, sans-serif; }
  button { font: inherit; cursor: pointer; }
  input[type='range'] { flex: 1; }
  .time { font-variant-numeric: tabular-nums; opacity: 0.75; min-width: 9ch; text-align: right; }
</style>
<canvas part="canvas"></canvas>
`;

interface Controls {
  readonly root: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly scrubber: HTMLInputElement;
  readonly time: HTMLSpanElement;
  readonly onClick: () => void;
  readonly onInput: () => void;
}

export class GsPlayerElement extends HTMLElement {
  static observedAttributes = [
    'loop',
    'pingpong',
    'yoyo',
    'autoplay',
    'controls',
    'poster',
    'poster-t',
    'persist',
  ];

  #mounted: Mounted | null = null;
  #scene: SceneModule | null = null;
  #unsubscribe: (() => void) | null = null;
  #scrubbing = false;
  #playhead: { peek(): number; subscribe(listener: () => void): () => void } | null = null;

  #shadow: ShadowRoot;
  #canvas: HTMLCanvasElement;
  #controls: Controls | null = null;
  /** The <img> poster overlay (opt-in via the `poster` attribute), or null. */
  #poster: HTMLImageElement | null = null;
  /** Guards the async snapshot against a stale remount overwriting a newer one. */
  #posterToken = 0;
  /** Subscription that hides the poster once real playback begins. */
  #posterUnsub: (() => void) | null = null;
  /** Subscription that write-throughs the playhead to localStorage (persist). */
  #persistUnsub: (() => void) | null = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE;
    this.#shadow = root;
    this.#canvas = root.querySelector('canvas')!;
  }

  /** The scene module to play; assigning (re)mounts. */
  get scene(): SceneModule | null {
    return this.#scene;
  }

  set scene(mod: SceneModule | null) {
    this.#scene = mod;
    this.#remount();
  }

  /** The underlying Player, once a scene is mounted. */
  get player() {
    return this.#mounted?.player ?? null;
  }

  connectedCallback(): void {
    this.#syncControls();
    this.#remount();
  }

  disconnectedCallback(): void {
    this.#teardown();
  }

  attributeChangedCallback(name: string): void {
    if (name === 'controls') {
      // A live controls toggle is cosmetic chrome — build/destroy the controls
      // DOM and wire/unwire their playhead subscription against the CURRENT
      // mounted scene. Never remount (that would reset the playhead to 0 and
      // stop playback). loop/autoplay still remount since they change mount().
      this.#syncControls();
      this.#syncControlsSubscription();
      return;
    }
    if (name === 'poster' || name === 'poster-t') {
      // Poster is an overlay, not a mount() input — toggle/refresh it against
      // the CURRENT scene without remounting (a remount would reset the
      // playhead). No-op until a scene is mounted (nothing to snapshot yet).
      if (this.isConnected) this.#syncPoster();
      return;
    }
    if (name === 'persist') {
      // Persist only reads/writes the already-writable playhead — rewire it
      // in place (no remount, no playhead reset).
      this.#persistUnsub?.();
      this.#persistUnsub = null;
      if (this.isConnected) this.#syncPersist();
      return;
    }
    if (this.isConnected && this.#scene) this.#remount();
  }

  /** Wire the scrubber/time playhead subscription when controls exist, unwire
   * when they don't — against the existing playhead, so toggling controls never
   * disturbs playback position. */
  #syncControlsSubscription(): void {
    if (this.#controls && !this.#unsubscribe && this.#playhead) {
      this.#unsubscribe = this.#playhead.subscribe(() => {
        requestAnimationFrame(() => {
          if (!this.#controls) return;
          this.#syncReadout();
          this.#syncButton();
        });
      });
      this.#syncReadout();
      this.#syncButton();
    } else if (!this.#controls && this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }
  }

  /** Build the controls subtree + listeners on demand; tear them down when gone. */
  #syncControls(): void {
    const want = this.hasAttribute('controls');
    if (want && !this.#controls) this.#buildControls();
    else if (!want && this.#controls) this.#destroyControls();
  }

  #buildControls(): void {
    const div = document.createElement('div');
    div.className = 'controls';
    div.setAttribute('part', 'controls');

    const button = document.createElement('button');
    button.setAttribute('part', 'button');
    button.setAttribute('aria-label', 'Play or pause');
    button.textContent = 'Play';

    const scrubber = document.createElement('input');
    scrubber.setAttribute('part', 'scrubber');
    scrubber.type = 'range';
    scrubber.min = '0';
    scrubber.max = '1';
    scrubber.step = '0.0001';
    scrubber.value = '0';
    scrubber.setAttribute('aria-label', 'Seek');

    const time = document.createElement('span');
    time.className = 'time';
    time.setAttribute('part', 'time');

    const onClick = (): void => {
      const player = this.#mounted?.player;
      if (!player) return;
      if (player.playing) player.pause();
      else void player.play();
      this.#syncButton();
    };
    const onInput = (): void => {
      const player = this.#mounted?.player;
      if (!player) return;
      this.#scrubbing = true;
      player.pause();
      player.seek(parseFloat(scrubber.value) * player.duration);
      this.#scrubbing = false;
      this.#syncButton();
    };
    button.addEventListener('click', onClick);
    scrubber.addEventListener('input', onInput);

    div.append(button, scrubber, time);
    this.#shadow.append(div);
    this.#controls = { root: div, button, scrubber, time, onClick, onInput };

    // Reflect current state into the freshly-built controls.
    this.#syncReadout();
    this.#syncButton();
  }

  #destroyControls(): void {
    const c = this.#controls;
    if (!c) return;
    c.button.removeEventListener('click', c.onClick);
    c.scrubber.removeEventListener('input', c.onInput);
    c.root.remove();
    this.#controls = null;
  }

  #teardown(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#persistUnsub?.();
    this.#persistUnsub = null;
    this.#posterUnsub?.();
    this.#posterUnsub = null;
    this.#mounted?.dispose();
    this.#mounted = null;
    this.#playhead = null;
  }

  #remount(): void {
    this.#teardown();
    if (!this.#scene || !this.isConnected) return;
    const scene = this.#scene.createScene();
    this.#canvas.width = scene.size.w;
    this.#canvas.height = scene.size.h;
    // `pingpong` (alias `yoyo`) selects the player's alternate loop mode; the
    // bare `loop` attr is the default restart loop. pingpong wins if both are
    // set (it's the more specific intent). Defaults off → no loop.
    const pingpong = this.hasAttribute('pingpong') || this.hasAttribute('yoyo');
    const loop = pingpong ? ({ mode: 'alternate' } as const) : this.hasAttribute('loop');
    this.#mounted = mount(scene, this.#scene.timeline, this.#canvas, {
      loop,
      autoplay: this.hasAttribute('autoplay'),
    });
    this.#playhead = scene.playhead;
    // The scrubber/time subscription only exists to drive the controls — wire it
    // (and do the initial readout) only when controls are present, so no
    // per-frame work runs without them.
    this.#syncControlsSubscription();
    // persist BEFORE poster: restore the stored playhead (if any) and start
    // write-through — both opt-in, both no-ops without their attribute.
    this.#syncPersist();
    this.#syncPoster();
  }

  // --- poster (opt-in `poster` / `poster-t`) --------------------------------

  /** Build/destroy the poster overlay to match the `poster` attribute, then
   * (re)render its still for the current scene. All no-ops when `poster` is
   * absent — a bare <gs-player> paints no poster and touches no <img>. */
  #syncPoster(): void {
    const want = this.hasAttribute('poster');
    if (want && !this.#poster) this.#buildPoster();
    else if (!want && this.#poster) this.#destroyPoster();
    if (this.#poster) this.#refreshPoster();
  }

  #buildPoster(): void {
    const img = document.createElement('img');
    img.setAttribute('part', 'poster');
    img.setAttribute('alt', '');
    img.setAttribute('aria-hidden', 'true');
    this.classList.add('has-poster');
    this.#shadow.append(img);
    this.#poster = img;
  }

  #destroyPoster(): void {
    this.#posterUnsub?.();
    this.#posterUnsub = null;
    this.#poster?.remove();
    this.#poster = null;
    this.classList.remove('has-poster');
  }

  /** `poster-t="<seconds>"` selects the frame to snapshot; default 0. */
  #posterTime(): number {
    const raw = this.getAttribute('poster-t');
    if (raw === null) return 0;
    const t = Number.parseFloat(raw);
    return Number.isFinite(t) && t >= 0 ? t : 0;
  }

  /** Render the poster still off a FRESH scene (evaluate() writes the playhead,
   * so the live mounted scene must never be used) and set it as the <img> src.
   * Reuses the shipped @glissade/backend-canvas2d/snapshot seam. */
  #refreshPoster(): void {
    const mod = this.#scene;
    const img = this.#poster;
    if (!mod || !img || !this.isConnected) return;
    const token = ++this.#posterToken;
    img.hidden = false;
    // A throwaway scene: renderToDataURL → evaluate() forceSets its playhead to
    // the poster time; keeping that off the mounted scene preserves playback.
    const still = mod.createScene();
    void renderToDataURL(still, mod.timeline, this.#posterTime()).then(
      (url) => {
        if (token === this.#posterToken && this.#poster) this.#poster.src = url;
      },
      () => {
        /* snapshot unavailable (non-browser canvas) — leave the poster empty */
      },
    );
    this.#wirePosterHide();
  }

  /** Reveal the live canvas (hide the poster) the moment playback begins. Under
   * prefers-reduced-motion, mount() suppresses autoplay, so `playing` never
   * flips true and the poster stays as the rest state. */
  #wirePosterHide(): void {
    this.#posterUnsub?.();
    this.#posterUnsub = null;
    const player = this.#mounted?.player;
    const img = this.#poster;
    if (!player || !img) return;
    if (player.playing) {
      img.hidden = true;
      return;
    }
    const sig = player.playingSignal;
    if (!sig) return;
    this.#posterUnsub = sig.subscribe(() => {
      if (this.#mounted?.player.playing && this.#poster) {
        this.#poster.hidden = true;
        this.#posterUnsub?.();
        this.#posterUnsub = null;
      }
    });
  }

  // --- persist (opt-in `persist="key"`) -------------------------------------

  /** Restore the playhead from localStorage (if a value was stored under the
   * key) and write it back on every change. No-op without the attribute or a
   * localStorage — a bare <gs-player> writes nothing. Only the already-writable
   * playhead signal is touched; evaluate() is never involved. */
  #syncPersist(): void {
    const key = this.getAttribute('persist');
    const player = this.#mounted?.player;
    const ph = this.#playhead;
    if (key === null || key === '' || !player || !ph || typeof localStorage === 'undefined') return;
    const stored = safeGetItem(key);
    if (stored !== null) {
      const t = Number.parseFloat(stored);
      if (Number.isFinite(t)) player.seek(t); // clamped by the player to [0, duration]
    }
    this.#persistUnsub = ph.subscribe(() => {
      safeSetItem(key, String(ph.peek()));
    });
  }

  #syncReadout(): void {
    const c = this.#controls;
    const player = this.#mounted?.player;
    if (!c || !player) return;
    const t = this.#playhead?.peek() ?? 0;
    c.time.textContent = `${t.toFixed(2)} / ${player.duration.toFixed(2)}s`;
    if (!this.#scrubbing && player.duration > 0) {
      c.scrubber.value = String(t / player.duration);
    }
  }

  #syncButton(): void {
    const c = this.#controls;
    if (!c) return;
    const playing = this.#mounted?.player.playing ?? false;
    c.button.textContent = playing ? 'Pause' : 'Play';
  }
}

/** localStorage access can throw (private-mode SecurityError, quota) — persist
 * is best-effort and must never break playback, so both accessors swallow. */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota exceeded — silently skip */
  }
}

/** Define <gs-player> (idempotent). Importing this module defines it. */
export function defineGsPlayer(tagName = 'gs-player'): void {
  if (!customElements.get(tagName)) customElements.define(tagName, GsPlayerElement);
}

defineGsPlayer();
