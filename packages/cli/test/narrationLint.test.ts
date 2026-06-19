/**
 * gs narration-lint: catch slow-re-narrate failures at BUILD. Pure over the
 * committed timing manifest + the REAL measured caption geometry (Skia + the
 * render's fonts driving the actual caption node). Tier-1 fails CI; Tier-2 warns.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { NarrationTiming } from '@glissade/narrate';
import {
  fixDiff,
  hasErrors,
  lintNarration,
  type CaptionProbe,
  type Diagnostic,
} from '../src/narrationLint.js';
import { narrationLintCommand } from '../src/narrationLintCommand.js';

const CLEAN_MODULE = fileURLToPath(
  new URL('../../examples/src/scenes/golden-captions.ts', import.meta.url),
);

const dir = mkdtempSync(join(tmpdir(), 'glissade-narrlint-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** find one diagnostic of a rule, or undefined */
const find = (diags: Diagnostic[], rule: Diagnostic['rule'], id?: string): Diagnostic | undefined =>
  diags.find((d) => d.rule === rule && (id === undefined || d.id === id));

describe('lintNarration (pure rules)', () => {
  it('flags an over-CPS segment, leaves a comfortable one clean', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 3,
      segments: [
        // 40 chars / 1s = 40 cps — way over the 17 default
        { id: 'fast', text: 'A very dense caption crammed into one beat', start: 0, duration: 1, file: 'a.wav' },
        // 12 chars / 2s = 6 cps — comfortable
        { id: 'calm', text: 'Plenty time', start: 1, duration: 2, file: 'b.wav' },
      ],
    };
    const diags = lintNarration(timing, { warnings: false });
    const fast = find(diags, 'reading-speed', 'fast');
    expect(fast).toBeDefined();
    expect(fast!.tier).toBe(1);
    expect(fast!.detail!['cps']).toBeGreaterThan(17);
    expect(find(diags, 'reading-speed', 'calm')).toBeUndefined();
    expect(hasErrors(diags)).toBe(true);
  });

  it('flags a segment that overran its per-segment maxSec budget', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 5,
      segments: [
        { id: 'tight', text: 'Hello there', start: 0, duration: 3.2, file: 'a.wav', maxSec: 2.5 },
      ],
    };
    const diags = lintNarration(timing, { warnings: false });
    const over = find(diags, 'anchor-budget', 'tight');
    expect(over).toBeDefined();
    expect(over!.tier).toBe(1);
    expect(over!.detail!['overBy']).toBeCloseTo(0.7, 5);
  });

  it('honors the script-level budgets table for segments AND pauses', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 6,
      segments: [{ id: 'seg', text: 'word word', start: 0, duration: 2.0, file: 'a.wav' }],
      pauses: [{ id: 'beat', start: 2, duration: 3.0, bed: 'hold' }],
      budgets: { seg: 1.0, beat: 2.0 },
    };
    const diags = lintNarration(timing, { warnings: false });
    expect(find(diags, 'anchor-budget', 'seg')).toBeDefined(); // 2.0 > 1.0
    expect(find(diags, 'anchor-budget', 'beat')).toBeDefined(); // 3.0 > 2.0
  });

  it('per-segment maxSec wins over the budgets table', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 3,
      segments: [{ id: 'seg', text: 'word', start: 0, duration: 2.0, file: 'a.wav', maxSec: 3.0 }],
      budgets: { seg: 1.0 }, // would flag, but maxSec 3.0 wins
    };
    expect(find(lintNarration(timing, { warnings: false }), 'anchor-budget', 'seg')).toBeUndefined();
  });

  it('caption-fit uses the probe: flags overflow / over-maxLines, passes a fitting cue', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 4,
      // captionMode:'burn' escalates caption-fit to Tier-1 (the geometry assertion below)
      captionMode: 'burn',
      segments: [
        { id: 'tall', text: 'This caption wraps to too many lines', start: 0, duration: 4, file: 'a.wav' },
        { id: 'ok', text: 'Short', start: 4, duration: 2, file: 'b.wav' },
      ],
    };
    // a stub probe: the 'tall' cue wraps to 4 lines, 'ok' fits in 1
    const probe: CaptionProbe = {
      sceneH: 360,
      maxLines: 2,
      measure: (text) => (text.startsWith('This') ? { lines: 4, bottomY: 340 } : { lines: 1, bottomY: 330 }),
    };
    const diags = lintNarration(timing, { caption: probe, warnings: false });
    const fit = find(diags, 'caption-fit', 'tall');
    expect(fit).toBeDefined();
    expect(fit!.tier).toBe(1);
    expect(fit!.message).toMatch(/over maxLines/);
    expect(find(diags, 'caption-fit', 'ok')).toBeUndefined();
  });

  it('caption-fit flags a within-maxLines block that runs off the bottom', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 4,
      captionMode: 'burn',
      segments: [{ id: 'low', text: 'fits lines but too low', start: 0, duration: 4, file: 'a.wav' }],
    };
    const probe: CaptionProbe = { sceneH: 360, maxLines: 2, measure: () => ({ lines: 2, bottomY: 380 }) };
    const fit = find(lintNarration(timing, { caption: probe, warnings: false }), 'caption-fit', 'low');
    expect(fit).toBeDefined();
    expect(fit!.message).toMatch(/overflows the frame/);
  });

  it('caption-fit is Tier-2 WARN by default (sidecar): overflow does not gate CI, carries a nudge', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 4,
      // NO captionMode / captionMaxLines declared → sidecar semantics → warn-only
      segments: [{ id: 'tall', text: 'This caption wraps to too many lines', start: 0, duration: 4, file: 'a.wav' }],
    };
    const probe: CaptionProbe = { sceneH: 360, maxLines: 2, measure: () => ({ lines: 4, bottomY: 340 }) };
    const diags = lintNarration(timing, { caption: probe });
    const fit = find(diags, 'caption-fit', 'tall');
    expect(fit).toBeDefined();
    expect(fit!.tier).toBe(2);
    expect(fit!.severity).toBe('warn');
    // the nudge tells the author exactly how to promote it to a hard gate
    expect(fit!.message).toMatch(/warn-only until you declare maxLines or captionMode:"burn"/);
    // a sidecar project with no declaration exits 0 out of the box
    expect(hasErrors(diags)).toBe(false);
  });

  it('caption-fit escalates to Tier-1 ERROR when the script declares captionMode:"burn"', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 4,
      captionMode: 'burn',
      segments: [{ id: 'tall', text: 'This caption wraps to too many lines', start: 0, duration: 4, file: 'a.wav' }],
    };
    const probe: CaptionProbe = { sceneH: 360, maxLines: 2, measure: () => ({ lines: 4, bottomY: 340 }) };
    const diags = lintNarration(timing, { caption: probe });
    const fit = find(diags, 'caption-fit', 'tall');
    expect(fit).toBeDefined();
    expect(fit!.tier).toBe(1);
    expect(fit!.severity).toBe('error');
    // no nudge on the hard-gate variant
    expect(fit!.message).not.toMatch(/warn-only until/);
    expect(hasErrors(diags)).toBe(true);
  });

  it('caption-fit escalates to Tier-1 when the script declares a captionMaxLines budget', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 4,
      captionMaxLines: 2,
      segments: [{ id: 'tall', text: 'This caption wraps to too many lines', start: 0, duration: 4, file: 'a.wav' }],
    };
    const probe: CaptionProbe = { sceneH: 360, maxLines: 2, measure: () => ({ lines: 4, bottomY: 340 }) };
    const diags = lintNarration(timing, { caption: probe });
    const fit = find(diags, 'caption-fit', 'tall');
    expect(fit!.tier).toBe(1);
    expect(hasErrors(diags)).toBe(true);
  });

  it('a clean timing yields no Tier-1 diagnostics', () => {
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 4,
      segments: [
        { id: 'a', text: 'Nice and readable', start: 0, duration: 2, file: 'a.wav', maxSec: 3 },
        { id: 'b', text: 'Also fine here', start: 2, duration: 2, file: 'b.wav', maxSec: 3 },
      ],
    };
    const probe: CaptionProbe = { sceneH: 360, maxLines: 2, measure: () => ({ lines: 1, bottomY: 330 }) };
    const diags = lintNarration(timing, { caption: probe });
    expect(hasErrors(diags)).toBe(false);
  });
});

