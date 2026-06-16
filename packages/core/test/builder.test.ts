import { describe, expect, it } from 'vitest';
import {
  compileTimeline,
  getTimelineCallbacks,
  key,
  sampleTrack,
  signal,
  spring,
  timeline,
  track,
  PositionError,
  TimelineValidationError,
  TARGET_PATH,
  UnresolvableTargetError,
  type Vec2,
} from '../src/index.js';

/** Bare signals posing as node props, the way scene wires them (§2.6). */
function prop<T>(path: string, initial: T) {
  const s = signal(initial);
  (s as unknown as Record<symbol, string>)[TARGET_PATH] = path;
  return s;
}

describe('builder ≡ raw document (the §2.6 demo, both surfaces)', () => {
  const raw = () =>
    timeline({
      tracks: [
        track('circle/opacity', 'number', [
          key(0, 0),
          key(1, 1, 'easeInOutCubic'),
          key(2, 1, { interp: 'hold' }),
          key(2.5, 0, 'easeOutQuad'),
        ]),
        track('circle/position.x', 'number', [key(1, 0), key(2, 300, 'easeInOutCubic')]),
        track('circle/scale', 'vec2', [key<Vec2>(1, [1, 1]), key<Vec2>(2, [2, 2], 'easeInOutCubic')]),
      ],
      labels: { settled: 2 },
    });

  const built = () => {
    const opacity = prop('circle/opacity', 0);
    const x = prop('circle/position.x', 0);
    const scale = prop<Vec2>('circle/scale', [1, 1]);
    return timeline((tl) => {
      tl.to(opacity, 1, { duration: 1, ease: 'easeInOutCubic' })
        .to(x, 300, { duration: 1 })
        .to(scale, [2, 2], { duration: 1, at: '<' })
        .label('settled')
        .to(opacity, 0, { duration: 0.5, ease: 'easeOutQuad', at: 'settled' });
    });
  };

  it('samples identically across the full duration', () => {
    const a = compileTimeline(raw());
    const b = compileTimeline(built());
    expect(b.duration).toBe(a.duration);
    expect([...b.tracks.keys()].sort()).toEqual([...a.tracks.keys()].sort());
    for (const target of a.tracks.keys()) {
      for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * 2.5;
        expect(sampleTrack(b.tracks.get(target)!, t), `${target} @ ${t}`).toEqual(
          sampleTrack(a.tracks.get(target)!, t),
        );
      }
    }
  });

  it('labels carry through', () => {
    expect(compileTimeline(built()).labels['settled']).toBe(2);
  });

  it('implicit from-keys are marked derived', () => {
    const doc = built();
    const opacity = doc.tracks.find((t) => t.target === 'circle/opacity')!;
    expect(opacity.keys[0]).toMatchObject({ t: 0, value: 0, derived: true });
  });
});

describe('position grammar', () => {
  const make = (at: string | number | undefined, second = 1) => {
    const a = prop('n/a', 0);
    const b = prop('n/b', 0);
    return compileTimeline(
      timeline((tl) => {
        tl.to(a, 1, { duration: 2 }).to(b, second, { duration: 1, ...(at !== undefined ? { at } : {}) });
      }),
    );
  };
  const startOf = (doc: ReturnType<typeof make>, target: string) =>
    doc.tracks.get(target)!.keys[0]!.t;

  it("default: after previous end; '<' aligns with previous start; '>' with end", () => {
    expect(startOf(make(undefined), 'n/b')).toBe(2);
    expect(startOf(make('<'), 'n/b')).toBe(0);
    expect(startOf(make('>'), 'n/b')).toBe(2);
  });

  it("'+=x' / '-=x' offset from previous end; absolute numbers pass through", () => {
    expect(startOf(make('+=0.5'), 'n/b')).toBe(2.5);
    expect(startOf(make('-=0.5'), 'n/b')).toBe(1.5);
    expect(startOf(make(0.25), 'n/b')).toBe(0.25);
  });

  it("'label+=x' offsets from a label; unknown labels throw", () => {
    const a = prop('n/a', 0);
    const b = prop('n/b', 0);
    const doc = compileTimeline(
      timeline((tl) => {
        tl.to(a, 1, { duration: 1 }).label('mid').to(b, 1, { duration: 1, at: 'mid+=0.5' });
      }),
    );
    expect(doc.tracks.get('n/b')!.keys[0]!.t).toBe(1.5);
    expect(() =>
      timeline((tl) => {
        tl.to(prop('n/c', 0), 1, { at: 'ghost' });
      }),
    ).toThrow(PositionError);
  });
});

