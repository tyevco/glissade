import { describe, expect, it } from 'vitest';
import {
  key,
  timeline,
  track,
  signal,
  BindTypeMismatchError,
  UnboundTargetError,
  type Paint,
  type Vec2,
  type PathValue,
} from '@glissade/core';
import {
  applyToPoint,
  bindScene,
  Circle,
  Custom,
  createScene,
  DuplicateNodeIdError,
  evaluate,
  fromTRS,
  Group,
  ImageNode,
  multiply,
  Path,
  Rect,
  ReservedNodeIdError,
  Text,
  Video,
  NodeConstructionError,
  measureWrappedText,
  quantize,
  estimatingMeasurer,
  type DisplayList,
} from '../src/index.js';
import { Layout, Stack } from '@glissade/scene/layout-ctors';

const demoScene = () =>
  createScene({
    size: { w: 800, h: 450 },
    children: [
      new Circle({ id: 'circle', radius: 50, fill: '#e6a700', opacity: 0, position: [100, 225] }),
    ],
  });

const demoDoc = () =>
  timeline({
    tracks: [
      track('circle/opacity', 'number', [
        key(0, 0),
        key(1, 1, 'easeInOutCubic'),
        key(2, 1, { interp: 'hold' }),
        key(2.5, 0, 'easeOutQuad'),
      ]),
      track('circle/position.x', 'number', [key(1, 100), key(2, 400, 'easeInOutCubic')]),
    ],
  });

describe('matrices', () => {
  it('composes translate/rotate/scale like canvas transform', () => {
    const m = fromTRS([10, 20], 90, [2, 2]);
    const p = applyToPoint(m, [1, 0]);
    expect(p[0]).toBeCloseTo(10, 9);
    expect(p[1]).toBeCloseTo(22, 9);
  });

  it('multiply matches sequential application', () => {
    const a = fromTRS([5, 0], 0, [2, 1]);
    const b = fromTRS([0, 3], 0, [1, 1]);
    const ab = multiply(a, b);
    expect(applyToPoint(ab, [1, 1])).toEqual(applyToPoint(a, applyToPoint(b, [1, 1])));
  });

  it('worldMatrix chains through parents', () => {
    const inner = new Circle({ id: 'c', radius: 1, position: [1, 0] });
    const g = new Group({ position: [10, 0], scale: [2, 2], children: [inner] });
    void g;
    expect(applyToPoint(inner.worldMatrix(), [0, 0])).toEqual([12, 0]);
  });
});

describe('scene construction', () => {
  it('indexes nodes by explicit id', () => {
    const scene = demoScene();
    expect(scene.nodes.has('circle')).toBe(true);
    expect(scene.resolveTarget('circle/opacity')).toBeDefined();
    expect(scene.resolveTarget('circle/position.x')).toBeDefined();
    expect(scene.resolveTarget('ghost/opacity')).toBeUndefined();
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      createScene({
        size: { w: 100, h: 100 },
        children: [new Circle({ id: 'a' }), new Rect({ id: 'a' })],
      }),
    ).toThrow(DuplicateNodeIdError);
  });

  it("rejects an explicit id in the reserved '~' namespace at construction (§finding-4)", () => {
    expect(() =>
      createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: '~weird' })] }),
    ).toThrow(ReservedNodeIdError);
  });
});

