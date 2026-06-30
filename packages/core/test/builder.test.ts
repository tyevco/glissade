import { describe, expect, it } from 'vitest';
import {
  compileTimeline,
  getTimelineCallbacks,
  isDurationEditable,
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

describe("nD76: structural / un-id'd targets are not editable hosts (§6.4/§6.5)", () => {
  it('rejects a structural ~Type.ordinal string target at track creation', () => {
    expect(() =>
      timeline((tl) => {
        tl.to('~Group.0/x', 1, { duration: 1 });
      }),
    ).toThrow(/structural ids.*inspection-only/s);
  });

  it('.editable() on a target without an explicit node id throws a helpful error', () => {
    expect(() =>
      timeline((tl) => {
        tl.to('/opacity', 1, { duration: 1 }).editable();
      }),
    ).toThrow(/explicit id/);
  });

  it('an anonymous-node property signal is still rejected (existing UnresolvableTargetError)', () => {
    expect(() =>
      timeline((tl) => {
        tl.to(signal(0), 1, { duration: 1 });
      }),
    ).toThrow(UnresolvableTargetError);
  });

  it('a valid explicit-id target + .editable() works', () => {
    const doc = timeline((tl) => {
      tl.to('box/opacity', 1, { duration: 1 }).editable();
    });
    expect(doc.tracks[0]!.editable).toBe(true);
  });
});

describe('editableDuration() / isDurationEditable() (§6.2 rule 4)', () => {
  it('the duration is code-owned (not editable) by default', () => {
    const doc = timeline((tl) => tl.to('a/x', 1, { duration: 1 }));
    expect(doc.editableDuration).toBeUndefined();
    expect(isDurationEditable(doc)).toBe(false);
  });

  it('editableDuration() opts the duration into studio editing — order-independent', () => {
    const doc = timeline((tl) => tl.editableDuration().to('a/x', 1, { duration: 1 }));
    expect(doc.editableDuration).toBe(true);
    expect(isDurationEditable(doc)).toBe(true);

    const after = timeline((tl) => tl.to('a/x', 1, { duration: 1 }).editableDuration());
    expect(isDurationEditable(after)).toBe(true);
  });

  it('round-trips through the raw timeline init and JSON', () => {
    const raw = timeline({ tracks: [track('a/x', 'number', [key(0, 0)])], editableDuration: true });
    expect(isDurationEditable(raw)).toBe(true);
    expect(isDurationEditable(JSON.parse(JSON.stringify(raw)) as typeof raw)).toBe(true);
  });
});

describe('tl.stagger — pure build-time sugar over to()/fromTo()', () => {
  /** Start time of a target's first emitted key. */
  const startOf = (doc: ReturnType<typeof compileTimeline>, target: string) =>
    doc.tracks.get(target)!.keys[0]!.t;

  it('keys are byte-identical to N hand-authored offset tweens', () => {
    const sa = prop('a/opacity', 0);
    const sb = prop('b/opacity', 0);
    const sc = prop('c/opacity', 0);
    const staggered = timeline((tl) => {
      tl.stagger([sa, sb, sc], { to: 1 }, { each: 0.1 });
    });

    const ha = prop('a/opacity', 0);
    const hb = prop('b/opacity', 0);
    const hc = prop('c/opacity', 0);
    const hand = timeline((tl) => {
      tl.to(ha, 1, { at: 0 }).to(hb, 1, { at: 0.1 }).to(hc, 1, { at: 0.2 });
    });

    // key-for-key equality — the acceptance contract
    expect(staggered.tracks).toEqual(hand.tracks);
  });

  it('anchor: start ranks i — earliest target at base', () => {
    const doc = compileTimeline(
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: 1 }, { each: 0.1, anchor: 'start' });
      }),
    );
    expect(startOf(doc, 'a/x')).toBeCloseTo(0);
    expect(startOf(doc, 'b/x')).toBeCloseTo(0.1);
    expect(startOf(doc, 'c/x')).toBeCloseTo(0.2);
  });

  it('anchor: end ranks (n-1)-i', () => {
    const doc = compileTimeline(
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: 1 }, { each: 0.1, anchor: 'end' });
      }),
    );
    expect(startOf(doc, 'a/x')).toBeCloseTo(0.2);
    expect(startOf(doc, 'b/x')).toBeCloseTo(0.1);
    expect(startOf(doc, 'c/x')).toBeCloseTo(0);
  });

  it('anchor: center ranks round(|i-c|) — middle first, tie at even n', () => {
    // odd n=5, c=2 → ranks 2,1,0,1,2
    const odd = compileTimeline(
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x', 'c/x', 'd/x', 'e/x'], { from: 0, to: 1 }, { each: 0.1, anchor: 'center' });
      }),
    );
    expect([startOf(odd, 'a/x'), startOf(odd, 'b/x'), startOf(odd, 'c/x'), startOf(odd, 'd/x'), startOf(odd, 'e/x')]).toEqual(
      [0.2, 0.1, 0, 0.1, 0.2].map((v) => expect.closeTo(v)),
    );
    // even n=4, c=1.5 → round(|i-1.5|) = 2,1,1,2 — two rank-1 middles (no rank-0)
    const even = compileTimeline(
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x', 'c/x', 'd/x'], { from: 0, to: 1 }, { each: 0.1, anchor: 'center' });
      }),
    );
    expect([startOf(even, 'a/x'), startOf(even, 'b/x'), startOf(even, 'c/x'), startOf(even, 'd/x')]).toEqual(
      [0.2, 0.1, 0.1, 0.2].map((v) => expect.closeTo(v)),
    );
  });

  it('anchor: edges ranks round(c-|i-c|) — ends first', () => {
    // odd n=5, c=2 → 0,1,2,1,0
    const doc = compileTimeline(
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x', 'c/x', 'd/x', 'e/x'], { from: 0, to: 1 }, { each: 0.1, anchor: 'edges' });
      }),
    );
    expect([startOf(doc, 'a/x'), startOf(doc, 'b/x'), startOf(doc, 'c/x'), startOf(doc, 'd/x'), startOf(doc, 'e/x')]).toEqual(
      [0, 0.1, 0.2, 0.1, 0].map((v) => expect.closeTo(v)),
    );
  });

  it('anchor: numeric origin ranks round(|i-k|)', () => {
    const doc = compileTimeline(
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x', 'c/x', 'd/x'], { from: 0, to: 1 }, { each: 0.1, anchor: 1 });
      }),
    );
    // |i-1| = 1,0,1,2
    expect([startOf(doc, 'a/x'), startOf(doc, 'b/x'), startOf(doc, 'c/x'), startOf(doc, 'd/x')]).toEqual(
      [0.1, 0, 0.1, 0.2].map((v) => expect.closeTo(v)),
    );
  });

  it('spec.from routes each target through fromTo (explicitFrom set)', () => {
    const sa = prop('a/opacity', 0.5);
    const sb = prop('b/opacity', 0.5);
    const staggered = timeline((tl) => {
      tl.stagger([sa, sb], { from: 0, to: 1 }, { each: 0.1 });
    });
    const ha = prop('a/opacity', 0.5);
    const hb = prop('b/opacity', 0.5);
    const hand = timeline((tl) => {
      tl.fromTo(ha, 0, 1, { at: 0 }).fromTo(hb, 0, 1, { at: 0.1 });
    });
    expect(staggered.tracks).toEqual(hand.tracks);
    // the from-key is explicit (not derived)
    const a = staggered.tracks.find((t) => t.target === 'a/opacity')!;
    expect(a.keys[0]).toMatchObject({ t: 0, value: 0 });
    expect(a.keys[0]).not.toHaveProperty('derived');
  });

  it('group reads as ONE block to a following < / += step', () => {
    // 3 targets, each 0.1, duration 1 → base 0, delays 0/0.1/0.2, group end = 0.2 + 1 = 1.2
    const next = prop('z/x', 0);
    const doc = compileTimeline(
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: 1, duration: 1 }, { each: 0.1 }).to(next, 1, {
          duration: 1,
          at: '<',
        });
      }),
    );
    // '<' aligns with the group's base (0), not the last target's start (0.2)
    expect(startOf(doc, 'z/x')).toBeCloseTo(0);
  });

  it("'+=' resolves against the group's end (base + maxDelay + duration)", () => {
    const next = prop('z/x', 0);
    const doc = compileTimeline(
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: 1, duration: 1 }, { each: 0.1 }).to(next, 1, {
          duration: 1,
          at: '+=0.5',
        });
      }),
    );
    // group end = 0.2 + 1 = 1.2; +=0.5 → 1.7
    expect(startOf(doc, 'z/x')).toBeCloseTo(1.7);
  });

  it('opts.at places the group base (label and +=x)', () => {
    const doc = compileTimeline(
      timeline((tl) => {
        tl.to('seed/x', 1, { duration: 1 })
          .label('mark')
          .stagger(['a/x', 'b/x'], { from: 0, to: 1, duration: 1 }, { each: 0.1, at: 'mark+=0.5' });
      }),
    );
    // mark = 1, +=0.5 → base 1.5; delays 0/0.1
    expect(startOf(doc, 'a/x')).toBeCloseTo(1.5);
    expect(startOf(doc, 'b/x')).toBeCloseTo(1.6);

    const rel = compileTimeline(
      timeline((tl) => {
        tl.to('seed/x', 1, { duration: 1 }).stagger(['a/x', 'b/x'], { from: 0, to: 1, duration: 1 }, { each: 0.1, at: '+=0.5' });
      }),
    );
    // seed end = 1; +=0.5 → base 1.5
    expect(startOf(rel, 'a/x')).toBeCloseTo(1.5);
    expect(startOf(rel, 'b/x')).toBeCloseTo(1.6);
  });

  it('default base = chain end (prevEnd)', () => {
    const doc = compileTimeline(
      timeline((tl) => {
        tl.to('seed/x', 1, { duration: 2 }).stagger(['a/x', 'b/x'], { from: 0, to: 1 }, { each: 0.1 });
      }),
    );
    expect(startOf(doc, 'a/x')).toBeCloseTo(2);
    expect(startOf(doc, 'b/x')).toBeCloseTo(2.1);
  });

  it('non-uniform each as a fn ≡ the hand-authored accelerating cascade (byte-identical)', () => {
    // d_i = each(rank_i, n); anchor 'start' → rank_i = i; accel curve r*r*0.05
    const accel = (r: number) => r * r * 0.05;
    const sa = prop('a/opacity', 0);
    const sb = prop('b/opacity', 0);
    const sc = prop('c/opacity', 0);
    const sd = prop('d/opacity', 0);
    const staggered = timeline((tl) => {
      tl.stagger([sa, sb, sc, sd], { to: 1 }, { each: accel });
    });

    const ha = prop('a/opacity', 0);
    const hb = prop('b/opacity', 0);
    const hc = prop('c/opacity', 0);
    const hd = prop('d/opacity', 0);
    const hand = timeline((tl) => {
      tl.to(ha, 1, { at: accel(0) }) // 0
        .to(hb, 1, { at: accel(1) }) // 0.05
        .to(hc, 1, { at: accel(2) }) // 0.2
        .to(hd, 1, { at: accel(3) }); // 0.45
    });

    // key-for-key equality — the deep-equal contract, now for the fn form
    expect(staggered.tracks).toEqual(hand.tracks);
  });

  it('non-uniform each receives (rank, count) — count is the group size', () => {
    const seen: Array<[number, number]> = [];
    timeline((tl) => {
      tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: 1 }, {
        each: (rank, count) => {
          seen.push([rank, count]);
          return rank * 0.1;
        },
        anchor: 'end',
      });
    });
    // anchor 'end' → ranks (n-1)-i = 2,1,0; count is always 3
    expect(seen).toEqual([
      [2, 3],
      [1, 3],
      [0, 3],
    ]);
  });

  it('spring-ease stagger: a following > step anchors at the TRUE group end', () => {
    const cfg = { stiffness: 170, damping: 26, mass: 1 };
    const next = prop('z/x', 0);
    const doc = compileTimeline(
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: 1, ease: spring(cfg) }, { each: 0.1 }).to(next, 1, {
          duration: 1,
          at: '>',
        });
      }),
    );
    // base 0, maxDelay 0.2, effDur = spring.duration(cfg) → group end at 0.2 + dur
    expect(startOf(doc, 'z/x')).toBeCloseTo(0.2 + spring.duration(cfg));
  });

  it('an empty stagger is a true no-op — a following step is unmoved', () => {
    const next = prop('z/x', 0);
    const doc = compileTimeline(
      timeline((tl) => {
        tl.to('seed/x', 1, { duration: 2 })
          .stagger([], { from: 0, to: 1, duration: 1 }, { each: 0.1 })
          .to(next, 1, { duration: 1, at: '>' });
      }),
    );
    // the empty stagger must not advance the cursor: '>' still sits at seed end (2)
    expect(startOf(doc, 'z/x')).toBeCloseTo(2);
  });

  it('negative / non-monotonic each reports its true min/max bounds to the cursor', () => {
    // anchor 'center' on n=3, c=1 → ranks 1,0,1; each negative → delays -0.1,0,-0.1
    // so the spread runs BACKWARD from base; min/max must reflect that
    const startNext = prop('s/x', 0);
    const endNext = prop('e/x', 0);
    const startDoc = compileTimeline(
      timeline((tl) => {
        tl.to('seed/x', 1, { duration: 5 })
          .stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: 1, duration: 1 }, { each: -0.1, anchor: 'center' })
          .to(startNext, 1, { duration: 1, at: '<' });
      }),
    );
    // base = 5; minDelay = -0.1 → prevStart = 4.9
    expect(startOf(startDoc, 's/x')).toBeCloseTo(4.9);

    const endDoc = compileTimeline(
      timeline((tl) => {
        tl.to('seed/x', 1, { duration: 5 })
          .stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: 1, duration: 1 }, { each: -0.1, anchor: 'center' })
          .to(endNext, 1, { duration: 1, at: '>' });
      }),
    );
    // base = 5; maxDelay = 0 (rank-0 middle) → prevEnd = 5 + 0 + 1 = 6
    expect(startOf(endDoc, 'e/x')).toBeCloseTo(6);
  });

  it('a stagger that would place a key at t<0 throws', () => {
    expect(() =>
      timeline((tl) => {
        // base 0, anchor 'center' n=3 ranks 1,0,1, each -0.5 → d = -0.5 < 0
        tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: 1, duration: 1 }, { each: -0.5, anchor: 'center', at: 0 });
      }),
    ).toThrow(TimelineValidationError);
  });

  it('a non-finite each or anchor throws at stagger entry', () => {
    expect(() =>
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x'], { from: 0, to: 1 }, { each: Number.NaN });
      }),
    ).toThrow(TimelineValidationError);
    expect(() =>
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x'], { from: 0, to: 1 }, { each: 0.1, anchor: Number.POSITIVE_INFINITY });
      }),
    ).toThrow(TimelineValidationError);
    // a fn that returns NaN is caught per-target too
    expect(() =>
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x'], { from: 0, to: 1 }, { each: () => Number.NaN });
      }),
    ).toThrow(TimelineValidationError);
  });
});

