// @vitest-environment jsdom
/**
 * <gs-player> no-build embed ergonomics (card cRf45pkAwcNn): the `poster` /
 * `poster-t` first-frame still and `persist="key"` playhead resume. Both are
 * PLAYER/element-side only — poster is a snapshot of a pure frame, persist only
 * reads/writes the already-writable playhead signal; evaluate() is untouched.
 *
 * Like pingpong.test.ts this is a behavioral test of the element's seams: it
 * MOCKS `@glissade/player` (a controllable fake player + playhead — jsdom has no
 * real 2D canvas context) and `@glissade/backend-canvas2d/snapshot` (captures
 * the snapshot call + returns a stub data URL). The mock mount models mount()'s
 * shipped reduced-motion suppression (no autoplay under reduced motion), which
 * the element relies on rather than re-implementing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneModule } from '@glissade/scene';

// --- snapshot seam mock: record (t) and hand back a deterministic stub URL ----
const posterCalls: Array<{ t: number }> = [];
vi.mock('@glissade/backend-canvas2d/snapshot', () => ({
  renderToDataURL: (_scene: unknown, _timeline: unknown, t: number) => {
    posterCalls.push({ t });
    return Promise.resolve(`data:image/png;base64,POSTER@${t}`);
  },
}));

// --- player mock: a fake playhead + player whose seek/play drive real state ---
let reducedMotion = false;
let lastPlayer: FakePlayer | null = null;

interface FakePlayhead {
  peek(): number;
  subscribe(cb: () => void): () => void;
  set(v: number): void;
  forceSet(v: number): void;
}
interface FakePlayer {
  duration: number;
  readonly playing: boolean;
  playhead: FakePlayhead;
  playingSignal: { peek(): boolean; subscribe(cb: () => void): () => void };
  seek(t: number): void;
  play(): { finished: Promise<boolean> };
  pause(): void;
  dispose(): void;
}

function makePlayhead(initial = 0): FakePlayhead {
  let v = initial;
  const ls = new Set<() => void>();
  return {
    peek: () => v,
    subscribe: (cb) => (ls.add(cb), () => ls.delete(cb)),
    set: (x) => {
      v = x;
      for (const l of [...ls]) l();
    },
    forceSet: (x) => {
      v = x;
    },
  };
}

function makePlayer(playhead: FakePlayhead, opts: { autoplay?: boolean }): FakePlayer {
  const DURATION = 10;
  let playing = false;
  const pls = new Set<() => void>();
  const setPlaying = (val: boolean): void => {
    playing = val;
    for (const l of [...pls]) l();
  };
  const player: FakePlayer = {
    duration: DURATION,
    get playing() {
      return playing;
    },
    playhead,
    playingSignal: {
      peek: () => playing,
      subscribe: (cb) => (pls.add(cb), () => pls.delete(cb)),
    },
    seek(t) {
      playhead.set(Math.min(Math.max(t, 0), DURATION));
    },
    play() {
      setPlaying(true);
      return { finished: Promise.resolve(true) };
    },
    pause() {
      setPlaying(false);
    },
    dispose() {},
  };
  // mount()'s shipped policy: prefers-reduced-motion suppresses autoplay.
  if (opts.autoplay && !reducedMotion) player.play();
  return player;
}

vi.mock('@glissade/player', () => ({
  mount: (
    scene: { playhead: FakePlayhead },
    _doc: unknown,
    _canvas: unknown,
    opts: { autoplay?: boolean },
  ) => {
    lastPlayer = makePlayer(scene.playhead, opts ?? {});
    return { player: lastPlayer, dispose() {} };
  },
}));

// Imported AFTER the mocks so the element binds them.
const { GsPlayerElement } = await import('../src/index.js');

const makeScene = (): SceneModule =>
  ({
    createScene: () =>
      ({
        size: { w: 10, h: 10 },
        playhead: makePlayhead(0),
      }) as unknown as ReturnType<SceneModule['createScene']>,
    timeline: { version: 1, duration: 10 } as unknown as SceneModule['timeline'],
  }) as SceneModule;

type El = InstanceType<typeof GsPlayerElement>;

/** Set attributes ("name" or "name=value") then connect + assign a scene. */
function mountWith(attrs: string[]): El {
  const el = document.createElement('gs-player') as El;
  for (const a of attrs) {
    const eq = a.indexOf('=');
    if (eq === -1) el.setAttribute(a, '');
    else el.setAttribute(a.slice(0, eq), a.slice(eq + 1));
  }
  el.scene = makeScene();
  document.body.appendChild(el); // connectedCallback → #remount
  return el;
}

