/**
 * `describe()` — the machine-readable API manifest (0.18). These tests pin the
 * NO-DRIFT mechanism: each section is generated from the live registry it
 * documents, and a test fails the moment the manifest and the real API disagree.
 */
import { describe as vdescribe, expect, it } from 'vitest';
import { describe, type ApiManifest } from '../src/describe.js';
import { timeline, type TimelineBuilder } from '@glissade/core';
import { Group, Rect, Circle, Path, Text, ImageNode, Video } from '../src/nodes.js';
import { Layout, Stack, Row, Column } from '../src/layout.js';
import { createScene } from '../src/scene.js';
import { bindScene } from '../src/scene.js';
import { type Node } from '../src/node.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

vdescribe('describe() manifest', () => {
  const m: ApiManifest = describe();

  it('returns a populated, JSON-serializable manifest', () => {
    expect(typeof m.version).toBe('string');
    expect(Object.keys(m.nodes).length).toBeGreaterThan(0);
    expect(m.valueTypes.length).toBeGreaterThan(0);
    expect(m.easings.length).toBeGreaterThan(0);
    expect(m.builder.methods.length).toBeGreaterThan(0);
    expect(m.helpers.length).toBeGreaterThan(0);
    expect(Object.keys(m.subpaths).length).toBeGreaterThan(0);
    expect(typeof m.createScene).toBe('string');
    // round-trips through JSON unchanged (this IS what glissade.api.json commits)
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });

  it('lists every built-in node type (base index + the layout family)', () => {
    expect(Object.keys(m.nodes).sort()).toEqual([
      'Circle', 'Column', 'Group', 'Image', 'Layout', 'Path', 'Rect', 'Row', 'Stack', 'Text', 'Video',
    ]);
  });

  it('tags Rect.position as an animatable vec2 target with arity 2', () => {
    expect(m.nodes.Rect!.props.position).toEqual({
      type: 'vec2',
      animatable: true,
      target: '<id>/position',
      arity: 2,
    });
  });

  it('tags Rect.cornerRadius as an animatable number', () => {
    expect(m.nodes.Rect!.props.cornerRadius).toEqual({
      type: 'number',
      animatable: true,
      target: '<id>/cornerRadius',
      arity: 1,
    });
  });

  it('shows the polymorphic Shape fill as color|paint', () => {
    expect(m.nodes.Rect!.props.fill!.type).toBe('color|paint');
    expect(m.nodes.Circle!.props.fill!.type).toBe('color|paint');
    // Text fill is a plain color string (no gradients) — color only.
    expect(m.nodes.Text!.props.fill!.type).toBe('color');
  });

  it('exposes Text.reveal as an animatable number prop', () => {
    expect(m.nodes.Text!.props.reveal).toEqual({
      type: 'number',
      animatable: true,
      target: '<id>/reveal',
      arity: 1,
    });
  });

  it('inherits the base transform targets on every node', () => {
    for (const node of Object.values(m.nodes)) {
      expect(node.props.position!.type).toBe('vec2');
      expect(node.props.rotation!.type).toBe('number');
      expect(node.props.opacity!.type).toBe('number');
    }
  });

  it('lists valueTypes from the live registry (vec2/color/paint/path present)', () => {
    for (const id of ['number', 'vec2', 'color', 'paint', 'path', 'vec2-arc']) {
      expect(m.valueTypes).toContain(id);
    }
  });

  it('lists easings from the live registry (linear + a named ease present)', () => {
    expect(m.valueTypes).not.toContain('linear'); // sanity: not a value type
    expect(m.easings).toContain('linear');
    expect(m.easings).toContain('easeInOutCubic');
  });

  it('documents the tree-shakeable subpaths', () => {
    expect(m.subpaths['@glissade/scene/path']).toMatch(/pathFromSvg/);
    expect(m.subpaths['@glissade/scene/layout']).toMatch(/Layout/);
    expect(m.subpaths['@glissade/core/clips']).toMatch(/clip/i);
  });

  // NO-DRIFT pin: every method actually exposed on the runtime TimelineBuilder
  // must appear in describe().builder. Capture the live builder surface by
  // building a throwaway timeline and reading the object the callback receives.
  it('builder method list covers the live TimelineBuilder surface', () => {
    let captured: TimelineBuilder | undefined;
    timeline((tl) => {
      captured = tl;
    });
    const liveMethods = Object.keys(captured!)
      .filter((k) => typeof (captured as unknown as Record<string, unknown>)[k] === 'function')
      .sort();
    const documented = new Set(m.builder.methods.map((x) => x.name));
    for (const name of liveMethods) {
      expect(documented.has(name)).toBe(true);
    }
    // and every documented name is a real builder method (no phantom entries)
    const live = new Set(liveMethods);
    for (const x of m.builder.methods) {
      expect(live.has(x.name)).toBe(true);
    }
  });
});

