/**
 * `Expr` (0.40) — a deterministic math-expression evaluator for animating a prop
 * by a FORMULA of time: `expr('100 + 50*sin(t*2)')`. Compiles a source string ONCE
 * to a fast closure `(scope) => number`; the Track sampler evaluates it at the
 * playhead `t` through the SAME channel keyframe interpolation uses (so it's a pure
 * function of time, byte-identical run-to-run, and needs no ambient-time design —
 * glissade already threads `t` to the sampler).
 *
 * Grammar (arithmetic; no side effects): numbers, the variable `t` (+ any scope
 * var), `+ - * / % ^` (^ = pow, right-assoc), unary ±, parens, and a WHITELIST of
 * pure functions/constants. Determinism is enforced by construction: the only
 * randomness is `rand(x)` (a seeded hash → [0,1)); there is no `Date`/`Math.random`
 * reachable, and an unknown identifier/function fails loud at COMPILE time.
 */

import { random } from './rng.js';
import { makeExprTrack, setExprCompiler, type Track } from './track.js';

export class ExprError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExprError';
  }
}

/** A compiled expression: evaluate at a scope (must include `t`). */
export interface CompiledExpr {
  /** the original source (serializable — a Track stores this). */
  readonly source: string;
  /** evaluate the formula; `scope.t` is the playhead time. Pure in its scope. */
  eval(scope: Record<string, number>): number;
}

// ── the function / constant whitelist (all pure) ─────────────────────────────