describe('tl.sequence + tl.at — pure build-time sugar over add()', () => {
  /** Each child timeline animates one distinct target over [0, dur]. */
  const sub = (target: string, dur: number) =>
    timeline({ tracks: [track(target, 'number', [key(0, 0), key(dur, 1)])] });

  /** ChildEntry offset rows on a doc, in insertion order. */
  const childAts = (doc: ReturnType<typeof timeline>) => (doc.children ?? []).map((c) => c.at);

  it('sequence([a,b,c], {gap}) ≡ a hand-written add(a); add(b,"+=gap"); add(c,"+=gap") chain', () => {
    const a = sub('a/x', 2);
    const b = sub('b/x', 3);
    const c = sub('c/x', 1);

    const seq = timeline((tl) => {
      tl.sequence([a, b, c], { gap: 0.5 });
    });
    const hand = timeline((tl) => {
      tl.add(a).add(b, '+=0.5').add(c, '+=0.5');
    });

    // identical ChildEntry rows (timeline ref + resolved offset)
    expect(seq.children).toEqual(hand.children);
    // a:0 → b:2+0.5=2.5 → c:2.5+3+0.5=6
    expect(childAts(seq)).toEqual([0, 2.5, 6]);
  });

  it('changing sub a’s internal duration auto-shifts b and c (the auto-rebase contract)', () => {
    const b = sub('b/x', 3);
    const c = sub('c/x', 1);

    const shortA = timeline((tl) => tl.sequence([sub('a/x', 2), b, c], { gap: 0 }));
    const longA = timeline((tl) => tl.sequence([sub('a/x', 5), b, c], { gap: 0 }));

    // a 2→5 lengthening pushes b by +3 and c by +3
    expect(childAts(shortA)).toEqual([0, 2, 5]);
    expect(childAts(longA)).toEqual([0, 5, 8]);
  });

  it('gap: 0 (default) is back-to-back; a positive gap inserts slack', () => {
    const a = sub('a/x', 2);
    const b = sub('b/x', 2);

    const backToBack = timeline((tl) => tl.sequence([a, b]));
    const slack = timeline((tl) => tl.sequence([a, b], { gap: 1 }));

    expect(childAts(backToBack)).toEqual([0, 2]);
    expect(childAts(slack)).toEqual([0, 3]);
  });

  it('a negative gap overlaps arithmetically (no crossfade synthesized)', () => {
    const a = sub('a/x', 2);
    const b = sub('b/x', 2);
    const overlap = timeline((tl) => tl.sequence([a, b], { gap: -0.5 }));
    // b starts at 2 - 0.5 = 1.5; the two children simply overlap on the axis
    expect(childAts(overlap)).toEqual([0, 1.5]);
  });

  it('at(time, sub) places a sub at the absolute parent time ≡ add(sub, time)', () => {
    const a = sub('a/x', 2);
    const placed = timeline((tl) => tl.at(3, a));
    const hand = timeline((tl) => tl.add(a, 3));
    expect(placed.children).toEqual(hand.children);
    expect(childAts(placed)).toEqual([3]);
  });

  it('a sequenced sub’s .call() callback is forwarded onto the parent doc', () => {
    const cb = () => {};
    const child = timeline((tl) => {
      tl.to(prop('n/x', 0), 1, { duration: 1 }).call(cb);
    });
    // the child's own marker is 'call:0'; rebased into the parent it is
    // namespaced by the child's position path (c0/) so siblings can't collide
    const childCbName = child.markers![0]!.name;
    const rebasedName = `c0/${childCbName}`;

    const parent = timeline((tl) => {
      tl.sequence([child]);
    });

    // the child's name→fn entry resolves via getTimelineCallbacks(parentDoc)
    // under its namespaced key, and compileTimeline rebases the child marker
    // into the parent's set under the SAME name — the two agree by construction
    expect(getTimelineCallbacks(parent).get(rebasedName)).toBe(cb);
    const compiled = compileTimeline(parent);
    expect(compiled.markers.some((m) => m.name === rebasedName)).toBe(true);
  });

  it('a parent .call() and a forwarded child .call() coexist under distinct keys', () => {
    const childCb = () => {};
    const parentCb = () => {};
    // both auto-name 'call:0' per-doc, but the child's marker is namespaced by
    // its position path (c0/) on the way up — no collision, no drop
    const child = timeline((tl) => {
      tl.to(prop('n/x', 0), 1, { duration: 1 }).call(childCb);
    });
    const parent = timeline((tl) => {
      tl.call(parentCb).add(child);
    });
    const cbs = getTimelineCallbacks(parent);
    expect(cbs.get('call:0')).toBe(parentCb);
    expect(cbs.get('c0/call:0')).toBe(childCb);
    // and the rebased child marker carries the SAME namespaced name
    const compiled = compileTimeline(parent);
    expect(compiled.markers.find((m) => m.name === 'c0/call:0')).toBeDefined();
  });

  it('two sibling subs each with a .call() both register and fire (no drop, no double-fire)', () => {
    const cbA = () => {};
    const cbB = () => {};
    // each sub auto-names its callback 'call:0' (callCount resets per-doc); the
    // old first-writer-wins merge would drop one and double-fire the other
    const subA = timeline((tl) => {
      tl.to(prop('a/x', 0), 1, { duration: 1 }).call(cbA, 0.5);
    });
    const subB = timeline((tl) => {
      tl.to(prop('b/x', 0), 1, { duration: 1 }).call(cbB, 0.25);
    });
    const parent = timeline((tl) => {
      tl.sequence([subA, subB]);
    });

    const cbs = getTimelineCallbacks(parent);
    // both land under distinct, position-namespaced keys
    expect(cbs.get('c0/call:0')).toBe(cbA);
    expect(cbs.get('c1/call:0')).toBe(cbB);

    const compiled = compileTimeline(parent);
    const mA = compiled.markers.find((m) => m.name === 'c0/call:0')!;
    const mB = compiled.markers.find((m) => m.name === 'c1/call:0')!;
    // subA occupies [0,1] → call at 0.5; subB sequenced after at base 1 → call at 1.25
    expect(mA.t).toBeCloseTo(0.5);
    expect(mB.t).toBeCloseTo(1.25);
    // exactly one marker per name — no double-fire
    expect(compiled.markers.filter((m) => m.name === 'c0/call:0')).toHaveLength(1);
    expect(compiled.markers.filter((m) => m.name === 'c1/call:0')).toHaveLength(1);
  });
});

