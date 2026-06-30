import { describe, expect, it } from 'vitest';
import { fontAxesType, getValueType, setDevWarning } from '../src/index.js';

describe('fontAxesType (0.23 — animatable variable-font axes, the value-type fork)', () => {
  it('is a registered value type', () => {
    expect(getValueType('fontAxes')).toBe(fontAxesType);
    expect(fontAxesType.id).toBe('fontAxes');
  });

  it('lerps each axis linearly when both keyframes share the same axis set', () => {
    expect(fontAxesType.lerp({ wght: 400, opsz: 12 }, { wght: 800, opsz: 20 }, 0.5)).toEqual({ wght: 600, opsz: 16 });
    expect(fontAxesType.lerp({ wght: 400 }, { wght: 800 }, 0)).toEqual({ wght: 400 });
    expect(fontAxesType.lerp({ wght: 400 }, { wght: 800 }, 1)).toEqual({ wght: 800 });
  });

  it('does not extrapolate (spring overshoot clamps, like path/paint)', () => {
    expect(fontAxesType.extrapolates).toBe(false);
  });

  it('SNAPS on a mismatched axis set (hold a, then b at t>=1) + warns once', () => {
    const warnings: string[] = [];
    setDevWarning((m) => void warnings.push(m));
    try {
      // {wght} vs {wght, opsz} — different axis tags → no interpolation
      expect(fontAxesType.lerp({ wght: 400 }, { wght: 800, opsz: 14 }, 0.5)).toEqual({ wght: 400 });
      expect(fontAxesType.lerp({ wght: 400 }, { wght: 800, opsz: 14 }, 1)).toEqual({ wght: 800, opsz: 14 });
      expect(warnings.some((w) => /fontAxes lerp with mismatched axis tags/.test(w))).toBe(true);
    } finally {
      setDevWarning((m) => void globalThis.console?.warn(m));
    }
  });

  it('equals requires the same keys AND values', () => {
    expect(fontAxesType.equals({ wght: 700, opsz: 14 }, { wght: 700, opsz: 14 })).toBe(true);
    expect(fontAxesType.equals({ wght: 700 }, { wght: 701 })).toBe(false);
    expect(fontAxesType.equals({ wght: 700 }, { wght: 700, opsz: 14 })).toBe(false); // key-set mismatch
  });
});