describe('fixDiff (--fix is a suggestion, never a write)', () => {
  it('emits a git-apply-able budgets bump rounded up to a tenth', () => {
    const diags: Diagnostic[] = [
      {
        rule: 'anchor-budget',
        tier: 1,
        severity: 'error',
        id: 'seg',
        message: 'over',
        detail: { duration: 3.24, maxSec: 2.5, overBy: 0.74 },
      },
    ];
    const diff = fixDiff(diags, 'scene.narration.json', { budgets: { seg: 2.5 } });
    expect(diff).toMatch(/--- a\/scene\.narration\.json/);
    expect(diff).toMatch(/\+\+\+ b\/scene\.narration\.json/);
    expect(diff).toContain('"seg": 3.3'); // 3.24 → ceil to tenth
    expect(diff).toContain('-'); // a removal line for the old value
  });

  it('no anchor-budget diagnostics → empty diff (nothing to suggest)', () => {
    expect(fixDiff([], 'scene.narration.json', {})).toBe('');
  });
});

describe('narrationLintCommand (end-to-end, real Skia caption geometry)', () => {
  const FONT_PATH = fileURLToPath(new URL('../../assets/fonts/DejaVuSans.ttf', import.meta.url));

  /** a scene module with a plain caption node + a real font, like golden-captions.
   *  Plain (no autoFit) is the common case: a too-long caption wraps top-down
   *  off a fixed baseline and overflows the frame — exactly the lint's target. */
  function sceneSrc(timingPath: string): string {
    return `import { timeline } from '@glissade/core';
import { captionNode, captionTrack, narration } from '@glissade/narrate';
import { Rect, createScene } from '@glissade/scene';
import { readFileSync } from 'node:fs';
const timing = JSON.parse(readFileSync(${JSON.stringify(timingPath)}, 'utf8'));
const beats = narration(timing);
const SIZE = { w: 640, h: 360 };
export default {
  createScene: () => createScene({
    size: SIZE,
    children: [
      new Rect({ id: 'bg', width: SIZE.w, height: SIZE.h, position: [320, 180], fill: '#10131a' }),
      captionNode(SIZE, { fontFamily: 'DejaVu Sans' }),
    ],
  }),
  timeline: timeline({
    fps: 60,
    duration: beats.totalDuration + 0.5,
    tracks: [captionTrack(timing)],
    assets: { 'DejaVu Sans': { kind: 'font', url: ${JSON.stringify(FONT_PATH)} } },
  }),
};
`;
  }

  it('flags a planted over-CPS segment + over-budget anchor + overflowing caption; exits non-zero', async () => {
    const base = join(dir, 'planted');
    writeFileSync(`${base}.ts`, sceneSrc(`${base}.narration.timing.json`));
    const timing: NarrationTiming = {
      timingVersion: 1,
      provider: 'fake',
      providerVersion: 'fake-1',
      totalDuration: 7,
      // burn captions → caption-fit is a Tier-1 hard gate (the assertion below)
      captionMode: 'burn',
      segments: [
        // over-CPS: 56 chars in 1.5s ≈ 37 cps
        { id: 'dense', text: 'A wall of words crammed into a beat far too small now', start: 0, duration: 1.5, file: 'a.wav' },
        // over-budget: 3.5s vs 2.0 maxSec
        { id: 'long', text: 'A measured beat', start: 1.5, duration: 3.5, file: 'b.wav', maxSec: 2.0 },
        // overflow: a very long single caption wraps past 2 lines at this width
        {
          id: 'wide',
          text: 'This is an extremely long caption that will certainly wrap to far more than two lines inside the narrow caption box width and overflow',
          start: 5,
          duration: 2,
          file: 'c.wav',
        },
      ],
    };
    writeFileSync(`${base}.narration.timing.json`, JSON.stringify(timing, null, 2) + '\n');

    const result = await narrationLintCommand({ input: `${base}.ts` });
    const rules = new Set(result.diagnostics.filter((d) => d.tier === 1).map((d) => d.rule));
    expect(rules.has('reading-speed')).toBe(true);
    expect(rules.has('anchor-budget')).toBe(true);
    expect(rules.has('caption-fit')).toBe(true);
    expect(result.hasErrors).toBe(true);
    // the JSON path is machine-readable
    const json = await narrationLintCommand({ input: `${base}.ts`, json: true });
    const parsed = JSON.parse(json.output) as { hasErrors: boolean; diagnostics: Diagnostic[] };
    expect(parsed.hasErrors).toBe(true);
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
  }, 60_000);

  it('the committed clean golden-captions fixture passes (exit 0)', async () => {
    const result = await narrationLintCommand({ input: CLEAN_MODULE });
    // no Tier-1 errors on the real, committed corpus scene
    expect(result.diagnostics.filter((d) => d.tier === 1)).toEqual([]);
    expect(result.hasErrors).toBe(false);
  }, 60_000);
});