describe('k-g1zn: unknown builder options throw (no silent swallow)', () => {
  it('an unknown key on to() throws naming the key', () => {
    expect(() =>
      timeline((tl) => {
        tl.to('a/x', 1, { duration: 1, esae: 'linear' } as never);
      }),
    ).toThrow(/to:.*'esae'/);
    expect(() =>
      timeline((tl) => {
        tl.to('a/x', 1, { esae: 'linear' } as never);
      }),
    ).toThrow(TimelineValidationError);
  });

  it('an unknown key on fromTo() throws naming the method and key', () => {
    expect(() =>
      timeline((tl) => {
        tl.fromTo('a/x', 0, 1, { dur: 1 } as never);
      }),
    ).toThrow(/fromTo:.*'dur'/);
  });

  it('an unknown key on set() throws naming the key', () => {
    expect(() =>
      timeline((tl) => {
        tl.set('a/x', 1, { att: 0 } as never);
      }),
    ).toThrow(/set:.*'att'/);
  });

  it('an unknown key on the stagger spec throws naming the key', () => {
    expect(() =>
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x'], { to: 1, easing: 'linear' } as never, { each: 0.1 });
      }),
    ).toThrow(/stagger spec:.*'easing'/);
  });

  it('an unknown key on the stagger opts throws naming the key', () => {
    expect(() =>
      timeline((tl) => {
        tl.stagger(['a/x', 'b/x'], { to: 1 }, { each: 0.1, anchorr: 'start' } as never);
      }),
    ).toThrow(/stagger opts:.*'anchorr'/);
  });

  it('all VALID keys still pass (no false positives)', () => {
    expect(() =>
      timeline((tl) => {
        tl.to('a/x', 1, { duration: 1, ease: 'linear', at: 0, from: 0 })
          .fromTo('b/x', 0, 1, { duration: 1, ease: 'linear', at: '+=1' })
          .set('c/x', 1, { at: 2 })
          .stagger(['d/x', 'e/x'], { to: 1, from: 0, duration: 1, ease: 'linear' }, { each: 0.1, anchor: 'start', at: 3 });
      }),
    ).not.toThrow();
  });
});

