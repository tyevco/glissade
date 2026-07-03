/**
 * Expr (0.40) — the deterministic math-expression evaluator. Proves precedence /
 * associativity, the variable `t` + scope, the pure-function whitelist, seeded
 * determinism, and the fail-loud COMPILE-time guards (unknown fn/var, arity,
 * syntax). No scene wiring — this is the pure evaluator core.
 */

import { describe, expect, it } from 'vitest';
import { compileExpr, ExprError, EXPR_FUNCTIONS, EXPR_CONSTANTS, exprTrack } from '../src/expr.js';
import { sampleTrack, validateTrack, timeline, type Track } from '../src/index.js';

const at = (src: string, scope: Record<string, number> = {}): number => compileExpr(src).eval(scope);

describe('arithmetic + precedence', () => {
  it('respects operator precedence and parens', () => {
    expect(at('2 + 3 * 4')).toBe(14);
    expect(at('(2 + 3) * 4')).toBe(20);
    expect(at('10 - 2 - 3')).toBe(5); // left-assoc
    expect(at('2 * 3 % 4')).toBe(2);
  });

  it('^ is right-associative pow', () => {
    expect(at('2 ^ 3 ^ 2')).toBe(512); // 2^(3^2) = 2^9
    expect(at('2 ^ 10')).toBe(1024);
  });

  it('unary minus/plus bind correctly', () => {
    expect(at('-5 + 3')).toBe(-2);
    expect(at('-(2 + 3)')).toBe(-5);
    expect(at('2 * -3')).toBe(-6);
    expect(at('+-4')).toBe(-4);
  });

  it('parses decimals and exponents', () => {
    expect(at('1.5 * 2')).toBe(3);
    expect(at('2e3 + 1')).toBe(2001);
    expect(at('1.5e-1')).toBeCloseTo(0.15, 10);
  });
});

describe('the variable t + scope', () => {
  it('animates by t (the card example)', () => {
    const e = compileExpr('100 + 50*sin(t*2)');
    expect(e.eval({ t: 0 })).toBe(100);
    expect(e.eval({ t: Math.PI / 4 })).toBeCloseTo(150, 10); // sin(PI/2)=1
    expect(e.source).toBe('100 + 50*sin(t*2)'); // serializable
  });

  it('reads arbitrary scope vars (e.g. i, n for indexed exprs)', () => {
    expect(at('t + i*10', { t: 5, i: 3 })).toBe(35);
  });
});

describe('function + constant whitelist', () => {
  it('math functions', () => {
    expect(at('abs(-4)')).toBe(4);
    expect(at('floor(3.9)')).toBe(3);
    expect(at('clamp(12, 0, 10)')).toBe(10);
    expect(at('lerp(0, 100, 0.25)')).toBe(25);
    expect(at('min(3, 1, 2)')).toBe(1); // variadic
    expect(at('max(3, 1, 2)')).toBe(3);
    expect(at('smoothstep(0, 1, 0.5)')).toBe(0.5);
    expect(at('step(5, 4)')).toBe(0);
    expect(at('step(5, 6)')).toBe(1);
  });

  it('mod is FLOORED (handles negatives)', () => {
    expect(at('mod(-1, 3)')).toBe(2);
    expect(at('7 % 3')).toBe(1);
    expect(at('-1 % 3')).toBe(2); // the % operator is also floored
  });

  it('constants', () => {
    expect(at('PI')).toBeCloseTo(Math.PI, 12);
    expect(at('TAU')).toBeCloseTo(Math.PI * 2, 12);
  });

  it('rand(x) is deterministic in [0,1) — the only randomness', () => {
    expect(at('rand(1)')).toBe(at('rand(1)')); // same input → same output
    expect(at('rand(1)')).not.toBe(at('rand(2)'));
    const r = at('rand(42.5)');
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });

  it('exposes its whitelist for docs/discovery', () => {
    expect(EXPR_FUNCTIONS).toContain('sin');
    expect(EXPR_FUNCTIONS).toContain('clamp');
    expect(EXPR_FUNCTIONS).toContain('rand');
  });
});

describe('determinism', () => {
  it('same source + scope → identical result (compile independently)', () => {
    const a = compileExpr('sin(t) + rand(t*3) * cos(t/2)');
    const b = compileExpr('sin(t) + rand(t*3) * cos(t/2)');
    for (const t of [0, 0.37, 1.5, 3.14, 10]) {
      expect(a.eval({ t })).toBe(b.eval({ t }));
    }
  });
});

