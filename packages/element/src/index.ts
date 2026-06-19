/**
 * <gs-player> (DESIGN.md §4.3 tier 2, controls inventory per §8): a
 * zero-framework custom element over mount(). The scene module is assigned
 * via the `scene` property (scene structure is code, §2.3 — there is no URL
 * loading); `controls`, `loop`, and `autoplay` are attributes. Default
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

const TEMPLATE = `
<style>
  :host { display: inline-block; }
  canvas { display: block; width: 100%; height: auto; }
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
  static observedAttributes = ['loop', 'autoplay', 'controls'];

  #mounted: Mounted | null = null;
  #scene: SceneModule | null = null;
  #unsubscribe: (() => void) | null = null;
  #scrubbing = false;
  #playhead: { peek(): number } | null = null;

  #shadow: ShadowRoot;
  #canvas: HTMLCanvasElement;
  #controls: Controls | null = null;

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
      this.#syncControls();
      // A live controls toggle needs the subscription rewired (it only runs
      // when controls are present), so remount drives that off the current scene.
      if (this.isConnected && this.#scene) this.#remount();
      return;
    }
    if (this.isConnected && this.#scene) this.#remount();
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
    this.#mounted = mount(scene, this.#scene.timeline, this.#canvas, {
      loop: this.hasAttribute('loop'),
      autoplay: this.hasAttribute('autoplay'),
    });
    this.#playhead = scene.playhead;
    // The scrubber/time subscription only exists to drive the controls — skip
    // it entirely when controls are absent so no per-frame work runs.
    if (this.#controls) {
      this.#unsubscribe = scene.playhead.subscribe(() => {
        requestAnimationFrame(() => {
          if (!this.#controls) return;
          this.#syncReadout();
          this.#syncButton();
        });
      });
    }
    this.#syncReadout();
    this.#syncButton();
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

/** Define <gs-player> (idempotent). Importing this module defines it. */
export function defineGsPlayer(tagName = 'gs-player'): void {
  if (!customElements.get(tagName)) customElements.define(tagName, GsPlayerElement);
}

defineGsPlayer();
