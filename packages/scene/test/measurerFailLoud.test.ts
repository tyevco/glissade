/**
 * measurer-fail-loud (card nUagJ5351H7t) — the INVERTED default: every
 * text-geometry getter FAILS LOUD (`MeasurerRequiredError`) when it would fall to
 * the rough per-character estimate, unless `{ estimate: true }` opts in (the SOLE
 * opt-out). Covers the six contract cases: implicit throw, estimate opt-out,
 * explicit-estimatingMeasurer throw, real-measurer no-throw, barrel instanceof,
 * and describe() legibility of the `estimate` option.
 */
import { describe as vdescribe, afterEach, expect, it } from 'vitest';
import {
  Text,
  MeasurerRequiredError,
  estimatingMeasurer,
  setDefaultMeasurer,
  type TextMeasurer,
} from '../src/index.js';
import { splitText, fitText, fitTextSize } from '../src/type.js';
import { describe as describeApi } from '../src/describe.js';

// a REAL (non-estimating) measurer — a distinct object, so isEstimatingMeasurer is
// false and the fail-loud gate lets it through.
const real: TextMeasurer = {
  measureText: (t, f) => ({ width: t.length * f.size * 0.6, ascent: f.size * 0.8, descent: f.size * 0.2 }),
};

const mkText = () => new Text({ id: 't', text: 'hello world', fontSize: 20 });