describe('evaluate(scene, timeline, t) — the §2.5 contract', () => {
  it('produces a serializable DisplayList', () => {
    const scene = demoScene();
    const list = evaluate(scene, demoDoc(), 1.5);
    expect(list.size).toEqual({ w: 800, h: 450 });
    expect(JSON.parse(JSON.stringify(list))).toEqual(list);
    const fill = list.commands.find((c) => c.op === 'fillPath');
    expect(fill).toBeDefined();
  });

  it('same (scene, timeline, t) → identical DisplayList, any call order', () => {
    const sceneA = demoScene();
    const sceneB = demoScene();
    const doc = demoDoc();
    const ts = [2.2, 0.3, 1.5, 0.0, 2.5, 1.0];
    const a = ts.map((t) => evaluate(sceneA, doc, t));
    const sorted = [...ts].sort((x, y) => x - y);
    const b = new Map(sorted.map((t) => [t, evaluate(sceneB, doc, t)] as const));
    ts.forEach((t, i) => expect(a[i]).toEqual(b.get(t)));
  });

  it('twice ≡ once', () => {
    const scene = demoScene();
    const doc = demoDoc();
    expect(evaluate(scene, doc, 1.25)).toEqual(evaluate(scene, doc, 1.25));
  });

  it('animated values appear in the IR', () => {
    const scene = demoScene();
    const doc = demoDoc();
    const at = (t: number) => {
      const list = evaluate(scene, doc, t);
      const transform = list.commands.find((c) => c.op === 'transform');
      const group = list.commands.find((c) => c.op === 'pushGroup');
      return { transform, group };
    };
    // t=1.5: opacity holds at 1 → no pushGroup; x is mid-move
    const mid = at(1.5);
    expect(mid.group).toBeUndefined();
    expect(mid.transform && mid.transform.op === 'transform' ? mid.transform.m[4] : NaN).toBeCloseTo(
      250,
      9,
    );
    // t=0.5: fading in → pushGroup carries the eased opacity
    const fade = at(0.5);
    expect(fade.group && fade.group.op === 'pushGroup' ? fade.group.opacity : NaN).toBeCloseTo(0.5, 9);
  });

  it('opacity 0 elides the node entirely', () => {
    const scene = demoScene();
    const list = evaluate(scene, demoDoc(), 0);
    expect(list.commands.filter((c) => c.op === 'fillPath')).toHaveLength(0);
  });
});

describe('z-order (§3.1)', () => {
  it('zIndex reorders siblings stably', () => {
    const scene = createScene({
      size: { w: 10, h: 10 },
      children: [
        new Rect({ id: 'a', width: 1, height: 1, fill: '#111111', zIndex: 1 }),
        new Rect({ id: 'b', width: 1, height: 1, fill: '#222222' }),
        new Rect({ id: 'c', width: 1, height: 1, fill: '#333333', zIndex: 1 }),
      ],
    });
    const list = evaluate(scene, timeline({}), 0);
    const fills = list.commands
      .filter((c): c is Extract<typeof c, { op: 'fillPath' }> => c.op === 'fillPath')
      .map((c) => (c.paint.kind === 'color' ? c.paint.color : undefined));
    expect(fills).toEqual(['#222222', '#111111', '#333333']);
  });
});

describe('computed prop initializers (§2.1)', () => {
  it('props accept () => T sources', () => {
    const driver = signal(10);
    const c = new Circle({ id: 'c', radius: () => driver() * 2, fill: '#ffffff' });
    expect(c.radius()).toBe(20);
    driver.set(15);
    expect(c.radius()).toBe(30);
  });

  it('cross-node derivation', () => {
    const a = new Circle({ id: 'a', radius: 7 });
    const b = new Rect({ id: 'b', width: () => a.radius() * 2, height: 2, fill: '#fff' });
    expect(b.width()).toBe(14);
    a.radius.set(10);
    expect(b.width()).toBe(20);
  });
});

describe('Text node (M1 minimal)', () => {
  it('emits a fillText command', () => {
    const scene = createScene({
      size: { w: 100, h: 100 },
      children: [new Text({ id: 't', text: 'hi', fill: '#fff', fontSize: 24 })],
    });
    const list: DisplayList = evaluate(scene, timeline({}), 0);
    const cmd = list.commands.find((c) => c.op === 'fillText');
    expect(cmd && cmd.op === 'fillText' ? cmd.text : '').toBe('hi');
  });
});

describe('resource interning', () => {
  it('identical paths share one resource', () => {
    const scene = createScene({
      size: { w: 10, h: 10 },
      children: [
        new Circle({ id: 'a', radius: 5, fill: '#fff' }),
        new Circle({ id: 'b', radius: 5, fill: '#000' }),
      ],
    });
    const list = evaluate(scene, timeline({}), 0);
    expect(list.resources).toHaveLength(1);
  });
});

