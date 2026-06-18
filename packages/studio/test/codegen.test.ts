/**
 * Write-back source generation (§6.2 rules 4 & 7): copy-as-code / extract-edits
 * are CLIPBOARD-ONLY — these helpers emit key()/track() source the user pastes;
 * the source / input is never mutated. (§finding-6 coverage)
 */

import { describe, expect, it } from 'vitest';
import { key, track } from '@glissade/core';
import { keyCall, previewSource, trackSource, valueLiteral } from '../src/codegen.js';

describe('codegen', () => {
  it('valueLiteral formats numbers / vec2 / strings', () => {
    expect(valueLiteral(5)).toBe('5');
    expect(valueLiteral(0.333333)).toBe('0.3333');
    expect(valueLiteral([1, 2])).toBe('[1, 2]');
    expect(valueLiteral('#fff')).toBe('"#fff"');
  });

  it('keyCall emits key(t, value[, ease])', () => {
    expect(keyCall(key(0, 0))).toBe('key(0, 0)');
    expect(keyCall(key(1, 1, 'easeInOutCubic'))).toContain('key(1, 1, "easeInOutCubic")');
  });

  it('trackSource emits a track(...) literal and does NOT mutate the input', () => {
    const t = track('box/x', 'number', [key(0, 0), key(1, 1)]);
    const before = JSON.stringify(t);
    const src = trackSource(t);
    expect(src).toContain('track("box/x", "number", [');
    expect(src).toContain('key(0, 0)');
    expect(JSON.stringify(t)).toBe(before); // pure — the track is never touched
  });

  it('previewSource carries a self-documenting target comment + key()', () => {
    const src = previewSource('box/opacity', 0.5, 0.25);
    expect(src).toContain('// box/opacity @ t=0.5');
    expect(src).toContain('key(0.5, 0.25)');
  });
});
