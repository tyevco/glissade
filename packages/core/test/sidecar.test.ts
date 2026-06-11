import { describe, expect, it } from 'vitest';
import {
  compileTimeline,
  emptySidecar,
  key,
  mergeSidecar,
  sampleTrack,
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

  it('editor-created tracks are added; labels merge by name', () => {
    const sidecar: SidecarDoc = {
      sidecarVersion: 1,
      tracks: [track('a/rotation', 'number', [key(0, 0), key(1, 90)])],
      labels: { mid: 0.75, end: 2 },
    };
    const merged = mergeSidecar(code(), sidecar);
    expect(merged.tracks.map((t) => t.target)).toContain('a/rotation');
    expect(merged.labels).toEqual({ mid: 0.75, end: 2 });
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
