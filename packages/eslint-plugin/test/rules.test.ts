import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import plugin from '../src/index.js';

// wire RuleTester's lifecycle to vitest (no eslint globals in this runner)
RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

const rt = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

rt.run('no-wall-clock', plugin.rules['no-wall-clock'], {
  valid: [
    'const t = ctx.time;',
    'const d = new Date(2020, 0, 1);', // explicit args are deterministic
    'random(seed);',
  ],
  invalid: [
    { code: 'const t = Date.now();', errors: [{ messageId: 'wallClock' }] },
    { code: 'const t = performance.now();', errors: [{ messageId: 'wallClock' }] },
    { code: 'const d = new Date();', errors: [{ messageId: 'wallClock' }] },
    { code: 'const d = Date();', errors: [{ messageId: 'wallClock' }] },
    { code: 'setTimeout(fn, 16);', errors: [{ messageId: 'wallClock' }] },
    { code: 'requestAnimationFrame(fn);', errors: [{ messageId: 'wallClock' }] },
  ],
});

rt.run('no-unseeded-random', plugin.rules['no-unseeded-random'], {
  valid: ['const r = random(seed);', 'const m = Math.max(a, b);'],
  invalid: [{ code: 'const r = Math.random();', errors: [{ messageId: 'random' }] }],
});

rt.run('no-async-in-evaluate', plugin.rules['no-async-in-evaluate'], {
  valid: ['function emit() { return draw(); }', 'const f = () => sample(t);'],
  invalid: [
    { code: 'async function emit() {}', errors: [{ messageId: 'async' }] },
    { code: 'const f = async () => {};', errors: [{ messageId: 'async' }] },
    { code: 'function f() { return (async () => await g())(); }', errors: [{ messageId: 'async' }, { messageId: 'async' }] },
  ],
});