describe('fail-loud (compile-time)', () => {
  it('unknown function / variable / constant', () => {
    expect(() => compileExpr('wobble(t)')).toThrow(/unknown function 'wobble'/);
    expect(() => at('t + q', { t: 1 })).toThrow(/unknown variable 'q'/);
  });

  it('arity mismatch', () => {
    expect(() => compileExpr('clamp(1, 2)')).toThrow(/clamp\(\) takes 3/);
    expect(() => compileExpr('sin(1, 2)')).toThrow(/sin\(\) takes 1/);
  });

  it('syntax errors: unbalanced parens, trailing tokens, empty, bad char', () => {
    expect(() => compileExpr('(1 + 2')).toThrow(/missing '\)'/);
    expect(() => compileExpr('1 + 2)')).toThrow(/trailing tokens/);
    expect(() => compileExpr('')).toThrow(ExprError);
    expect(() => compileExpr('1 @ 2')).toThrow(/unexpected character '@'/);
    expect(() => compileExpr('1 2')).toThrow(/trailing tokens/);
  });

  it('no Math.random / Date reachable (determinism by construction)', () => {
    // there is simply no token for them — they parse as unknown variables
    expect(() => compileExpr('random()')).toThrow(/unknown function 'random'/);
    expect(() => at('now', {})).toThrow(/unknown variable 'now'/);
  });
});

describe('exprTrack + sampleTrack + tl.expr (the Track integration)', () => {
  it('exprTrack samples the formula at the playhead t (no keys)', () => {
    const tr = exprTrack('orb/position.y', '200 + 80*sin(t*2)');
    expect(tr.expr).toBe('200 + 80*sin(t*2)');
    expect(tr.type).toBe('number');
    expect(tr.keys).toEqual([]);
    expect(sampleTrack(tr, 0)).toBe(200);
    expect(sampleTrack(tr, Math.PI / 4)).toBeCloseTo(280, 6); // sin(PI/2)=1
    // cached compile → same result on re-sample
    expect(sampleTrack(tr, 1)).toBe(sampleTrack(tr, 1));
  });

  it('validateTrack rejects a non-number type, a bad formula, and a bad target', () => {
    expect(() => validateTrack({ target: 'a/x', type: 'color', keys: [], expr: 't' } as unknown as Track)).toThrow(/must be type 'number'/);
    expect(() => exprTrack('a/x', 'wobble(t)')).toThrow(/invalid expr/);
    expect(() => exprTrack('a/x', '1 +')).toThrow(/invalid expr/);
    expect(() => exprTrack('badtarget', 't')).toThrow(/<nodeId>/);
  });

  it('exprTrack via tl.tracks lands in the document (the clip-tier authoring path)', () => {
    const doc = timeline((tl) => tl.tracks([exprTrack('orb/opacity', '0.5 + 0.5*sin(t*3)')]));
    const tr = doc.tracks!.find((t) => t.target === 'orb/opacity');
    expect(tr).toBeDefined();
    expect(tr!.expr).toBe('0.5 + 0.5*sin(t*3)');
    expect(sampleTrack(tr!, 0)).toBeCloseTo(0.5, 6);
  });
});

describe('lowercase constant aliases (0.41.1)', () => {
  it('lowercase pi/tau/e resolve to the same values as PI/TAU/E', () => {
    expect(at('pi')).toBeCloseTo(Math.PI, 12);
    expect(at('tau')).toBeCloseTo(Math.PI * 2, 12);
    expect(at('e')).toBeCloseTo(Math.E, 12);
    expect(at('2*pi')).toBeCloseTo(Math.PI * 2, 12);
    // both cases still work (canonical uppercase unchanged)
    expect(at('PI')).toBe(at('pi'));
  });
  it("scientific-notation numbers still parse (a bare 'e' constant doesn't break 1e3)", () => {
    expect(at('1e3')).toBe(1000);
    expect(at('2.5e2')).toBe(250);
  });
  it('EXPR_CONSTANTS advertises only the canonical uppercase names', () => {
    expect(EXPR_CONSTANTS).toEqual(['PI', 'TAU', 'E']);
  });
});

describe('non-finite guard (0.41.1) — fail loud instead of silent null at the bound prop', () => {
  it('a formula that evaluates to ±Infinity throws ExprError when sampled', () => {
    const tr = exprTrack('a/x', '1/0'); // compiles fine; only non-finite at eval
    expect(() => sampleTrack(tr, 0)).toThrow(ExprError);
    expect(() => sampleTrack(tr, 0)).toThrow(/finite number/);
  });
  it('a formula that evaluates to NaN throws (0/0, sqrt of a negative)', () => {
    expect(() => sampleTrack(exprTrack('a/x', '0/0'), 0)).toThrow(ExprError);
    expect(() => sampleTrack(exprTrack('a/x', 'sqrt(0-1)'), 0)).toThrow(/finite number/);
  });
  it('the guard only fires at the t where the formula blows up (finite elsewhere still samples)', () => {
    const tr = exprTrack('a/x', '1/(t-1)'); // ±Inf only at t=1
    expect(sampleTrack(tr, 0)).toBe(-1); // finite → samples normally
    expect(sampleTrack(tr, 2)).toBe(1);
    expect(() => sampleTrack(tr, 1)).toThrow(/finite number/);
  });
  it('a finite formula is untouched by the guard (no false positive)', () => {
    expect(sampleTrack(exprTrack('a/x', '1/2'), 0)).toBe(0.5);
  });
});
