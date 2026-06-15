import { describe, expect, it } from 'vitest';
import {
  compileTimeline,
  emptySidecar,
  key,
  mergeSidecar,
  sampleTrack,
  setDevWarning,
  timeline,
  track,
  SidecarVersionError,
  type SidecarDoc,
} from '../src/index.js';

const code = () =>
  timeline({
    tracks: [
      track('a/x', 'number', [key(0, 0), key(1, 100)]),
      track('a/opacity', 'number', [key(0, 1)]),
    ],
    labels: { mid: 0.5 },
  });

describe('sidecar merge (§6.2)', () => {
  it('null/empty sidecars are identity', () => {
    expect(mergeSidecar(code(), null)).toEqual(code());
    expect(mergeSidecar(code(), emptySidecar()).tracks).toEqual(code().tracks);
  });

  it('sidecar tracks replace same-target code tracks wholesale and mark them editable', () => {
    const sidecar: SidecarDoc = {
      sidecarVersion: 1,
      tracks: [track('a/x', 'number', [key(0, 0), key(2, 500)])],
    };
    const merged = mergeSidecar(code(), sidecar);
    const x = compileTimeline(merged).tracks.get('a/x')!;
    expect(sampleTrack(x, 2)).toBe(500);
    expect(merged.tracks.find((t) => t.target === 'a/x')!.editable).toBe(true);
    // untouched code track passes through
    expect(merged.tracks.find((t) => t.target === 'a/opacity')!.keys).toEqual([key(0, 1)]);
  });

  it('editor-created tracks are added; code labels win on collision, editor-only labels fill in (§6.2)', () => {
    const warnings: string[] = [];
    setDevWarning((m) => warnings.push(m));
    const sidecar: SidecarDoc = {
      sidecarVersion: 1,
      tracks: [track('a/rotation', 'number', [key(0, 0), key(1, 90)])],
      labels: { mid: 0.75, end: 2 }, // 'mid' collides with the code label (0.5)
    };
    const merged = mergeSidecar(code(), sidecar);
    expect(merged.tracks.map((t) => t.target)).toContain('a/rotation');
    expect(merged.labels).toEqual({ mid: 0.5, end: 2 }); // code 'mid' wins; editor 'end' added
    expect(warnings.some((w) => w.includes('mid') && /code wins/.test(w))).toBe(true);
    setDevWarning(() => {});
  });

  it('does not mutate inputs and survives JSON round trips', () => {
    const base = code();
    const sidecar: SidecarDoc = {
      sidecarVersion: 1,
      tracks: [track('a/x', 'number', [key(0, 7)])],
    };
    const merged = mergeSidecar(base, sidecar);
    expect(base.tracks[0]!.keys[0]!.value).toBe(0);
    expect(JSON.parse(JSON.stringify(merged))).toEqual(merged);
    merged.tracks[0]!.keys[0]!.value = 999;
    expect(sidecar.tracks[0]!.keys[0]!.value).toBe(7);
  });

  it('rejects unknown sidecar versions', () => {
    expect(() =>
      mergeSidecar(code(), { sidecarVersion: 2 as unknown as 1, tracks: [] }),
    ).toThrow(SidecarVersionError);
  });
});

describe('normalizeEditedKeys (§2.7 under editing)', () => {
  const cfg = { stiffness: 170, damping: 14, mass: 1 };

  it('re-pins a dragged spring key to prev.t + spring.duration', async () => {
    const { spring, normalizeEditedKeys } = await import('../src/index.js');
    const d = spring.duration(cfg);
    const keys = [key(0, 0), key(0.78, 300, spring(cfg))]; // dragged off-grid
    const fixed = normalizeEditedKeys(keys);
    expect(fixed[1]!.t).toBeCloseTo(d, 9);
  });

  it('retiming the predecessor carries the spring key along', async () => {
    const { spring, normalizeEditedKeys } = await import('../src/index.js');
    const d = spring.duration(cfg);
    const keys = [key(0.5, 0), key(d, 300, spring(cfg))]; // prev moved to 0.5
    const fixed = normalizeEditedKeys(keys);
    expect(fixed[1]!.t).toBeCloseTo(0.5 + d, 9);
  });

  it('sorts retimed keys and the result passes document validation', async () => {
    const { spring, normalizeEditedKeys, compileTimeline, timeline } = await import('../src/index.js');
    const keys = normalizeEditedKeys([key(2, 1), key(0.3, 0), key(2.5, 5, spring(cfg))]);
    expect(keys.map((k) => k.t)).toEqual([...keys.map((k) => k.t)].sort((a, b) => a - b));
    const doc = timeline({ tracks: [{ target: 'a/x', type: 'number', keys }] });
    expect(() => compileTimeline(doc)).not.toThrow();
  });
});

describe('normalizeEditedKeys: collisions nudge, never delete', () => {
  it('a key dragged onto another keeps both (1ms nudge)', async () => {
    const { normalizeEditedKeys } = await import('../src/index.js');
    const fixed = normalizeEditedKeys([key(1.5, -1), key(1.5, 1, { interp: 'hold' })]);
    expect(fixed).toHaveLength(2);
    expect(fixed[1]!.t).toBeCloseTo(1.501, 9);
    expect(fixed.map((k) => k.value)).toEqual([-1, 1]);
  });
});
