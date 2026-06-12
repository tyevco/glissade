import { describe, expect, it } from 'vitest';
import { timeline } from '@glissade/core';
import {
  Circle,
  createDisplayListBuilder,
  createScene,
  evaluate,
  FilterValidationError,
  filtersToCanvasFilter,
  validateFilters,
  type FilterSpec,
} from '../src/index.js';

describe('FilterSpec (§3.4): a closed, validated union — never a CSS passthrough', () => {
  it('accepts every member of the enumerated set', () => {
    expect(() =>
      validateFilters([
        { kind: 'blur', radius: 8 },
        { kind: 'drop-shadow', dx: 4, dy: 6, blur: 10, color: '#00000088' },
        { kind: 'brightness', amount: 1.4 },
        { kind: 'contrast', amount: 0.5 },
        { kind: 'saturate', amount: 0 },
      ]),
    ).not.toThrow();
  });

  it('rejects unknown kinds and out-of-range params loudly', () => {
    expect(() => validateFilters([{ kind: 'sepia', amount: 1 } as never])).toThrow(FilterValidationError);
    expect(() => validateFilters([{ kind: 'blur', radius: -1 }])).toThrow(/radius/);
    expect(() => validateFilters([{ kind: 'blur', radius: NaN }])).toThrow(FilterValidationError);
    expect(() => validateFilters([{ kind: 'drop-shadow', dx: 0, dy: 0, blur: -2, color: '#000' }])).toThrow(
      /drop-shadow/,
    );
    expect(() => validateFilters([{ kind: 'drop-shadow', dx: 0, dy: 0, blur: 2, color: '' }])).toThrow(/color/);
    expect(() => validateFilters([{ kind: 'brightness', amount: -0.1 }])).toThrow(/brightness/);
  });

  it('compiles to the canvas filter syntax — the only place that syntax exists', () => {
    expect(filtersToCanvasFilter([])).toBe('none');
    expect(
      filtersToCanvasFilter([
        { kind: 'blur', radius: 8 },
        { kind: 'drop-shadow', dx: 4, dy: 6, blur: 10, color: '#000000' },
        { kind: 'saturate', amount: 1.5 },
      ]),
    ).toBe('blur(8px) drop-shadow(4px 6px 10px #000000) saturate(1.5)');
  });

  it('the builder rejects invalid filters at push time (document-layer guard)', () => {
    const b = createDisplayListBuilder({ w: 10, h: 10 });
    expect(() =>
      b.push({ op: 'pushGroup', opacity: 1, blend: 'source-over', filters: [{ kind: 'nope' } as never] }),
    ).toThrow(FilterValidationError);
  });

  it('a filtered node composites as a group and the pushGroup carries the filters', () => {
    const filters: FilterSpec[] = [{ kind: 'blur', radius: 4 }];
    const dot = new Circle({ id: 'dot', radius: 10, fill: '#fff', position: [5, 5], filters });
    const scene = createScene({ size: { w: 10, h: 10 }, children: [dot] });
    const list = evaluate(scene, timeline({ duration: 1 }), 0);
    const group = list.commands.find((c) => c.op === 'pushGroup');
    expect(group).toBeDefined();
    expect((group as { filters: FilterSpec[] }).filters).toEqual(filters);
    // and without filters (full opacity, default blend) no group is pushed
    const plain = new Circle({ id: 'p', radius: 10, fill: '#fff', position: [5, 5] });
    const scene2 = createScene({ size: { w: 10, h: 10 }, children: [plain] });
    const list2 = evaluate(scene2, timeline({ duration: 1 }), 0);
    expect(list2.commands.some((c) => c.op === 'pushGroup')).toBe(false);
  });
});
