/**
 * Unit tests for the parity known-drop baseline module — the classify boundaries
 * (ok/regressed/new/improved at expected ± tolerance), path convention, the
 * header-mismatch loud fail, and the load/save round-trip + malformation guards.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_PARITY_TOLERANCE,
  ParityBaselineError,
  assertBaselineHeader,
  compareToBaseline,
  loadParityBaseline,
  parityBaselinePathFor,
  saveParityBaseline,
  type ParityBaseline,
} from '../src/parityBaseline.js';

const tmp = mkdtempSync(join(tmpdir(), 'glissade-parity-base-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const BASE: ParityBaseline = {
  name: 'demo',
  width: 240,
  height: 240,
  fps: 60,
  reference: 'skia',
  frames: { '0': { lottie: { mean: 0.9 } }, '60': { lottie: { mean: 0.79 } } },
};

describe('compareToBaseline — the four-way classify at the tolerance band', () => {
  const tol = DEFAULT_PARITY_TOLERANCE;
  const exp = { mean: 0.8 } as const;

  it("no pin → 'new'", () => {
    expect(compareToBaseline(0.8, undefined, tol)).toBe('new');
  });

  it("exactly on the pin → 'ok'", () => {
    expect(compareToBaseline(0.8, exp, tol)).toBe('ok');
  });

  it("just inside the band (both edges) → 'ok'", () => {
    expect(compareToBaseline(0.8 - tol, exp, tol)).toBe('ok');
    expect(compareToBaseline(0.8 + tol, exp, tol)).toBe('ok');
  });

  it("below expected − tolerance → 'regressed'", () => {
    expect(compareToBaseline(0.8 - tol * 2, exp, tol)).toBe('regressed');
    expect(compareToBaseline(0.5, exp, tol)).toBe('regressed');
  });

  it("above expected + tolerance → 'improved'", () => {
    expect(compareToBaseline(0.8 + tol * 2, exp, tol)).toBe('improved');
    expect(compareToBaseline(0.99, exp, tol)).toBe('improved');
  });

  it('a wider tolerance masks a small drop as ok', () => {
    expect(compareToBaseline(0.79, exp, 0.02)).toBe('ok'); // within ±0.02 of 0.8
    expect(compareToBaseline(0.79, exp, tol)).toBe('regressed'); // but not within 1e-4
  });
});

describe('parityBaselinePathFor — the <dir>/<name>.parity.json convention', () => {
  it('joins dir + name + .parity.json', () => {
    expect(parityBaselinePathFor('/a/b', 'scene')).toBe(join('/a/b', 'scene.parity.json'));
  });
});

describe('assertBaselineHeader — a config mismatch fails loud', () => {
  const live = { width: 240, height: 240, fps: 60, reference: 'skia' };

  it('passes when the header matches the live run', () => {
    expect(() => assertBaselineHeader(BASE, live)).not.toThrow();
  });

  it('a wrong width fails loud', () => {
    expect(() => assertBaselineHeader({ ...BASE, width: 480 }, live)).toThrow(ParityBaselineError);
    expect(() => assertBaselineHeader({ ...BASE, width: 480 }, live)).toThrow(/width 480 ≠ 240/);
  });

  it('a wrong fps / reference also fails loud', () => {
    expect(() => assertBaselineHeader({ ...BASE, fps: 30 }, live)).toThrow(/fps 30 ≠ 60/);
    expect(() => assertBaselineHeader({ ...BASE, reference: 'dom' }, live)).toThrow(/reference 'dom'/);
  });
});

describe('load / save — round-trip + malformation guards', () => {
  it('save then load round-trips the document', () => {
    const p = join(tmp, 'rt.parity.json');
    saveParityBaseline(p, BASE);
    expect(loadParityBaseline(p)).toEqual(BASE);
  });

  it('save creates a missing parent directory', () => {
    const p = join(tmp, 'nested', 'deep', 'rt.parity.json');
    saveParityBaseline(p, BASE);
    expect(loadParityBaseline(p).name).toBe('demo');
  });

  it('a non-existent file fails loud', () => {
    expect(() => loadParityBaseline(join(tmp, 'nope.json'))).toThrow(ParityBaselineError);
  });

  it('malformed JSON fails loud', () => {
    const p = join(tmp, 'bad.json');
    writeFileSync(p, '{not json');
    expect(() => loadParityBaseline(p)).toThrow(ParityBaselineError);
  });

  it('a missing numeric header field fails loud', () => {
    const p = join(tmp, 'noheader.json');
    writeFileSync(p, JSON.stringify({ name: 'x', width: 240, height: 240, reference: 'skia', frames: {} }));
    expect(() => loadParityBaseline(p)).toThrow(/positive 'fps'/);
  });

  it('an expectation without a numeric mean fails loud', () => {
    const p = join(tmp, 'nomean.json');
    writeFileSync(
      p,
      JSON.stringify({ ...BASE, frames: { '0': { lottie: { min: 0.5 } } } }),
    );
    expect(() => loadParityBaseline(p)).toThrow(/missing a numeric 'mean'/);
  });
});
