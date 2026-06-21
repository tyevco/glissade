// @vitest-environment jsdom
/**
 * <gs-player> loop-attribute wiring (0.17.1): the player engine already supports
 * yoyo via LoopMode `{mode:'alternate'}`; the element just needed to expose it.
 * This asserts the attribute → mount-option translation directly by mocking
 * `mount` and capturing the `loop` option the element passes:
 *   - bare element        → no loop (false)
 *   - `loop`              → restart loop (true, unchanged)
 *   - `pingpong` / `yoyo` → `{mode:'alternate'}`
 *   - pingpong wins when both `loop` and `pingpong` are set
 * No real clock — a fake-clock/behavioral test of the mount seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneModule } from '@glissade/scene';

// Capture the options mount() is called with; return a minimal Mounted stub.
const mountCalls: Array<{ loop: unknown; autoplay: unknown }> = [];
vi.mock('@glissade/player', () => ({
  mount: (_scene: unknown, _doc: unknown, _canvas: unknown, opts: { loop: unknown; autoplay: unknown }) => {
    mountCalls.push({ loop: opts.loop, autoplay: opts.autoplay });
    return {
      player: { playing: false, duration: 1, dispose() {} },
      dispose() {},
    };
  },
}));

// Imported AFTER the mock so the element binds the mocked mount.
const { GsPlayerElement } = await import('../src/index.js');

// A trivial scene module: createScene returns the minimal shape the element reads.
const makeScene = (): SceneModule =>
  ({
    createScene: () =>
      ({
        size: { w: 10, h: 10 },
        timeline: { duration: 1 },
        playhead: { peek: () => 0, subscribe: () => () => {} },
      }) as unknown as ReturnType<SceneModule['createScene']>,
    timeline: { duration: 1 } as unknown as SceneModule['timeline'],
  }) as SceneModule;

function lastLoop(): unknown {
  return mountCalls[mountCalls.length - 1]!.loop;
}

describe('<gs-player> loop / pingpong attribute wiring', () => {
  beforeEach(() => {
    mountCalls.length = 0;
    if (!customElements.get('gs-player')) customElements.define('gs-player', GsPlayerElement);
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const mountWith = (attrs: string): InstanceType<typeof GsPlayerElement> => {
    const el = document.createElement('gs-player') as InstanceType<typeof GsPlayerElement>;
    for (const a of attrs.split(/\s+/).filter(Boolean)) el.setAttribute(a, '');
    el.scene = makeScene();
    document.body.appendChild(el); // connectedCallback → #remount → mount()
    return el;
  };

  it('bare <gs-player>: no loop (unchanged default)', () => {
    mountWith('');
    expect(lastLoop()).toBe(false);
  });

  it('`loop`: restart loop (boolean true)', () => {
    mountWith('loop');
    expect(lastLoop()).toBe(true);
  });

  it('`pingpong`: alternate (yoyo) loop mode', () => {
    mountWith('pingpong');
    expect(lastLoop()).toEqual({ mode: 'alternate' });
  });

  it('`yoyo` alias: alternate loop mode', () => {
    mountWith('yoyo');
    expect(lastLoop()).toEqual({ mode: 'alternate' });
  });

  it('pingpong wins over a plain loop when both are set', () => {
    mountWith('loop pingpong');
    expect(lastLoop()).toEqual({ mode: 'alternate' });
  });
});