describe('ppCUmU: per-target stagger spec values (to/from as a function)', () => {
  it('to: (i) => slot[i] produces per-target destinations matching hand-authored', () => {
    const slot = [10, 20, 30];
    const staggered = timeline((tl) => {
      tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: (i) => slot[i]! }, { each: 0.1 });
    });
    const hand = timeline((tl) => {
      tl.fromTo('a/x', 0, 10, { at: 0 }).fromTo('b/x', 0, 20, { at: 0.1 }).fromTo('c/x', 0, 30, { at: 0.2 });
    });
    expect(staggered.tracks).toEqual(hand.tracks);
  });

  it('from: (i) => fn likewise resolves per-target start values', () => {
    const fromAt = [100, 200];
    const staggered = timeline((tl) => {
      tl.stagger(['a/x', 'b/x'], { from: (i) => fromAt[i]!, to: 0 }, { each: 0.1 });
    });
    const hand = timeline((tl) => {
      tl.fromTo('a/x', 100, 0, { at: 0 }).fromTo('b/x', 200, 0, { at: 0.1 });
    });
    expect(staggered.tracks).toEqual(hand.tracks);
  });

  it('the count arg is the group size; both i and n flow to the fn', () => {
    const staggered = timeline((tl) => {
      tl.stagger(['a/x', 'b/x', 'c/x'], { from: 0, to: (i, n) => i * 10 + n }, { each: 0.1 });
    });
    const hand = timeline((tl) => {
      tl.fromTo('a/x', 0, 3, { at: 0 }).fromTo('b/x', 0, 13, { at: 0.1 }).fromTo('c/x', 0, 23, { at: 0.2 });
    });
    expect(staggered.tracks).toEqual(hand.tracks);
  });

  it('a non-fn value still fans uniformly (unchanged)', () => {
    const staggered = timeline((tl) => {
      tl.stagger(['a/x', 'b/x'], { to: 1 }, { each: 0.1 });
    });
    const hand = timeline((tl) => {
      tl.to('a/x', 1, { at: 0 }).to('b/x', 1, { at: 0.1 });
    });
    expect(staggered.tracks).toEqual(hand.tracks);
  });
});

