import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LottieImportError, importLottie } from '../src/index.js';
import { doc, redFill, shapeLayer, triangleSh } from './helpers.js';

const importError = (json: unknown, allowDegraded = false): LottieImportError => {
  try {
    importLottie(json, { allowDegraded });
  } catch (err) {
    expect(err).toBeInstanceOf(LottieImportError);
    return err as LottieImportError;
  }
  throw new Error('expected importLottie to throw');
};

describe('fail-fast feature audit', () => {
  it('collects EVERY unsupported feature in one error, not one per run', () => {
    const json = doc([
      { ty: 0, nm: 'pre', ind: 1, ip: 0, op: 50, st: 0, ks: {}, refId: 'comp0' }, // precomp
      shapeLayer(
        [
          triangleSh(),
          { ty: 'tm', nm: 'trim' }, // trim paths
          { ty: 'gs', nm: 'gstroke' }, // gradient stroke (still unsupported — stroke is a color string)
          redFill,
        ],
        {},
        { ind: 2, nm: 'shapes', masksProperties: [{}], tm: { k: 0 } },
      ),
    ]);
    const err = importError(json);
    expect(err.problems).toHaveLength(5);
    const text = err.problems.join('\n');
    expect(text).toContain('[unsupported-layer-type] precomp');
    expect(text).toContain('[unsupported-masking]');
    expect(text).toContain('[unsupported-time-remap]');
    expect(text).toContain('[unsupported-shape-item] trim paths');
    expect(text).toContain('[unsupported-shape-item] gradient stroke');
  });

  it('rejects skew, expressions, and merge modes ≠ 1 by default', () => {
    const json = doc([
      shapeLayer(
        [triangleSh(), { ty: 'mm', mm: 4 }, redFill],
        { sk: { k: 15 }, r: { k: 0, x: 'var $bm_rt = time;' } },
      ),
    ]);
    const err = importError(json);
    const text = err.problems.join('\n');
    expect(text).toContain('[unsupported-transform] skew');
    expect(text).toContain('[unsupported-expression]');
    expect(text).toContain('[unsupported-shape-modifier] merge paths mode 4');
    expect(text).toContain('allowDegraded'); // degradable rejections say how to proceed
  });

  it('allowDegraded downgrades ONLY the degradable subset to warnings', () => {
    const degradable = doc([
      shapeLayer([triangleSh(), { ty: 'mm', mm: 4 }, redFill], { r: { k: 0, x: 'expr' } }),
    ]);
    const result = importLottie(degradable, { allowDegraded: true });
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join('\n')).toContain('unsupported-expression');
    expect(result.warnings.join('\n')).toContain('merge paths mode 4');
    // non-degradable features still reject even with allowDegraded
    const hard = doc([{ ty: 5, nm: 't', ind: 0, ip: 0, op: 50, st: 0, ks: {} }]);
    expect(() => importLottie(hard, { allowDegraded: true })).toThrow(LottieImportError);
  });

  it('a degraded mm mode ≠ 1 is skipped: geometry imports unmerged', () => {
    const json = doc([shapeLayer([triangleSh(1), triangleSh(2), { ty: 'mm', mm: 4 }, redFill])]);
    const result = importLottie(json, { allowDegraded: true });
    // without the (unsupported) intersect, the style applies per geometry
    const pathCount = result.timeline.tracks.length; // no tracks; count nodes instead
    expect(pathCount).toBe(0);
    let paths = 0;
    const visit = (nodes: typeof result.nodes): void => {
      for (const n of nodes) {
        if (n.kind === 'path') paths++;
        if (n.kind === 'group') visit(n.children);
      }
    };
    visit(result.nodes);
    expect(paths).toBe(2);
  });

  it('static zero skew (the exporter default) passes', () => {
    const json = doc([shapeLayer([triangleSh(), redFill], { sk: { k: 0 }, sa: { k: 0 } })]);
    expect(() => importLottie(json)).not.toThrow();
  });

  it('rejects non-documents with a clear error', () => {
    expect(() => importLottie({ foo: 1 })).toThrow(/invalid-document/);
  });

  it('accepts the real docs_text sample (static+animated text layer) and builds a Text node', () => {
    const json = JSON.parse(readFileSync(new URL('./fixtures/docs_text.json', import.meta.url), 'utf8'));
    const result = importLottie(json);
    let texts = 0;
    const visit = (nodes: typeof result.nodes): void => {
      for (const n of nodes) {
        if (n.kind === 'text') {
          texts++;
          expect(n.text).toBe('Text'); // t.d.k[0].s.t
          expect(n.fontFamily).toBe('sans'); // fonts.list lookup by fName
        }
        if (n.kind === 'group') visit(n.children);
      }
    };
    visit(result.nodes);
    expect(texts).toBe(1);
    // the text CHANGES across the two doc keyframes → a string track was emitted
    expect(result.timeline.tracks.some((t) => t.type === 'string')).toBe(true);
  });

  it('rejects a text layer whose animator list (t.a) is non-empty', () => {
    const json = doc([
      {
        ty: 5,
        nm: 't',
        ind: 0,
        ip: 0,
        op: 50,
        st: 0,
        ks: {},
        t: { a: [{ nm: 'sel' }], d: { k: [{ t: 0, s: { t: 'x', f: 'sans', s: 20, fc: [0, 0, 0], j: 0 } }] } },
      },
    ]);
    const err = importError(json);
    expect(err.problems.join('\n')).toContain('unsupported-text-animator');
  });
});
