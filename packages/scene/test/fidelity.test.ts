/**
 * 0.61 exportFidelity() — the static render-only export-fidelity scan.
 *
 * Pins: clean-scene-empty (the HARD gate — a scene with no render-only feature
 * emits NOTHING), each render-only feature firing exactly once with an actionable
 * hint + a detail.feature tag, and the pure-read / shuffle-stable order contract.
 */
import { describe, expect, it } from 'vitest';
import { type Paint, type Timeline, timeline, track, key } from '@glissade/core';
import { createScene, Rect, Text, motionBlur, echo, textCursor } from '../src/index.js';
import { shake } from '../src/motion.js';
import { exportFidelity } from '../src/diagnostics.js';

const size = { w: 200, h: 120 };
const empty: Timeline = { version: 1, tracks: [] };

describe('exportFidelity — clean-scene-empty (the HARD gate)', () => {
  it('returns ZERO diagnostics for a scene with no render-only features', () => {
    const scene = createScene({
      size,
      children: [
        new Rect({ id: 'box', position: [100, 60], width: 40, height: 30, fill: '#3366ff' }),
        new Text({ id: 'cap', position: [10, 60], text: 'hi', fontSize: 12, fill: '#000' }),
      ],
    });
    const res = exportFidelity(scene, empty);
    expect(res.diagnostics).toEqual([]);
    expect(res.hasErrors).toBe(false);
  });
});

describe('exportFidelity — each render-only feature fires once, actionably', () => {
  it('flags motionBlur with an export-loss hint + detail.feature', () => {
    const scene = createScene({
      size,
      children: [motionBlur(new Rect({ id: 'title', position: [100, 60], width: 40, height: 30, fill: '#f00' }))],
    });
    const res = exportFidelity(scene, empty);
    expect(res.diagnostics).toHaveLength(1);
    const d = res.diagnostics[0]!;
    expect(d.code).toBe('RENDER_ONLY_EXPORT');
    expect(d.source).toBe('parity');
    expect(d.severity).toBe('warning');
    expect(d.detail?.feature).toBe('motion-blur');
    expect(d.detail?.node).toBe('title'); // names the wrapped child (wrapper is id-less)
    expect(d.message).toMatch(/render-only/);
    expect(d.message).toMatch(/Lottie export/);
  });

  it('flags echo trails', () => {
    const scene = createScene({
      size,
      children: [echo(new Rect({ id: 'orb', position: [100, 60], width: 20, height: 20, fill: '#f00' }))],
    });
    const res = exportFidelity(scene, empty);
    expect(res.diagnostics.map((d) => d.detail?.feature)).toEqual(['echo-trails']);
  });

  it('flags a text cursor', () => {
    const scene = createScene({
      size,
      children: [new Text({ id: 't', position: [10, 60], text: 'hi', fontSize: 12 }), textCursor(new Text({ id: 't2', text: 'x' }), { id: 'caret' })],
    });
    const res = exportFidelity(scene, empty);
    expect(res.diagnostics.some((d) => d.detail?.feature === 'text-cursor')).toBe(true);
  });

  it('flags a standalone shake()', () => {
    const rect = new Rect({ id: 'jitter', position: [100, 60], width: 20, height: 20, fill: '#f00' });
    shake(rect, { seed: 1, translate: 4 });
    const scene = createScene({ size, children: [rect] });
    const res = exportFidelity(scene, empty);
    expect(res.diagnostics.map((d) => d.detail?.feature)).toEqual(['shake']);
  });

  it('flags a mesh fill', () => {
    const mesh: Paint = { kind: 'mesh', points: [{ pos: [0, 0], color: '#f00' }, { pos: [1, 1], color: '#00f' }], bg: '#000' };
    const scene = createScene({
      size,
      children: [new Rect({ id: 'grad', position: [100, 60], width: 40, height: 30, fill: mesh })],
    });
    const res = exportFidelity(scene, empty);
    expect(res.diagnostics.map((d) => d.detail?.feature)).toEqual(['mesh-fill']);
  });

  it('flags a Text reveal mask driven by a track', () => {
    const scene = createScene({
      size,
      children: [new Text({ id: 'typed', position: [10, 60], text: 'hello', fontSize: 12 })],
    });
    const doc = timeline({ tracks: [track('typed/reveal', 'number', [key(0, 0), key(1, 5)])] });
    const res = exportFidelity(scene, doc);
    expect(res.diagnostics.map((d) => d.detail?.feature)).toEqual(['reveal']);
  });

  it('is render-neutral + shuffle-stable — two runs give byte-identical output', () => {
    const scene = createScene({
      size,
      children: [
        echo(new Rect({ id: 'b', position: [50, 60], width: 20, height: 20, fill: '#f00' })),
        motionBlur(new Rect({ id: 'a', position: [150, 60], width: 20, height: 20, fill: '#0f0' })),
      ],
    });
    const r1 = exportFidelity(scene, empty);
    const r2 = exportFidelity(scene, empty);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    // canonical order = by node id: 'a' (motion-blur) before 'b' (echo)
    expect(r1.diagnostics.map((d) => d.detail?.node)).toEqual(['a', 'b']);
  });
});
