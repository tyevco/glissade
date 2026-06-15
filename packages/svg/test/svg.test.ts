import { describe, expect, it } from 'vitest';
import { Circle, Group, Path, Rect } from '@glissade/scene';
import { importSvg, parseSvgPath, parseXml, convertSvg } from '../src/index.js';

describe('parseSvgPath', () => {
  it('parses absolute M/L/H/V/Z into PathSeg[]', () => {
    expect(parseSvgPath('M10 20 L30 20 H40 V50 Z')).toEqual([
      ['M', 10, 20],
      ['L', 30, 20],
      ['L', 40, 20],
      ['L', 40, 50],
      ['Z'],
    ]);
  });

  it('resolves relative commands against the current point', () => {
    expect(parseSvgPath('M10 10 l5 0 l0 5')).toEqual([
      ['M', 10, 10],
      ['L', 15, 10],
      ['L', 15, 15],
    ]);
  });

  it('repeats an implicit command (M followed by extra coords → L)', () => {
    expect(parseSvgPath('M0 0 1 1 2 2')).toEqual([
      ['M', 0, 0],
      ['L', 1, 1],
      ['L', 2, 2],
    ]);
  });

  it('reflects the smooth-curve control point for S after C', () => {
    const segs = parseSvgPath('M0 0 C10 0 10 10 20 10 S30 20 40 10');
    expect(segs[1]).toEqual(['C', 10, 0, 10, 10, 20, 10]);
    // reflected first control = 2*current - lastCtrl = (2*20-10, 2*10-10) = (30, 10)
    expect(segs[2]).toEqual(['C', 30, 10, 30, 20, 40, 10]);
  });

  it('promotes a quadratic and keeps a Q segment', () => {
    const segs = parseSvgPath('M0 0 Q5 10 10 0');
    expect(segs).toEqual([
      ['M', 0, 0],
      ['Q', 5, 10, 10, 0],
    ]);
  });

  it('converts an arc to an E (ellipse-arc) segment', () => {
    const segs = parseSvgPath('M0 0 A5 5 0 0 1 10 0');
    expect(segs[0]).toEqual(['M', 0, 0]);
    const arc = segs[1]!;
    expect(arc[0]).toBe('E');
    // semicircle: center at (5,0), radii 5
    expect(arc[1]).toBeCloseTo(5, 6);
    expect(arc[2]).toBeCloseTo(0, 6);
    expect(arc[3]).toBeCloseTo(5, 6);
    expect(arc[4]).toBeCloseTo(5, 6);
  });

  it('degrades a zero-radius arc to a line', () => {
    expect(parseSvgPath('M0 0 A0 0 0 0 1 10 0')).toEqual([
      ['M', 0, 0],
      ['L', 10, 0],
    ]);
  });
});

describe('parseXml', () => {
  it('builds a nested element tree with attributes', () => {
    const root = parseXml('<svg width="100"><g fill="red"><rect x="1"/></g></svg>');
    expect(root?.tag).toBe('svg');
    expect(root?.attrs['width']).toBe('100');
    const g = root!.children[0]!;
    expect(g.tag).toBe('g');
    expect(g.attrs['fill']).toBe('red');
    expect(g.children[0]!.tag).toBe('rect');
  });

  it('handles single-quoted attrs, self-closing tags, comments and the XML decl', () => {
    const root = parseXml(`<?xml version='1.0'?><!-- c --><svg><circle r='5'/></svg>`);
    expect(root?.tag).toBe('svg');
    expect(root?.children[0]!.attrs['r']).toBe('5');
  });

  it('returns null when there is no element', () => {
    expect(parseXml('   <!-- nothing -->  ')).toBeNull();
  });
});

describe('convertSvg', () => {
  it('reads size from width/height', () => {
    const { size } = convertSvg(parseXml('<svg width="320" height="240"></svg>')!);
    expect(size).toEqual({ w: 320, h: 240 });
  });

  it('falls back to viewBox for size', () => {
    const { size } = convertSvg(parseXml('<svg viewBox="0 0 64 48"></svg>')!);
    expect(size).toEqual({ w: 64, h: 48 });
  });

  it('maps a rect to a centered Rect node with cornerRadius', () => {
    const { root } = convertSvg(parseXml('<svg><rect x="10" y="20" width="40" height="60" rx="5" fill="#f00"/></svg>')!);
    const rect = root.children[0] as Rect;
    expect(rect).toBeInstanceOf(Rect);
    expect(rect.position()).toEqual([30, 50]);
    expect(rect.width()).toBe(40);
    expect(rect.height()).toBe(60);
    expect(rect.fill()).toBe('#f00');
  });

  it('maps circle/path and defaults fill to black (SVG initial value)', () => {
    const { root } = convertSvg(parseXml('<svg><circle cx="5" cy="6" r="7"/><path d="M0 0 L10 10"/></svg>')!);
    const circle = root.children[0] as Circle;
    expect(circle).toBeInstanceOf(Circle);
    expect(circle.position()).toEqual([5, 6]);
    expect(circle.radius()).toBe(7);
    expect(circle.fill()).toBe('black');
    expect(root.children[1]).toBeInstanceOf(Path);
  });

  it('inherits paint from a parent <g>', () => {
    const { root } = convertSvg(parseXml('<svg><g fill="green"><rect width="2" height="2"/></g></svg>')!);
    const g = root.children[0] as Group;
    expect(g).toBeInstanceOf(Group);
    expect((g.children[0] as Rect).fill()).toBe('green');
  });

  it('wraps a transformed element in a Group carrying the TRS', () => {
    const { root } = convertSvg(parseXml('<svg><rect width="2" height="2" transform="translate(10 20)"/></svg>')!);
    const wrap = root.children[0] as Group;
    expect(wrap).toBeInstanceOf(Group);
    expect(wrap.position()).toEqual([10, 20]);
    expect(wrap.children[0]).toBeInstanceOf(Rect);
  });

  it('decomposes a rotate transform into a rotation', () => {
    const { root } = convertSvg(parseXml('<svg><g transform="rotate(90)"></g></svg>')!);
    const g = root.children[0] as Group;
    expect(g.rotation()).toBeCloseTo(90, 4);
  });

  it('warns and drops unsupported elements', () => {
    const { root, warnings } = convertSvg(parseXml('<svg><text>hi</text><rect width="1" height="1"/></svg>')!);
    expect(root.children).toHaveLength(1);
    expect(warnings.some((w) => w.includes('<text>'))).toBe(true);
  });

  it('warns and drops a url() gradient paint', () => {
    const { warnings } = convertSvg(parseXml('<svg><rect width="1" height="1" fill="url(#g)"/></svg>')!);
    expect(warnings.some((w) => w.includes('gradient'))).toBe(true);
  });
});

describe('importSvg', () => {
  it('returns size, root group, and a renderable SceneModule', () => {
    const result = importSvg('<svg width="120" height="80"><circle cx="60" cy="40" r="20" fill="#39f"/></svg>');
    expect(result.size).toEqual({ w: 120, h: 80 });
    expect(result.root).toBeInstanceOf(Group);
    const mod = result.toSceneModule();
    const scene = mod.createScene();
    expect(scene.size).toEqual({ w: 120, h: 80 });
  });

  it('throws when there is no <svg> root', () => {
    expect(() => importSvg('<html></html>')).toThrow(/no root <svg>/);
  });
});