describe('Isuo8Gxn: tl.tracks(tracks) — the clip-tier bridge', () => {
  it("injects presence()'s tracks into the document", async () => {
    const { presence } = await import('../src/presence.js');
    const pres = presence('card', { window: [1, 3], enter: { opacity: [0, 1] }, exit: { opacity: [1, 0] } });
    const doc = timeline((tl) => {
      tl.tracks(pres.tracks);
    });
    const presOpacity = pres.tracks.find((t) => t.target === 'card/opacity')!;
    expect(doc.tracks.find((t) => t.target === 'card/opacity')).toEqual(presOpacity);
  });

  it('composes alongside tl.to(...) in the same chain', async () => {
    const { presence } = await import('../src/presence.js');
    const pres = presence('card', { window: [1, 3], enter: { opacity: [0, 1] }, exit: { opacity: [1, 0] } });
    const doc = timeline((tl) => {
      tl.to('box/x', 1, { duration: 1 }).tracks(pres.tracks);
    });
    // the builder's own emitted track survives
    expect(doc.tracks.find((t) => t.target === 'box/x')).toBeDefined();
    // and the injected presence track lands verbatim
    const presOpacity = pres.tracks.find((t) => t.target === 'card/opacity')!;
    expect(doc.tracks.find((t) => t.target === 'card/opacity')).toEqual(presOpacity);
  });

  it('accepts a clip-tier RESULT object (tl.tracks(presence(...))) and the raw array equivalently', async () => {
    const { presence } = await import('../src/presence.js');
    const mkPres = () => presence('card', { window: [1, 3], enter: { opacity: [0, 1] }, exit: { opacity: [1, 0] } });

    // (a) pass the result object directly — no more "{} is not iterable"
    const byResult = timeline((tl) => {
      tl.tracks(mkPres());
    });
    // (b) pass the .tracks array
    const pres = mkPres();
    const byArray = timeline((tl) => {
      tl.tracks(pres.tracks);
    });

    // both forms produce the identical injected track
    const presOpacity = pres.tracks.find((t) => t.target === 'card/opacity')!;
    expect(byResult.tracks.find((t) => t.target === 'card/opacity')).toEqual(presOpacity);
    expect(byArray.tracks.find((t) => t.target === 'card/opacity')).toEqual(presOpacity);
    expect(byResult.tracks).toEqual(byArray.tracks);
  });
});