const posterImg = (el: El): HTMLImageElement | null =>
  el.shadowRoot!.querySelector('img[part="poster"]');

// flush the resolved renderToDataURL microtask
const tick = (): Promise<void> => Promise.resolve();

describe('<gs-player> poster / persist ergonomics', () => {
  beforeEach(() => {
    posterCalls.length = 0;
    reducedMotion = false;
    lastPlayer = null;
    localStorage.clear();
    if (!customElements.get('gs-player')) customElements.define('gs-player', GsPlayerElement);
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('`poster` paints a still BEFORE play: an <img> whose src is the frame-0 data URL', async () => {
    const el = mountWith(['poster']);
    const img = posterImg(el);
    expect(img).not.toBeNull();
    expect(lastPlayer!.playing).toBe(false); // no play yet
    expect(posterCalls.at(-1)).toEqual({ t: 0 }); // frame 0
    await tick();
    expect(img!.getAttribute('src')).toBe('data:image/png;base64,POSTER@0');
    expect(img!.hidden).toBe(false); // visible as the pre-play paint
  });

  it('`poster` under prefers-reduced-motion is the rest state — no animation loop starts', async () => {
    reducedMotion = true;
    const el = mountWith(['poster', 'autoplay']);
    await tick();
    // mount() suppressed autoplay under reduced motion → nothing plays …
    expect(lastPlayer!.playing).toBe(false);
    // … and the poster remains shown as the rest state.
    expect(posterImg(el)!.hidden).toBe(false);
    expect(posterImg(el)!.getAttribute('src')).toBe('data:image/png;base64,POSTER@0');
  });

  it('without reduced motion, `poster autoplay` reveals the live canvas once playing', async () => {
    const el = mountWith(['poster', 'autoplay']);
    await tick();
    expect(lastPlayer!.playing).toBe(true);
    expect(posterImg(el)!.hidden).toBe(true); // poster hidden, canvas revealed
  });

  it('`poster-t="1.5"` snapshots the frame at t=1.5s, not frame 0', async () => {
    mountWith(['poster', 'poster-t=1.5']);
    await tick();
    expect(posterCalls.at(-1)).toEqual({ t: 1.5 });
  });

  it('`persist="mykey"` round-trips the playhead across a simulated reload', () => {
    const el = mountWith(['persist=mykey']);
    lastPlayer!.seek(3.5); // user scrubs → write-through
    expect(localStorage.getItem('mykey')).toBe('3.5');

    // tear the embed down (disconnect) and re-instantiate with the SAME key
    el.remove();
    const el2 = mountWith(['persist=mykey']);
    expect(lastPlayer!.playhead.peek()).toBe(3.5); // restored
    void el2;
  });

  it('a DIFFERENT persist key does NOT restore another key’s playhead', () => {
    const el = mountWith(['persist=mykey']);
    lastPlayer!.seek(4.25);
    el.remove();

    mountWith(['persist=otherkey']); // no value stored under otherkey
    expect(lastPlayer!.playhead.peek()).toBe(0);
  });

  it('defaults-off: a bare <gs-player> writes nothing to localStorage and paints no poster', () => {
    const el = mountWith([]);
    expect(posterImg(el)).toBeNull(); // no poster <img>
    expect(posterCalls.length).toBe(0); // snapshot seam never invoked
    lastPlayer!.seek(2); // even a seek must not persist
    expect(localStorage.length).toBe(0);
    expect(el.classList.contains('has-poster')).toBe(false);
  });

  it('no-JS fallback: `poster` puts a real <img> paint in the DOM a screenshotter can capture', () => {
    const el = mountWith(['poster']);
    const imgs = el.shadowRoot!.querySelectorAll('img[part="poster"]');
    expect(imgs.length).toBe(1);
    expect(imgs[0]).toBeInstanceOf(HTMLImageElement);
  });
});