const fract = (x: number): number => x - Math.floor(x);
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp(e1 === e0 ? 0 : (x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** deterministic hash of `x` → [0, 1) — the ONLY randomness (seeded, pure). */
const rand = (x: number): number => {
  // fold the float bits into a 32-bit seed, then one splitmix step from core rng
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const seed = (buf.getUint32(0) ^ buf.getUint32(4)) >>> 0;
  return random(seed)();
};

// Both cases resolve (0.41.1): the canonical UPPERCASE plus lowercase aliases, so a
// copy-pasted `2*pi`/`e` reads the constant instead of throwing `unknown variable`.
const CONSTS: Record<string, number> = {
  PI: Math.PI, TAU: Math.PI * 2, E: Math.E,
  pi: Math.PI, tau: Math.PI * 2, e: Math.E,
};

type Fn = (...a: number[]) => number;
const FNS: Record<string, { fn: Fn; arity: number | 'variadic' }> = {
  sin: { fn: Math.sin, arity: 1 },
  cos: { fn: Math.cos, arity: 1 },
  tan: { fn: Math.tan, arity: 1 },
  asin: { fn: Math.asin, arity: 1 },
  acos: { fn: Math.acos, arity: 1 },
  atan: { fn: Math.atan, arity: 1 },
  abs: { fn: Math.abs, arity: 1 },
  sqrt: { fn: Math.sqrt, arity: 1 },
  exp: { fn: Math.exp, arity: 1 },
  log: { fn: Math.log, arity: 1 },
  floor: { fn: Math.floor, arity: 1 },
  ceil: { fn: Math.ceil, arity: 1 },
  round: { fn: Math.round, arity: 1 },
  sign: { fn: Math.sign, arity: 1 },
  fract: { fn: fract, arity: 1 },
  rand: { fn: rand, arity: 1 },
  atan2: { fn: Math.atan2, arity: 2 },
  pow: { fn: Math.pow, arity: 2 },
  mod: { fn: (a, b) => ((a % b) + b) % b, arity: 2 }, // floored modulo
  step: { fn: (edge, x) => (x < edge ? 0 : 1), arity: 2 },
  min: { fn: Math.min, arity: 'variadic' },
  max: { fn: Math.max, arity: 'variadic' },
  clamp: { fn: clamp, arity: 3 },
  lerp: { fn: lerp, arity: 3 },
  mix: { fn: lerp, arity: 3 },
  smoothstep: { fn: smoothstep, arity: 3 },
};

// ── tokenizer ────────────────────────────────────────────────────────────────

type Tok =
  | { k: 'num'; v: number }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string }
  | { k: '('; }
  | { k: ')'; }
  | { k: ','; };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '(') { toks.push({ k: '(' }); i++; continue; }
    if (c === ')') { toks.push({ k: ')' }); i++; continue; }
    if (c === ',') { toks.push({ k: ',' }); i++; continue; }
    if ('+-*/%^'.includes(c)) { toks.push({ k: 'op', v: c }); i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i + 1;
      while (j < n && /[0-9.eE+\-]/.test(src[j]!)) {
        // allow exponent sign only right after e/E
        if ((src[j] === '+' || src[j] === '-') && !/[eE]/.test(src[j - 1]!)) break;
        j++;
      }
      const num = Number(src.slice(i, j));
      if (!Number.isFinite(num)) throw new ExprError(`invalid number '${src.slice(i, j)}' in expr`);
      toks.push({ k: 'num', v: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[a-zA-Z0-9_]/.test(src[j]!)) j++;
      toks.push({ k: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new ExprError(`unexpected character '${c}' in expr '${src}'`);
  }
  return toks;
}

// ── parser (precedence climbing) → an AST of thunks over a scope ─────────────

type Node = (scope: Record<string, number>) => number;

const BINOP: Record<string, { prec: number; rightAssoc?: boolean; apply: (a: number, b: number) => number }> = {
  '+': { prec: 1, apply: (a, b) => a + b },
  '-': { prec: 1, apply: (a, b) => a - b },
  '*': { prec: 2, apply: (a, b) => a * b },
  '/': { prec: 2, apply: (a, b) => a / b },
  '%': { prec: 2, apply: (a, b) => ((a % b) + b) % b },
  '^': { prec: 4, rightAssoc: true, apply: (a, b) => Math.pow(a, b) },
};

function parse(src: string): Node {
  const toks = tokenize(src);
  if (toks.length === 0) throw new ExprError(`empty expr`);
  let p = 0;
  const peek = (): Tok | undefined => toks[p];
  const next = (): Tok => toks[p++]!;

  function parsePrimary(): Node {
    const t = peek();
    if (!t) throw new ExprError(`unexpected end of expr '${src}'`);
    if (t.k === 'op' && (t.v === '-' || t.v === '+')) {
      next();
      const operand = parseUnary();
      return t.v === '-' ? (s): number => -operand(s) : operand;
    }
    if (t.k === 'num') { next(); return (): number => t.v; }
    if (t.k === '(') {
      next();
      const e = parseExpr(0);
      if (peek()?.k !== ')') throw new ExprError(`missing ')' in expr '${src}'`);
      next();
      return e;
    }
    if (t.k === 'id') {
      next();
      const name = t.v;
      if (peek()?.k === '(') {
        // function call
        next();
        const args: Node[] = [];
        if (peek()?.k !== ')') {
          args.push(parseExpr(0));
          while (peek()?.k === ',') { next(); args.push(parseExpr(0)); }
        }
        if (peek()?.k !== ')') throw new ExprError(`missing ')' after ${name}(… in expr '${src}'`);
        next();
        const spec = FNS[name];
        if (!spec) throw new ExprError(`unknown function '${name}' in expr '${src}' (have: ${Object.keys(FNS).join(', ')})`);
        if (spec.arity !== 'variadic' && spec.arity !== args.length) {
          throw new ExprError(`${name}() takes ${spec.arity} arg(s), got ${args.length}`);
        }
        return (s): number => spec.fn(...args.map((a) => a(s)));
      }
      // constant or variable
      if (name in CONSTS) { const v = CONSTS[name]!; return (): number => v; }
      return (s): number => {
        const v = s[name];
        if (v === undefined) throw new ExprError(`unknown variable '${name}' in expr '${src}' (scope has: ${Object.keys(s).join(', ') || 'nothing'})`);
        return v;
      };
    }
    throw new ExprError(`unexpected token in expr '${src}'`);
  }

  function parseUnary(): Node {
    return parsePrimary();
  }

  function parseExpr(minPrec: number): Node {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (!t || t.k !== 'op') break;
      const op = BINOP[t.v];
      if (!op || op.prec < minPrec) break;
      next();
      const nextMin = op.rightAssoc ? op.prec : op.prec + 1;
      const right = parseExpr(nextMin);
      const l = left;
      left = (s): number => op.apply(l(s), right(s));
    }
    return left;
  }

  const root = parseExpr(0);
  if (p !== toks.length) throw new ExprError(`unexpected trailing tokens in expr '${src}'`);
  return root;
}

/**
 * Compile an expression source to a {@link CompiledExpr}. Parses ONCE (fails loud
 * on syntax / unknown function / arity / trailing tokens); `eval(scope)` is a fast
 * pure closure. `scope.t` is the playhead time; add more vars (e.g. `i`, `n`) as
 * the binding provides them.
 */
export function compileExpr(source: string): CompiledExpr {
  const node = parse(source);
  return { source, eval: (scope) => node(scope) };
}

/** The names available to an expression (for docs / a describe() surface). */
export const EXPR_FUNCTIONS = Object.keys(FNS);
// Canonical (uppercase) names for the docs / describe() surface; lowercase aliases
// resolve too but aren't advertised, to keep the listed set clean.
export const EXPR_CONSTANTS = ['PI', 'TAU', 'E'];

/**
 * A raw formula-driven numeric track — `exprTrack('circle/opacity', '0.5 +
 * 0.5*sin(t*3)')`. Sampled by evaluating the formula at the playhead `t` (no
 * keys); compile-validated now (fail loud on bad syntax / unknown fn / arity).
 */
export function exprTrack(target: string, formula: string): Track<number> {
  return makeExprTrack(target, formula);
}

// Register the evaluator with the base track sampler (the seam). Importing this
// entry — via exprTrack, compileExpr, or a bare `import '@glissade/core/expr'` —
// activates `tl.expr` / expr-track sampling. Idempotent.
setExprCompiler((src) => {
  const c = compileExpr(src);
  return (t) => {
    const v = c.eval({ t });
    // Fail loud on a non-finite result (0.41.1): `0/0`/`sqrt(-1)`→NaN, `1/0`→±Infinity
    // otherwise coerce silently to `null` at the bound prop — a determinism-posture gap.
    if (!Number.isFinite(v)) {
      throw new ExprError(`expr '${src}' evaluated to ${v} at t=${t} — a formula must produce a finite number (division by zero, sqrt of a negative, etc.)`);
    }
    return v;
  };
});