describe('KMu5GL1DvFms: builder-form init.tracks is applied, not silently dropped', () => {
  it('applies init.tracks passed via timeline(fn, { tracks }) — no longer a silent no-op', () => {
    const t = track('cap/opacity', 'number', [key(0, 0), key(1, 1)]);
    const doc = timeline(() => {}, { tracks: [t] });
    expect(doc.tracks.find((x) => x.target === 'cap/opacity')).toEqual(t);
  });

  it('an init.tracks doc deep-equals a tl.tracks([t]) doc (both injection paths agree)', () => {
    const t = track('cap/opacity', 'number', [key(0, 0), key(1, 1)]);
    const viaInit = timeline(() => {}, { tracks: [t] });
    const viaBuilder = timeline((tl) => {
      tl.tracks([t]);
    });
    expect(viaInit).toEqual(viaBuilder);
  });

  it('init.tracks composes alongside builder-emitted tracks in the same call', () => {
    const t = track('cap/opacity', 'number', [key(0, 0), key(1, 1)]);
    const doc = timeline(
      (tl) => {
        tl.to('box/x', 1, { duration: 1 });
      },
      { tracks: [t] },
    );
    // builder's own emitted track survives
    expect(doc.tracks.find((x) => x.target === 'box/x')).toBeDefined();
    // and the init-injected track lands verbatim
    expect(doc.tracks.find((x) => x.target === 'cap/opacity')).toEqual(t);
  });

  it('regression: the object/document form timeline({ tracks }) still works (untouched)', () => {
    const t = track('cap/opacity', 'number', [key(0, 0), key(1, 1)]);
    const doc = timeline({ tracks: [t] });
    expect(doc.tracks).toEqual([t]);
  });

  it('does not mutate the caller-supplied init.tracks array', () => {
    const t = track('cap/opacity', 'number', [key(0, 0), key(1, 1)]);
    const arr = [t];
    timeline((tl) => {
      tl.tracks([track('box/x', 'number', [key(0, 0)])]);
    }, { tracks: arr });
    expect(arr).toEqual([t]);
  });
});