describe('builder semantics', () => {
  it('fromTo emits an explicit (non-derived) from-key', () => {
    const a = prop('n/a', 5);
    const doc = timeline((tl) => {
      tl.fromTo(a, 100, 200, { duration: 1 });
    });
    const tr = doc.tracks[0]!;
    expect(tr.keys[0]).toMatchObject({ t: 0, value: 100 });
    expect(tr.keys[0]!.derived).toBeUndefined();
  });

  it('set() compiles to a hold key', () => {
    const a = prop('n/a', 0);
    const doc = timeline((tl) => {
      tl.to(a, 1, { duration: 1 }).set(a, 99, { at: '+=0.5' });
    });
    const compiled = compileTimeline(doc);
    const tr = compiled.tracks.get('n/a')!;
    expect(sampleTrack(tr, 1.25)).toBe(1); // held until the set's t
    expect(sampleTrack(tr, 1.5)).toBe(99);
  });

  it('a spring ease infers its duration; passing one too throws (§2.7)', () => {
    const cfg = { stiffness: 170, damping: 26, mass: 1 };
    const a = prop('n/a', 0);
    const doc = timeline((tl) => {
      tl.to(a, 300, { ease: spring(cfg) });
    });
    const lastKey = doc.tracks[0]!.keys.at(-1)!;
    expect(lastKey.t).toBeCloseTo(spring.duration(cfg), 9);
    expect(() => compileTimeline(doc)).not.toThrow(); // satisfies the spring key-t rule
    expect(() =>
      timeline((tl) => {
        tl.to(prop('n/b', 0), 1, { duration: 2, ease: spring(cfg) });
      }),
    ).toThrow(TimelineValidationError);
  });

  it('chained tweens on one target need no derived key between them', () => {
    const a = prop('n/a', 0);
    const doc = timeline((tl) => {
      tl.to(a, 10, { duration: 1 }).to(a, 20, { duration: 1 });
    });
    expect(doc.tracks[0]!.keys.map((k) => k.t)).toEqual([0, 1, 2]);
  });

  it('.add() nests children and advances the cursor by child duration', () => {
    const childDoc = timeline({ tracks: [track('c/x', 'number', [key(0, 0), key(2, 1)])] });
    const b = prop('n/b', 0);
    const doc = timeline((tl) => {
      tl.add(childDoc, 1).to(b, 1, { duration: 1 }); // starts at 1 + 2 = 3
    });
    const compiled = compileTimeline(doc);
    expect(compiled.tracks.get('c/x')!.keys.map((k) => k.t)).toEqual([1, 3]);
    expect(compiled.tracks.get('n/b')!.keys[0]!.t).toBe(3);
  });

  it('.call() compiles to a marker with a Player-side callback, never serialized', () => {
    const cb = () => {};
    const doc = timeline((tl) => {
      tl.to(prop('n/a', 0), 1, { duration: 1 }).call(cb);
    });
    expect(doc.markers).toHaveLength(1);
    expect(doc.markers![0]!.t).toBe(1);
    expect(getTimelineCallbacks(doc).get(doc.markers![0]!.name)).toBe(cb);
    expect(JSON.stringify(doc)).not.toContain('function');
  });

  it('.editable() marks the preceding track', () => {
    const doc = timeline((tl) => {
      tl.to(prop('n/a', 0), 1, { duration: 1 }).editable();
    });
    expect(doc.tracks[0]!.editable).toBe(true);
  });

  it('build-time control flow is plain TypeScript', () => {
    const a = prop('n/a', 0);
    const doc = timeline((tl) => {
      for (let i = 0; i < 3; i++) tl.to(a, i + 1, { duration: 1 });
      if (false as boolean) tl.to(a, 99, { duration: 1 });
    });
    expect(doc.tracks[0]!.keys.map((k) => k.value)).toEqual([0, 1, 2, 3]);
  });

  it('string targets work; unaddressable signals throw', () => {
    const doc = timeline((tl) => {
      tl.to('node/prop', 5, { duration: 1 });
    });
    expect(doc.tracks[0]!.target).toBe('node/prop');
    expect(() =>
      timeline((tl) => {
        tl.to(signal(0), 1, { duration: 1 });
      }),
    ).toThrow(UnresolvableTargetError);
  });

  it('infers value types: number, vec2, color, string', () => {
    const doc = timeline((tl) => {
      tl.to('n/a', 5)
        .to('n/b', [1, 2] as Vec2)
        .to('n/c', '#ff0000')
        .to('n/d', 'hello');
    });
    const types = Object.fromEntries(doc.tracks.map((t) => [t.target, t.type]));
    expect(types).toEqual({ 'n/a': 'number', 'n/b': 'vec2', 'n/c': 'color', 'n/d': 'string' });
  });
});

