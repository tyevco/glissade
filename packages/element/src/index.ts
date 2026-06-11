/**
 * <gs-player> (DESIGN.md §4.3 tier 2, controls inventory per §8): a
 * zero-framework custom element over mount(). The scene module is assigned
 * via the `scene` property (scene structure is code, §2.3 — there is no URL
 * loading); `controls`, `loop`, and `autoplay` are attributes. Default
 * controls are exactly the decided set — play/pause, scrubber, time readout —
 * themable via CSS parts (controls, button, scrubber, time); everything else
 * belongs to the page via the JS API.
 */

import { type SceneModule } from '@glissade/scene';
import { mount, type Mounted } from '@glissade/player';

const TEMPLATE = `
<style>
  :host { display: inline-block; }
  canvas { display: block; width: 100%; height: auto; }
  .controls { display: none; gap: 8px; align-items: center; padding: 6px 4px; font: 12px system-ui, sans-serif; }
  :host([controls]) .controls { display: flex; }
  button { font: inherit; cursor: pointer; }
  input[type='range'] { flex: 1; }
  .time { font-variant-numeric: tabular-nums; opacity: 0.75; min-width: 9ch; text-align: right; }
</style>
<canvas part="canvas"></canvas>
<div class="controls" part="controls">
  <button part="button" aria-label="Play or pause">Play</button>
  <input part="scrubber" type="range" min="0" max="1" step="0.0001" value="0" aria-label="Seek" />
  <span class="time" part="time"></span>
</div>
`;

export class GsPlayerElement extends HTMLElement {
  static observedAttributes = ['loop', 'autoplay'];

  #mounted: Mounted | null = null;
  #scene: SceneModule | null = null;
  #unsubscribe: (() => void) | null = null;
  #scrubbing = false;

  #canvas!: HTMLCanvasElement;
  #button!: HTMLButtonElement;
  #scrubber!: HTMLInputElement;
  #time!: HTMLSpanElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE;
    this.#canvas = root.querySelector('canvas')!;
    this.#button = root.querySelector('button')!;
    this.#scrubber = root.querySelector('input')!;
    this.#time = root.querySelector('.time')!;

    this.#button.addEventListener('click', () => {
      const player = this.#mounted?.player;
      if (!player) return;
      if (player.playing) player.pause();
      else void player.play();
      this.#syncButton();
    });
    this.#scrubber.addEventListener('input', () => {
      const player = this.#mounted?.player;
      if (!player) return;
      this.#scrubbing = true;
      player.pause();
      player.seek(parseFloat(this.#scrubber.value) * player.duration);
      this.#scrubbing = false;
      this.#syncButton();
    });
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
    this.#remount();
  }

  disconnectedCallback(): void {
    this.#teardown();
  }

  attributeChangedCallback(): void {
    if (this.isConnected && this.#scene) this.#remount();
  }

  #teardown(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#mounted?.dispose();
    this.#mounted = null;
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
    const player = this.#mounted.player;
    this.#unsubscribe = scene.playhead.subscribe(() => {
      requestAnimationFrame(() => {
        const t = scene.playhead.peek();
        this.#time.textContent = `${t.toFixed(2)} / ${player.duration.toFixed(2)}s`;
        if (!this.#scrubbing && player.duration > 0) {
          this.#scrubber.value = String(t / player.duration);
        }
        this.#syncButton();
      });
    });
    this.#time.textContent = `0.00 / ${player.duration.toFixed(2)}s`;
    this.#syncButton();
  }

  #syncButton(): void {
    const playing = this.#mounted?.player.playing ?? false;
    this.#button.textContent = playing ? 'Pause' : 'Play';
  }
}

/** Define <gs-player> (idempotent). Importing this module defines it. */
export function defineGsPlayer(tagName = 'gs-player'): void {
  if (!customElements.get(tagName)) customElements.define(tagName, GsPlayerElement);
}

defineGsPlayer();