describe('TweenOpts.type — value-type escape hatch (0.23)', () => {
  it('to() with { type } overrides inference (the fontAxes { wght } case the builder can\'t infer)', () => {
    const tl = timeline((b) => {
      b.to('hero/fontAxes', { wght: 900 }, { type: 'fontAxes', from: { wght: 400 }, duration: 1 });
    });
    const tr = tl.tracks.find((t) => t.target === 'hero/fontAxes')!;
    expect(tr.type).toBe('fontAxes');
    expect(tr.keys.map((k) => k.value)).toEqual([{ wght: 400 }, { wght: 900 }]);
  });

  it('set() and fromTo() accept { type } too', () => {
    const tl = timeline((b) => b.set('h/fontAxes', { wght: 250 }, { type: 'fontAxes' }));
    expect(tl.tracks.find((t) => t.target === 'h/fontAxes')!.type).toBe('fontAxes');
    const tl2 = timeline((b) => b.fromTo('h2/fontAxes', { wght: 100 }, { wght: 900 }, { type: 'fontAxes' }));
    expect(tl2.tracks.find((t) => t.target === 'h2/fontAxes')!.type).toBe('fontAxes');
  });

  it('two DIFFERENT explicit types on one target throw (a track has one type)', () => {
    expect(() =>
      timeline((b) => {
        b.set('x/fontAxes', { wght: 1 }, { type: 'fontAxes' });
        b.to('x/fontAxes', { wght: 2 }, { type: 'number', from: { wght: 1 } });
      }),
    ).toThrow(/conflicting explicit value types/);
  });

  it('without { type }, inference still drives (a plain number stays number) — back-compat', () => {
    const tl = timeline((b) => b.to('node/opacity', 1, { from: 0 }));
    expect(tl.tracks.find((t) => t.target === 'node/opacity')!.type).toBe('number');
  });
});