describe('string-target from-values (dogfooding fixes)', () => {
  it('to() accepts an explicit from', () => {
    const doc = timeline((tl) => {
      tl.to('n/x', 100, { duration: 1, from: 0 });
    });
    expect(doc.tracks[0]!.keys[0]).toMatchObject({ t: 0, value: 0 });
    const compiled = compileTimeline(doc);
    expect(sampleTrack(compiled.tracks.get('n/x')!, 0)).toBe(0);
  });

  it('warns when the first tween on a string target is unanchorable', async () => {
    const { setDevWarning } = await import('../src/index.js');
    const warnings: string[] = [];
    setDevWarning((m) => warnings.push(m));
    timeline((tl) => {
      tl.to('n/y', 100, { duration: 1 });
    });
    setDevWarning(() => {});
    expect(warnings.some((w) => w.includes("'n/y'") && w.includes('from'))).toBe(true);
  });
});

describe('cue / adBreak markers (§ad-break)', () => {
  it('emit serialized markers; adBreak carries data.kind', () => {
    const doc = compileTimeline(
      timeline((tl) => {
        tl.to('a/x', 1, { duration: 2 })
          .cue(0.5, 'chapter-1', { kind: 'chapter' })
          .adBreak(1, { id: 'midroll', duration: 30 });
      }),
    );
    const cue = doc.markers.find((m) => m.name === 'chapter-1')!;
    expect(cue.t).toBe(0.5);
    expect((cue.data as { kind: string }).kind).toBe('chapter');
    const ad = doc.markers.find((m) => m.name === 'midroll')!;
    expect(ad.t).toBe(1);
    expect(ad.data).toEqual({ kind: 'ad-break', duration: 30 });
  });

  it("a plain cue() defaults data.kind to 'cue' (so it serializes), preserving extra data", () => {
    const doc = compileTimeline(
      timeline((tl) => {
        tl.to('a/x', 1, { duration: 2 })
          .cue(0.5, 'plain')
          .cue(1, 'titled', { title: 'Act One' });
      }),
    );
    expect(doc.markers.find((m) => m.name === 'plain')!.data).toEqual({ kind: 'cue' });
    expect(doc.markers.find((m) => m.name === 'titled')!.data).toEqual({ kind: 'cue', title: 'Act One' });
  });
});