vdescribe('measurer-fail-loud', () => {
  afterEach(() => setDefaultMeasurer(null));

  // 1. IMPLICIT estimate (no measurer, no default, no flag) on each getter → throws.
  vdescribe('implicit estimate throws MeasurerRequiredError on every getter', () => {
    const cases: [string, () => unknown][] = [
      ['measuredSize', () => mkText().measuredSize()],
      ['intrinsicSize', () => mkText().intrinsicSize()],
      ['wordBoxes', () => mkText().wordBoxes()],
      ['lineBoxes', () => mkText().lineBoxes()],
      ['graphemeBoxes', () => mkText().graphemeBoxes()],
      ['splitText', () => splitText({ id: 't', text: 'a b c', fontSize: 20 }, { by: 'word' })],
      ['fitText', () => fitText(mkText(), { maxW: 80 })],
      ['fitTextSize', () => fitTextSize(mkText(), { maxW: 80 })],
    ];
    for (const [name, run] of cases) {
      it(`${name}() throws with a message that names the fix + the site`, () => {
        setDefaultMeasurer(null);
        let caught: unknown;
        try {
          run();
        } catch (e) {
          caught = e;
        }
        expect(caught, `${name} should throw`).toBeInstanceOf(MeasurerRequiredError);
        const msg = (caught as Error).message;
        expect(msg).toMatch(/text geometry needs a real measurer/); // names the fix
        expect(msg).toMatch(/\{ estimate: true \}/); // the opt-out
        expect(msg).toMatch(/setDefaultMeasurer|setTextMeasurer|\{ measurer \}/); // the real-measurer path
        // the site is NAMED (a getter's own site — measuredSize delegates to
        // Text.intrinsicSize, fitTextSize/fitText both report 'fitText').
        expect(msg).toMatch(/^(Text\.\w+|splitText|fitText):/);
      });
    }
  });

  // 2. { estimate: true } on each getter → NO throw (uses the estimate).
  vdescribe('{ estimate: true } is the sole opt-out — no throw', () => {
    it('measuredSize / intrinsicSize / wordBoxes / lineBoxes / graphemeBoxes', () => {
      setDefaultMeasurer(null);
      expect(() => mkText().measuredSize(undefined, { estimate: true })).not.toThrow();
      expect(() => mkText().intrinsicSize(undefined, { estimate: true })).not.toThrow();
      expect(() => mkText().wordBoxes(undefined, { estimate: true })).not.toThrow();
      expect(() => mkText().lineBoxes(undefined, { estimate: true })).not.toThrow();
      expect(() => mkText().graphemeBoxes(undefined, { estimate: true })).not.toThrow();
    });
    it('splitText / fitText / fitTextSize', () => {
      setDefaultMeasurer(null);
      expect(() => splitText({ id: 't', text: 'a b c', fontSize: 20 }, { by: 'word', estimate: true })).not.toThrow();
      expect(() => fitText(mkText(), { maxW: 80, estimate: true })).not.toThrow();
      expect(() => fitTextSize(mkText(), { maxW: 80, estimate: true })).not.toThrow();
    });
  });

  // 3. Explicitly passing estimatingMeasurer WITHOUT { estimate: true } → throws.
  vdescribe('explicit estimatingMeasurer without the flag still throws (the B contract)', () => {
    it('measuredSize / wordBoxes / lineBoxes / splitText', () => {
      expect(() => mkText().measuredSize(estimatingMeasurer)).toThrow(MeasurerRequiredError);
      expect(() => mkText().wordBoxes(estimatingMeasurer)).toThrow(MeasurerRequiredError);
      expect(() => mkText().lineBoxes(estimatingMeasurer)).toThrow(MeasurerRequiredError);
      expect(() => splitText({ id: 't', text: 'a b c', fontSize: 20 }, { by: 'word', measurer: estimatingMeasurer })).toThrow(
        MeasurerRequiredError,
      );
    });
    it('explicit estimatingMeasurer WITH { estimate: true } degrades — no throw', () => {
      expect(() => mkText().measuredSize(estimatingMeasurer, { estimate: true })).not.toThrow();
      expect(() =>
        splitText({ id: 't', text: 'a b c', fontSize: 20 }, { by: 'word', measurer: estimatingMeasurer, estimate: true }),
      ).not.toThrow();
    });
  });

  // 4. A real measurer (default registered before construction, OR passed) → no throw.
  vdescribe('a real measurer resolves without the flag', () => {
    it('setDefaultMeasurer(real) before construction → no throw', () => {
      setDefaultMeasurer(real);
      expect(() => mkText().measuredSize()).not.toThrow();
      expect(() => splitText({ id: 't', text: 'a b c', fontSize: 20 }, { by: 'word' })).not.toThrow();
    });
    it('passing a real { measurer } → no throw', () => {
      setDefaultMeasurer(null);
      expect(() => mkText().wordBoxes(real)).not.toThrow();
      expect(() => splitText({ id: 't', text: 'a b c', fontSize: 20 }, { by: 'word', measurer: real })).not.toThrow();
    });
  });

  // 5. MeasurerRequiredError is instanceof-catchable from the SCENE BARREL.
  it('MeasurerRequiredError is instanceof-catchable off the @glissade/scene barrel', () => {
    setDefaultMeasurer(null);
    try {
      mkText().measuredSize();
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MeasurerRequiredError);
      expect(e).toBeInstanceOf(Error);
    }
  });

  // 6. describe() surfaces `{ estimate: true }` as a discoverable option.
  it('describe() surfaces the `estimate` option on the text-geometry entries', () => {
    const manifest = describeApi();
    for (const name of ['splitText', 'fitText', 'fitTextSize', 'revealWords']) {
      const entry = (manifest.surface ?? []).find((e) => e.name === name);
      expect(entry, `${name} on the surface`).toBeDefined();
      const opt = entry!.options?.find((o) => o.name === 'estimate');
      expect(opt, `${name}.options.estimate`).toBeDefined();
      expect(opt!.type).toBe('boolean');
      expect(opt!.default).toBe(false);
    }
  });

  // 7. NAME-THE-FIX must name the fix that WORKS AT THE THROW SITE (edcc finding):
  // the instance getters take a POSITIONAL measurer + a 2nd opts arg, so the message
  // must name the 2nd-arg / 1st-arg forms — NOT the options-object form (which, passed
  // positionally, is treated as the measurer and crashes with a WORSE cryptic error).
  vdescribe('name-the-fix matches the call surface', () => {
    const throwMsg = (run: () => unknown): string => {
      setDefaultMeasurer(null);
      try {
        run();
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    };

    it('positional getters name the 2nd-arg estimate + 1st-arg measurer forms', () => {
      const msg = throwMsg(() => mkText().wordBoxes());
      expect(msg).toMatch(/\{ estimate: true \} as the 2nd arg/);
      expect(msg).toMatch(/a real measurer as the 1st arg/);
      // and NOT the options-object form that would crash if pasted positionally
      expect(msg).not.toMatch(/a real \{ measurer \}/);
    });

    it('options-object fns name the object forms', () => {
      const msg = throwMsg(() => splitText({ id: 't', text: 'a b c', fontSize: 20 }, { by: 'word' }));
      expect(msg).toMatch(/pass \{ estimate: true \} to accept/);
      expect(msg).toMatch(/a real \{ measurer \}/);
      expect(msg).not.toMatch(/as the 2nd arg/);
    });

    it('measuredSize delegates but still names the POSITIONAL fix (positional=true carried)', () => {
      const msg = throwMsg(() => mkText().measuredSize());
      expect(msg).toMatch(/\{ estimate: true \} as the 2nd arg/);
      expect(msg).toMatch(/a real measurer as the 1st arg/);
    });

    // The whole point: the NAMED positional fix actually resolves, at the site.
    it('the named positional fix works: 2nd-arg { estimate: true } does not throw', () => {
      setDefaultMeasurer(null);
      expect(() => mkText().wordBoxes(undefined, { estimate: true })).not.toThrow();
      expect(() => mkText().wordBoxes(estimatingMeasurer, { estimate: true })).not.toThrow();
      expect(() => mkText().wordBoxes(real)).not.toThrow(); // 1st-arg real measurer
    });
  });
});