// 0.14 scalar→vec2 bind-time guard: a track whose value type doesn't match the
// target prop's shape is the silent-NaN class (a scalar on a vec2 prop → the
// compound becomes a number, .x/.y index it to undefined → NaN matrix → the
// node + subtree vanish). The guard hard-throws at BIND time (the track's type
// is known then), naming the target/got/expected with a fix hint.
describe('bind-time type guard (§2.2, 0.14)', () => {
  const sceneWith = (n: Rect | Circle | Path): ReturnType<typeof createScene> =>
    createScene({ size: { w: 200, h: 100 }, children: [n] });

  it('a SCALAR track on a vec2 `scale` prop throws BindTypeMismatchError (clear message)', () => {
    const scene = sceneWith(new Rect({ id: 'card', width: 40, height: 40 }));
    const doc = timeline({ tracks: [track('card/scale', 'number', [key(0, 0.8), key(0.3, 1)])] });
    let err: unknown;
    try {
      bindScene(scene, doc);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BindTypeMismatchError);
    const m = (err as BindTypeMismatchError).message;
    expect(m).toContain('card/scale');
    expect(m).toContain("'number'"); // got
    expect(m).toContain("'vec2'"); // expected
    expect(m).toContain('scale.x'); // fix hint points at the component path
  });

  it('the SAME scalar track on `scale.x` (a component) binds fine — no throw, finite matrix', () => {
    const scene = sceneWith(new Rect({ id: 'card', width: 40, height: 40 }));
    const doc = timeline({ tracks: [track('card/scale.x', 'number', [key(0, 0.8), key(0.3, 1)])] });
    expect(() => bindScene(scene, doc)).not.toThrow();
    evaluate(scene, doc, 0.15);
    const node = scene.nodes.get('card')!;
    expect(node.localMatrix().every((v) => Number.isFinite(v))).toBe(true);
  });

  it('a NUMBER track on `fill` (color|paint) throws', () => {
    const scene = sceneWith(new Rect({ id: 'card', width: 40, height: 40, fill: '#fff' }));
    const doc = timeline({ tracks: [track('card/fill', 'number', [key(0, 0), key(1, 1)])] });
    expect(() => bindScene(scene, doc)).toThrow(BindTypeMismatchError);
  });

  it('a COLOR track on a number `opacity` prop throws', () => {
    const scene = sceneWith(new Rect({ id: 'card', width: 40, height: 40 }));
    const doc = timeline({ tracks: [track('card/opacity', 'color', [key(0, '#000'), key(1, '#fff')])] });
    expect(() => bindScene(scene, doc)).toThrow(BindTypeMismatchError);
  });

  it('a `fill` prop accepts BOTH a color track AND a paint track (polymorphic, no throw)', () => {
    const colorScene = sceneWith(new Circle({ id: 'orb', radius: 20, fill: '#e6a700' }));
    expect(() =>
      bindScene(colorScene, timeline({ tracks: [track('orb/fill', 'color', [key(0, '#e6a700'), key(1, '#7c4dff')])] })),
    ).not.toThrow();
    const paintScene = sceneWith(new Rect({ id: 'orb', width: 40, height: 40, fill: '#000' }));
    expect(() =>
      bindScene(
        paintScene,
        timeline({
          tracks: [
            track('orb/fill', 'paint', [
              key<Paint>(0, { kind: 'color', color: '#000' }),
              key<Paint>(1, { kind: 'color', color: '#fff' }),
            ]),
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('a vec2-arc track binds to a node `position`/`scale` and samples to a finite Vec2 (FIX 1)', () => {
    const scene = sceneWith(new Circle({ id: 'dot', radius: 10, position: [10, 0] }));
    const doc = timeline({
      tracks: [
        track<Vec2>('dot/position', 'vec2-arc', [key<Vec2>(0, [10, 0]), key<Vec2>(1, [0, 10])]),
        track<Vec2>('dot/scale', 'vec2-arc', [key<Vec2>(0, [1, 1]), key<Vec2>(1, [2, 2])]),
      ],
    });
    // mount must NOT throw — vec2 targets are tagged ['vec2','vec2-arc'] now
    expect(() => bindScene(scene, doc)).not.toThrow();
    evaluate(scene, doc, 0.5);
    const node = scene.nodes.get('dot')!;
    const pos = (node as unknown as { position: () => Vec2 }).position();
    expect(pos.length).toBe(2);
    expect(pos.every((v) => Number.isFinite(v))).toBe(true);
    expect(node.localMatrix().every((v) => Number.isFinite(v))).toBe(true);
  });

  it('a custom Node subclass calling the 2-arg registerTarget binds ANY track (FIX 2)', () => {
    // mirrors the public Custom/Node subclassing seam: an UNtagged prop opts out
    // of the guard (0.13 back-compat — 0.13 had no guard). A real built-in
    // mismatch still throws (covered by the scale-number case above).
    class Widget extends Custom {
      readonly knob = signal(0);
      constructor() {
        super({ id: 'widget' });
        // 2-arg form: no `expects` → untagged target
        (this as unknown as { registerTarget(p: string, s: unknown): void }).registerTarget('knob', this.knob);
      }
      protected draw(): void {
        /* nothing to draw */
      }
    }
    const scene = createScene({ size: { w: 100, h: 100 }, children: [new Widget()] });
    // a number track AND a vec2 track both bind without throwing on the untagged prop
    expect(() =>
      bindScene(scene, timeline({ tracks: [track('widget/knob', 'number', [key(0, 0), key(1, 1)])] })),
    ).not.toThrow();
    expect(() =>
      bindScene(scene, timeline({ tracks: [track<Vec2>('widget/knob', 'vec2', [key<Vec2>(0, [0, 0])])] })),
    ).not.toThrow();
  });

  it('a path track on Path `d` and a number track on `opacity` bind unchanged (correct binds pass)', () => {
    const square: PathValue = [
      { closed: true, v: [[0, 0], [10, 0], [10, 10], [0, 10]] as Vec2[], in: [[0, 0], [0, 0], [0, 0], [0, 0]] as Vec2[], out: [[0, 0], [0, 0], [0, 0], [0, 0]] as Vec2[] },
    ];
    const scene = sceneWith(new Path({ id: 'p', data: square, fill: '#fff' }));
    const doc = timeline({
      tracks: [
        track('p/d', 'path', [key(0, square), key(1, square)]),
        track('p/opacity', 'number', [key(0, 0), key(1, 1)]),
        track('p/scale', 'vec2', [key<Vec2>(0, [1, 1]), key<Vec2>(1, [2, 2])]),
        track('p/position', 'vec2', [key<Vec2>(0, [0, 0]), key<Vec2>(1, [5, 5])]),
      ],
    });
    expect(() => bindScene(scene, doc)).not.toThrow();
    evaluate(scene, doc, 0.5);
    expect(scene.nodes.get('p')!.localMatrix().every((v) => Number.isFinite(v))).toBe(true);
  });
});

// 0.20 (M9qXdWCu): a track aimed at a CONSTRUCTION prop (animatable:false — e.g.
// Image/Video `assetId`, Text `fontFamily`) is already correctly rejected; this
// only makes the message say WHY ("set it at construction") instead of the
// generic "no property signal resolves to it". A genuinely-unknown prop still
// gets the generic UnboundTargetError.
describe('construction-prop bind error (0.20)', () => {
  it('binding Image `assetId` (a required construction prop) throws the SPECIFIC message', () => {
    const scene = createScene({
      size: { w: 200, h: 100 },
      children: [new ImageNode({ id: 'bg', assetId: 'hero', width: 200, height: 100 })],
    });
    const doc = timeline({ tracks: [track('bg/assetId', 'number', [key(0, 0), key(1, 1)])] });
    let err: unknown;
    try {
      bindScene(scene, doc);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnboundTargetError);
    const m = (err as Error).message;
    expect(m).toContain('bg/assetId');
    expect(m).toContain('construction prop');
    expect(m).toContain('animatable:false');
    expect(m).toContain('not an animatable target');
    expect(m).toContain('new Image('); // ImageNode reports its taxonomy name `Image`
    // NOT the generic wording
    expect(m).not.toContain('no property signal resolves to it');
  });

  it('fromTo-ing Text `fontFamily` (a construction prop) throws the specific message', () => {
    const scene = createScene({
      size: { w: 200, h: 100 },
      children: [new Text({ id: 'label', text: 'hi', fontFamily: 'serif' })],
    });
    const doc = timeline((tl) => tl.fromTo('label/fontFamily', 'serif', 'mono', { duration: 1 }));
    let err: unknown;
    try {
      bindScene(scene, doc);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnboundTargetError);
    const m = (err as Error).message;
    expect(m).toContain('label/fontFamily');
    expect(m).toContain('construction prop');
    expect(m).toContain('not an animatable target');
    expect(m).toContain('new Text(');
  });

  it('Video clip construction props (trimStart/at) also report the specific message', () => {
    const scene = createScene({
      size: { w: 200, h: 100 },
      children: [new Video({ id: 'clip', assetId: 'reel' })],
    });
    const doc = timeline({ tracks: [track('clip/trimStart', 'number', [key(0, 0), key(1, 1)])] });
    expect(() => bindScene(scene, doc)).toThrow(/construction prop/);
    expect(() => bindScene(scene, doc)).toThrow(/clip\/trimStart/);
  });

  it('a genuinely-unknown prop still throws the GENERIC UnboundTargetError', () => {
    const scene = createScene({
      size: { w: 200, h: 100 },
      children: [new Rect({ id: 'card', width: 40, height: 40 })],
    });
    const doc = timeline({ tracks: [track('card/bogus', 'number', [key(0, 0), key(1, 1)])] });
    let err: unknown;
    try {
      bindScene(scene, doc);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnboundTargetError);
    const m = (err as Error).message;
    expect(m).toContain('card/bogus');
    expect(m).toContain('no property signal resolves to it'); // generic wording
    expect(m).not.toContain('construction prop');
  });

  it('an unknown NODE ID (not just an unknown prop) stays generic', () => {
    const scene = createScene({
      size: { w: 200, h: 100 },
      children: [new Rect({ id: 'card', width: 40, height: 40 })],
    });
    const doc = timeline({ tracks: [track('ghost/assetId', 'number', [key(0, 0), key(1, 1)])] });
    let err: unknown;
    try {
      bindScene(scene, doc);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnboundTargetError);
    expect((err as Error).message).toContain('no property signal resolves to it');
  });

  // REGRESSION GUARD (pre.7, design-agent finding on the minified IIFE): the
  // construction-prop message keys on `node.describeType`. That MUST be a string
  // LITERAL per node — NOT the inherited `constructor.name`, which the minified
  // `@glissade/browser` bundle mangles, so the specific message silently fell
  // back to the generic one for every node but `Image` (its pre-existing
  // override). This locks the literal taxonomy name on every built-in node.
  // (Unminified, a missing override coincidentally returns the same class name,
  // so this can't reproduce the bundle bug itself — the design agent re-validates
  // on the real minified IIFE — but it pins the VALUES and documents the contract
  // so nobody "simplifies" the overrides back to `constructor.name`.)
  it('every built-in node pins describeType as its literal taxonomy name (IIFE-minification-safe)', () => {
    expect(new Group().describeType).toBe('Group');
    expect(new Rect().describeType).toBe('Rect');
    expect(new Circle().describeType).toBe('Circle');
    expect(new Path().describeType).toBe('Path');
    expect(new Text().describeType).toBe('Text');
    expect(new Video({ assetId: '~' }).describeType).toBe('Video');
    expect(new ImageNode({ assetId: '~' }).describeType).toBe('Image');
    expect(new Layout().describeType).toBe('Layout');
    // Stack/Row/Column are factories returning Layout — they inherit 'Layout',
    // so the bind guard names their construction props in the bundle too.
    expect(Stack().describeType).toBe('Layout');
  });
});

// 0.20.1 (browser-canary finding): node constructors used to SILENTLY DROP an
// unknown prop key — `new Rect({ size:[80,80] })` left width/height at 0 → an
// invisible node (the browser guide even shipped that example). The constructor
// guard makes it fail loud, mirroring the timeline builder's unknown-option
// guard. The completeness risk (rejecting a VALID construction-only prop) is the
// thing to nail — so this exercises the full accepted-key surface per node.
describe('node-constructor fail-loud guard (0.20.1)', () => {
  it('accepts EVERY valid construction key per node — zero false-positives (the allow-list completeness gate)', () => {
    // Each node constructed with its full Props-interface surface (base +
    // animatable + construction-only). None may throw.
    expect(
      () =>
        new Group({
          id: 'g',
          position: [0, 0],
          rotation: 0,
          scale: [1, 1],
          opacity: 1,
          blend: 'source-over',
          zIndex: 0,
          filters: [],
          anchor: 'center',
          cache: false,
          children: [],
        }),
    ).not.toThrow();
    expect(
      () =>
        new Rect({
          id: 'r',
          position: [0, 0],
          rotation: 0,
          scale: [1, 1],
          opacity: 1,
          blend: 'source-over',
          zIndex: 0,
          filters: [],
          anchor: 'center',
          cache: false,
          width: 10,
          height: 10,
          cornerRadius: 2,
          fill: '#fff',
          stroke: '#000',
          strokeWidth: 1,
          reveal: 1,
          sketch: { kind: 'marker' },
          sketchSeed: 1,
          sketchFill: { angleRad: 0, gap: 6 },
        }),
    ).not.toThrow();
    expect(() => new Circle({ radius: 5, fill: '#fff', stroke: '#000', strokeWidth: 1 })).not.toThrow();
    // The Path data/d alias: constructs with `data` (a PathValue), animates
    // target `d` — both must be accepted by the guard. (A bare SVG STRING is
    // separately rejected by Path — use pathFromSvg — so pass a PathValue here.)
    expect(() => new Path({ data: [], stroke: '#000', strokeWidth: 2 })).not.toThrow();
    expect(
      () =>
        new Text({
          text: 'hi',
          fill: '#000',
          fontFamily: 'serif',
          fontSize: 12,
          fontWeight: 700,
          fontStyle: 'italic',
          fontVariationSettings: '"wght" 600',
          align: 'center',
          width: 100,
          lineHeight: 1.4,
          reveal: 1,
          revealFraction: 0.5,
        }),
    ).not.toThrow();
    expect(() => new ImageNode({ assetId: 'a', width: 10, height: 10 })).not.toThrow();
    expect(
      () =>
        new Video({
          assetId: 'v',
          at: 0,
          trimStart: 0,
          playbackRate: 1,
          clipDuration: 2,
          sourceFps: 30,
          width: 10,
          height: 10,
        }),
    ).not.toThrow();
    expect(
      () =>
        new Layout({
          width: 100,
          height: 100,
          gap: 8,
          padding: 4,
          direction: 'row',
          justify: 'center',
          align: 'stretch',
          children: [],
        }),
    ).not.toThrow();
    // Stack/Row/Column factories validate as Layout (new Layout under the hood).
    expect(() => Stack({ gap: 8, padding: 4, align: 'start', children: [] })).not.toThrow();
  });

  it('throws NodeConstructionError naming the bad key + node type', () => {
    let err: unknown;
    try {
      new Rect({ width: 10, height: 10, size: [10, 10] } as unknown as ConstructorParameters<typeof Rect>[0]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(NodeConstructionError);
    const m = (err as Error).message;
    expect(m).toContain("'size'");
    expect(m).toContain('Rect');
    expect(m).toContain('Valid Rect props'); // lists the allow-list
  });

  it('the shipped footgun: new Rect({ size }) now throws instead of an invisible 0×0 box', () => {
    expect(() => new Rect({ size: [80, 80] } as unknown as ConstructorParameters<typeof Rect>[0])).toThrow(
      NodeConstructionError,
    );
  });

  it('names ALL unknown keys when several are passed', () => {
    let err: unknown;
    try {
      new Rect({ size: [1, 1], foo: 1 } as unknown as ConstructorParameters<typeof Rect>[0]);
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toContain("'size'");
    expect((err as Error).message).toContain("'foo'");
  });

  it('rejects a dotted target sub-path as a CONSTRUCTOR key, while the timeline still accepts it as a tween target', () => {
    // Two distinct namespaces: `position.x` is a tween target, NEVER a ctor key.
    expect(() => new Rect({ 'position.x': 5 } as unknown as ConstructorParameters<typeof Rect>[0])).toThrow(
      NodeConstructionError,
    );
    // ...the SAME path resolves fine as a timeline target.
    const scene = createScene({ size: { w: 100, h: 100 }, children: [new Rect({ id: 'r', width: 10, height: 10 })] });
    const doc = timeline({ tracks: [track('r/position.x', 'number', [key(0, 0), key(1, 5)])] });
    expect(() => bindScene(scene, doc)).not.toThrow();
  });

  it('does NOT validate user subclasses (the lenient extension seam — new.target guard)', () => {
    // A user subclass’s new.target is the subclass, not the built-in, so the
    // built-in’s checkProps never fires — external nodes can carry arbitrary props.
    class MyRect extends Rect {}
    expect(() => new MyRect({ totallyCustomProp: 1 } as unknown as ConstructorParameters<typeof Rect>[0])).not.toThrow();
  });
});

describe('measureWrappedText / scene.measureWrappedText (wrap-aware string measurement)', () => {
  const font = { family: 'X', size: 33 } as const;
  const long =
    'You have written the same request deleted it and rewritten it eleven times now ' +
    'somewhere you picked up the idea that there is a perfect prompt';

  it('wraps a long string to width → lines + a box height, node-free', () => {
    const scene = createScene({ size: { w: 800, h: 400 }, children: [] });
    const m = scene.measureWrappedText(long, font, 600);
    expect(m.lines.length).toBeGreaterThan(1); // wrapped
    expect(m.width).toBe(600); // the wrap width when wrapping
    expect(m.height).toBe(quantize(font.size * 1.25) * m.lines.length); // draw grid
    expect(m.lines.join(' ')).toContain('written'); // content preserved across the breaks
    expect(m.ascent).toBeGreaterThan(0);
    expect(m.descent).toBeGreaterThan(0);
  });

  it('width <= 0 = no wrap; explicit \\n still breaks', () => {
    const scene = createScene({ size: { w: 800, h: 400 }, children: [] });
    expect(scene.measureWrappedText('a b c d', font, 0).lines).toEqual(['a b c d']);
    expect(scene.measureWrappedText('a\nb', font, 0).lines).toEqual(['a', 'b']);
  });

  it('lineHeight scales the box height (1.25 default)', () => {
    const scene = createScene({ size: { w: 800, h: 400 }, children: [] });
    const single = scene.measureWrappedText('a\nb\nc', font, 0, 1).height;
    const dbl = scene.measureWrappedText('a\nb\nc', font, 0, 2).height;
    expect(dbl).toBe(single * 2);
  });

  it('matches Text.measuredSize for the same string/font/width/lineHeight (the node analogue)', () => {
    // the standalone fn must agree with the node path (both run breakLines + the same grid)
    const wrapped = measureWrappedText(long, font, 600, 1.4, estimatingMeasurer);
    const node = new Text({ text: long, fontFamily: font.family, fontSize: font.size, width: 600, lineHeight: 1.4 });
    const box = node.measuredSize(estimatingMeasurer);
    expect(wrapped.width).toBe(box.w);
    expect(wrapped.height).toBe(box.h);
  });

  it('FAILS LOUD on a missing/invalid font.size (the size-vs-fontSize footgun — height would be NaN→null)', () => {
    const scene = createScene({ size: { w: 800, h: 400 }, children: [] });
    // the FontSpec field is `size`; `fontSize` is the Text node prop — a silent NaN otherwise
    expect(() => scene.measureWrappedText('hi', { family: 'X', fontSize: 24 } as never, 200)).toThrow(
      /font\.size must be a positive number.*`size`, not `fontSize`/s,
    );
    expect(() => scene.measureWrappedText('hi', { family: 'X', size: 0 }, 200)).toThrow(/positive number/);
    expect(() => measureWrappedText('hi', { family: 'X', size: Number.NaN }, 200, 1.25, estimatingMeasurer)).toThrow(/positive number/);
  });
});