// The 0.20 HELPERS section: scene can't import player/backend (those live above
// it in the dep graph), so the curated literal is structurally asserted here; the
// drift guard that IMPORTS+resolves each name lives in @glissade/browser's smoke
// test (it imports the whole IIFE surface, above scene).
vdescribe('describe() helpers section', () => {
  const m = describe();

  it('exposes a populated helpers array, JSON-round-tripping with name/summary/import/usage', () => {
    expect(Array.isArray(m.helpers)).toBe(true);
    expect(m.helpers.length).toBeGreaterThan(0);
    for (const h of m.helpers) {
      expect(typeof h.name, 'helper name').toBe('string');
      expect(h.name.length).toBeGreaterThan(0);
      expect(typeof h.summary, `${h.name} summary`).toBe('string');
      expect(h.summary.length).toBeGreaterThan(0);
      expect(typeof h.import, `${h.name} import`).toBe('string');
      expect(h.import.startsWith('@glissade/'), `${h.name} import is an npm subpath`).toBe(true);
      expect(typeof h.usage, `${h.name} usage`).toBe('string');
      expect(h.usage.length).toBeGreaterThan(0);
    }
    // the whole manifest (helpers included) round-trips through JSON unchanged
    expect(JSON.parse(JSON.stringify(m.helpers))).toEqual(m.helpers);
  });

  it('covers the documented helper/factory API (createPlayer/mount/motionPath/followPath/clip/clipList/renderToDataURL/snapshotCanvas/splitText)', () => {
    const names = new Set(m.helpers.map((h) => h.name));
    for (const expected of [
      'createPlayer',
      'mount',
      'motionPath',
      'followPath',
      'clip',
      'clipList',
      'renderToDataURL',
      'snapshotCanvas',
      'splitText',
    ]) {
      expect(names.has(expected), `helpers missing ${expected}`).toBe(true);
    }
  });

  it('names the right npm subpath per helper (matching docs/discovery.md)', () => {
    const byName = new Map(m.helpers.map((h) => [h.name, h]));
    expect(byName.get('createPlayer')!.import).toBe('@glissade/player');
    expect(byName.get('mount')!.import).toBe('@glissade/player');
    expect(byName.get('motionPath')!.import).toBe('@glissade/scene/motion');
    expect(byName.get('followPath')!.import).toBe('@glissade/scene/motion');
    expect(byName.get('clip')!.import).toBe('@glissade/core/clips');
    expect(byName.get('clipList')!.import).toBe('@glissade/core/clips');
    expect(byName.get('renderToDataURL')!.import).toBe('@glissade/backend-canvas2d/snapshot');
    expect(byName.get('snapshotCanvas')!.import).toBe('@glissade/backend-canvas2d/snapshot');
    expect(byName.get('splitText')!.import).toBe('@glissade/scene/type');
  });

  it('lists Grid + the Stack/Row/Column layout factories on their tree-shaken subpaths (0.20)', () => {
    const byName = new Map(m.helpers.map((h) => [h.name, h]));
    expect(byName.get('Grid'), 'Grid missing from helpers').toBeDefined();
    expect(byName.get('Grid')!.import).toBe('@glissade/scene/grid');
    for (const n of ['Stack', 'Row', 'Column']) {
      expect(byName.get(n), `${n} missing from helpers`).toBeDefined();
      expect(byName.get(n)!.import).toBe('@glissade/scene/layout');
    }
  });

  // 0.20.1 (browser-canary finding): the splitText usage string mis-described the
  // function — `): Node[]` (it returns an object) and `by?: 'word'|'char'` (the
  // real SplitBy is word|line|grapheme, and 'char' only "worked" via a silent
  // fallback). It also hid the `measurer` opt — the documented escape hatch from
  // the 0.19 estimating-measurer footgun. Pin the corrected signature.
  it('describes splitText accurately — object return shape, the real by enum, and the measurer opt (0.20.1)', () => {
    const usage = m.helpers.find((h) => h.name === 'splitText')!.usage;
    // returns an object, not Node[]
    expect(usage).toContain('{ node');
    expect(usage).not.toMatch(/\):\s*Node\[\]/);
    // the real granularities — word|line|grapheme, NOT the bogus 'char'
    expect(usage).toContain("'word'|'line'|'grapheme'");
    expect(usage).not.toContain("'char'");
    // the measurer escape-hatch is discoverable
    expect(usage).toContain('measurer');
    expect(usage).toContain('id');
  });
});

vdescribe('describe() docs-honesty', () => {
  const m = describe();

  /** Resolve a `'<id>/<prop>'` target to its prop entry in ANY node's manifest —
   * the prop part is node-type-agnostic (the same `position`/`opacity`/… targets
   * live on every node), so a docs target is honest iff some node declares it. */
  function propIsReal(prop: string): boolean {
    return Object.values(m.nodes).some((node) => prop in node.props);
  }

  it('every animatable target path used in docs/browser.md resolves in the manifest', () => {
    const md = readFileSync(join(here, '..', '..', '..', 'docs', 'browser.md'), 'utf8');
    // Pull quoted builder targets: '<word>/<prop.path>' from .to/.fromTo/.set/track.
    const targets = new Set<string>();
    for (const mt of md.matchAll(/['"]([a-zA-Z_][\w-]*)\/([a-zA-Z][\w.]*)['"]/g)) {
      // only treat it as a track target when it appears in a builder/track call
      const idx = mt.index ?? 0;
      const ctx = md.slice(Math.max(0, idx - 40), idx);
      if (/\b(?:to|fromTo|set|track|stagger)\s*\(\s*$/.test(ctx) || /\b(?:to|fromTo|set|track)\b/.test(ctx)) {
        targets.add(`${mt[1]}/${mt[2]}`);
      }
    }
    // browser.md uses at least box/position — assert we actually found targets.
    expect(targets.size).toBeGreaterThan(0);
    for (const t of targets) {
      const prop = t.slice(t.indexOf('/') + 1);
      expect(propIsReal(prop), `docs target '${t}' (prop '${prop}') not found in describe()`).toBe(true);
    }
  });
});

vdescribe('describe() construction props', () => {
  const m = describe();

  it('flags Image.assetId as a REQUIRED, non-animatable string with no target', () => {
    expect(m.nodes.Image!.props.assetId).toEqual({
      type: 'string',
      animatable: false,
      required: true,
    });
    expect(m.nodes.Image!.props.assetId!.target).toBeUndefined();
  });

  it('flags Video.assetId required and its clip props (at/trimStart/...) as construction-only', () => {
    expect(m.nodes.Video!.props.assetId).toEqual({ type: 'string', animatable: false, required: true });
    for (const p of ['at', 'trimStart', 'playbackRate', 'clipDuration', 'sourceFps']) {
      expect(m.nodes.Video!.props[p]!.animatable).toBe(false);
      expect(m.nodes.Video!.props[p]!.target).toBeUndefined();
    }
  });

  it('flags Text.fontVariationSettings as a construction-only string (0.20 variable-font axes)', () => {
    expect(m.nodes.Text!.props.fontVariationSettings).toEqual({ type: 'string', animatable: false });
    expect(m.nodes.Text!.props.fontVariationSettings!.target).toBeUndefined();
  });

  it('flags Text.letterSpacing as a construction-only number (0.21 tracking)', () => {
    expect(m.nodes.Text!.props.letterSpacing).toEqual({ type: 'number', animatable: false });
    expect(m.nodes.Text!.props.letterSpacing!.target).toBeUndefined();
  });

  it('exposes Text fontFamily/align/anchor as construction-only (animatable:false, no target)', () => {
    for (const p of ['fontFamily', 'align', 'anchor', 'fontWeight', 'fontStyle', 'lineHeight', 'fontVariationSettings', 'letterSpacing']) {
      const prop = m.nodes.Text!.props[p];
      expect(prop, `Text.${p} missing`).toBeDefined();
      expect(prop!.animatable, `Text.${p} must be construction-only`).toBe(false);
      expect(prop!.target, `Text.${p} must have no target`).toBeUndefined();
      expect(prop!.required).toBeUndefined();
    }
  });

  it('keeps the animatable Text props (text/fill/fontSize/width/reveal/position) as real targets', () => {
    for (const p of ['text', 'fill', 'fontSize', 'width', 'reveal', 'position', 'opacity']) {
      const prop = m.nodes.Text!.props[p];
      expect(prop!.animatable, `Text.${p} must stay animatable`).toBe(true);
      expect(prop!.target).toBe(`<id>/${p}`);
    }
  });

  it('gives every node the shared base construction props (id/blend/filters/anchor/cache)', () => {
    for (const [name, node] of Object.entries(m.nodes)) {
      for (const p of ['id', 'blend', 'filters', 'anchor', 'cache']) {
        expect(node.props[p], `${name}.${p} missing`).toBeDefined();
        expect(node.props[p]!.animatable, `${name}.${p} construction-only`).toBe(false);
        expect(node.props[p]!.target).toBeUndefined();
      }
    }
  });

  // DRIFT GUARD: construct each node using EXACTLY the manifest's construction
  // props — the constructor must accept them — and assert no construction prop
  // name collides with an animatable target name.
  it('each node constructs from exactly its manifest construction props (no drift, no collision)', () => {
    const ctorArgFor: { [name: string]: (props: Record<string, unknown>) => Node } = {
      Group: (p) => new Group(p),
      Rect: (p) => new Rect(p),
      Circle: (p) => new Circle(p),
      Path: (p) => new Path(p),
      Text: (p) => new Text(p),
      Image: (p) => new ImageNode(p as { assetId: string }),
      Video: (p) => new Video(p as { assetId: string }),
      Layout: (p) => new Layout(p),
      Stack: (p) => Stack(p),
      Row: (p) => Row(p),
      Column: (p) => Column(p),
    };
    // a concrete value of the right shape for each construction prop type
    const sample: { [type: string]: unknown } = {
      'string': 'x',
      'number': 1,
      'boolean': true,
      'Node[]': [],
      'BlendMode': 'source-over',
      'FilterSpec[]': [],
      'AnchorSpec': 'center',
      'SketchStyle': { kind: 'pencil' },
      'HachureSpec': { gap: 4 },
      "'normal'|'italic'": 'normal',
      "'left'|'center'|'right'": 'center',
      "'row'|'column'": 'row',
      "'start'|'center'|'end'|'space-between'|'space-around'": 'start',
      "'start'|'center'|'end'|'stretch'": 'start',
    };
    for (const [name, node] of Object.entries(m.nodes)) {
      const animatable = new Set(Object.entries(node.props).filter(([, p]) => p.animatable).map(([k]) => k));
      const props: Record<string, unknown> = {};
      for (const [prop, spec] of Object.entries(node.props)) {
        if (spec.animatable) continue;
        // a construction prop must NOT also be an animatable target name
        expect(animatable.has(prop), `${name}.${prop} is both construction and animatable`).toBe(false);
        expect(spec.type in sample, `no sample for ${name}.${prop} type '${spec.type}'`).toBe(true);
        props[prop] = sample[spec.type];
      }
      // 'anchor' on a Group/Layout warns + is ignored, but must still be accepted
      expect(() => ctorArgFor[name]!(props), `${name} must construct from its construction props`).not.toThrow();
    }
  });
});

vdescribe('describe() layout nodes', () => {
  const m = describe();

  it('lists Layout/Stack/Row/Column in .nodes on the @glissade/scene/layout subpath', () => {
    for (const name of ['Layout', 'Stack', 'Row', 'Column']) {
      const node = m.nodes[name];
      expect(node, `${name} missing from .nodes`).toBeDefined();
      expect(node!.subpath).toBe('@glissade/scene/layout');
    }
  });

  it('exposes layout width/height/gap/padding as animatable, direction/justify/align as construction', () => {
    const L = m.nodes.Layout!;
    for (const p of ['width', 'height', 'gap', 'padding']) {
      expect(L.props[p]!.animatable, `${p} animatable`).toBe(true);
      expect(L.props[p]!.target).toBe(`<id>/${p}`);
    }
    for (const p of ['direction', 'justify', 'align', 'children']) {
      expect(L.props[p]!.animatable, `${p} construction`).toBe(false);
      expect(L.props[p]!.target).toBeUndefined();
    }
  });

  // DRIFT GUARD vs the real Layout: the curated animatable set must equal the
  // real node's listTargets() (minus base transform targets), and the curated
  // schema must not invent props the constructor rejects (covered above).
  it("matches the real Layout node's registered targets", () => {
    const real = new Layout();
    const realTargets = new Set(real.listTargets().map((t) => t.path));
    // every curated animatable Layout prop is a real registered target
    for (const [prop, spec] of Object.entries(m.nodes.Layout!.props)) {
      if (spec.animatable) expect(realTargets.has(prop), `Layout.${prop} not a real target`).toBe(true);
    }
    // and the layout-specific targets (width/height/gap/padding) are all surfaced
    for (const p of ['width', 'height', 'gap', 'padding']) {
      expect(m.nodes.Layout!.props[p]!.animatable).toBe(true);
    }
  });
});

vdescribe('describe() createScene surfaces the assets manifest', () => {
  const m = describe();
  it('documents the timeline.assets shape (kind image|video, url)', () => {
    expect(m.createScene).toMatch(/assets/);
    expect(m.createScene).toMatch(/image/);
    expect(m.createScene).toMatch(/video/);
    expect(m.createScene).toMatch(/url/);
    expect(m.createScene).toMatch(/assetId/);
  });
});

vdescribe('describe() stagger signature shows the non-uniform each', () => {
  const m = describe();
  it('documents each as number | ((rank, count) => number)', () => {
    const stagger = m.builder.methods.find((x) => x.name === 'stagger');
    expect(stagger).toBeDefined();
    expect(stagger!.signature).toMatch(/each:\s*number\s*\|\s*\(\(rank,\s*count\)\s*=>\s*number\)/);
  });
});

// THE NEGATIVE-SPACE GUARD: a construction-only prop is NOT a real animatable
// target — binding a track to it is REJECTED by the bind guard. This catches an
// accidentally-animatable construction prop (e.g. an `assetId` that slipped into
// registerTarget).
vdescribe('describe() negative space: construction props are not bindable', () => {
  const m = describe();

  /** Does binding a track on `<id>/<prop>` throw (target not registered)? */
  function bindingRejected(node: Node, prop: string): boolean {
    const scene = createScene({ size: { w: 10, h: 10 }, children: [node] });
    const doc = timeline({
      tracks: [
        {
          target: `n/${prop}`,
          type: 'string',
          keys: [
            { t: 0, value: 'a' },
            { t: 1, value: 'b' },
          ],
        } as never,
      ],
    });
    try {
      bindScene(scene, doc);
      return false;
    } catch {
      return true;
    }
  }

  it("rejects binding a track on Image 'assetId' (construction-only)", () => {
    expect(m.nodes.Image!.props.assetId!.target).toBeUndefined();
    expect(bindingRejected(new ImageNode({ id: 'n', assetId: 'a' }), 'assetId')).toBe(true);
  });

  it("rejects binding a track on Text 'fontFamily' (construction-only)", () => {
    expect(m.nodes.Text!.props.fontFamily!.target).toBeUndefined();
    expect(bindingRejected(new Text({ id: 'n', fontFamily: 'serif' }), 'fontFamily')).toBe(true);
  });

  it("rejects binding a track on Text 'fontVariationSettings' with the construction-prop-SPECIFIC message", () => {
    expect(m.nodes.Text!.props.fontVariationSettings!.target).toBeUndefined();
    const node = new Text({ id: 'n', fontVariationSettings: "'wght' 700" });
    const scene = createScene({ size: { w: 10, h: 10 }, children: [node] });
    const doc = timeline({
      tracks: [
        {
          target: 'n/fontVariationSettings',
          type: 'string',
          keys: [
            { t: 0, value: "'wght' 100" },
            { t: 1, value: "'wght' 900" },
          ],
        } as never,
      ],
    });
    // The bind guard recognizes it as a construction prop and throws the SPECIFIC
    // message ("...is a construction prop... set it at construction"), NOT the
    // generic UnboundTargetError.
    expect(() => bindScene(scene, doc)).toThrow(/construction prop/);
    expect(() => bindScene(scene, doc)).toThrow(/set it at construction/);
  });

  it('confirms every construction-only prop in the manifest has no target', () => {
    for (const [name, node] of Object.entries(m.nodes)) {
      for (const [prop, spec] of Object.entries(node.props)) {
        if (!spec.animatable) {
          expect(spec.target, `${name}.${prop} is construction-only but carries a target`).toBeUndefined();
        }
      }
    }
  });
});
