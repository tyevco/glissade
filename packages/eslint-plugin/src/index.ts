/**
 * @glissade/eslint-plugin — static enforcement of the determinism contract
 * (DESIGN.md §5.5) in scene code. Three rules:
 *   - gas/no-wall-clock         : no Date.now/performance.now/new Date()/setTimeout/…
 *   - gas/no-unseeded-random    : no Math.random() (use the seeded random(seed)/Rng)
 *   - gas/no-async-in-evaluate  : no async/await (evaluate() is synchronous, §2.5)
 * Apply to scene modules + the core/scene evaluation substrate; pair with the
 * runtime render-mode guard, which backstops what static analysis can't see.
 */

import type { Rule } from 'eslint';

/** Loosely-typed AST node accessor — avoids a hard estree dependency. */
interface MemberLike {
  type?: string;
  object?: { type?: string; name?: string };
  property?: { type?: string; name?: string };
}

function isMember(node: unknown, object: string, property: string): boolean {
  const m = node as MemberLike;
  return (
    m?.type === 'MemberExpression' &&
    m.object?.type === 'Identifier' &&
    m.object.name === object &&
    m.property?.type === 'Identifier' &&
    m.property.name === property
  );
}

const noWallClock: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban wall-clock reads in deterministic scene code (§5.5 pt.1)' },
    messages: {
      wallClock:
        'Wall-clock source `{{name}}` is non-deterministic. Time enters scene code only via evaluate(scene, timeline, t) — read ctx.time/frame instead.',
    },
    schema: [],
  },
  create(context) {
    const bannedCalls = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame']);
    return {
      CallExpression(node) {
        const c = node.callee;
        if (isMember(c, 'Date', 'now')) context.report({ node, messageId: 'wallClock', data: { name: 'Date.now' } });
        else if (isMember(c, 'performance', 'now')) {
          context.report({ node, messageId: 'wallClock', data: { name: 'performance.now' } });
        } else if (c.type === 'Identifier') {
          if (bannedCalls.has(c.name)) context.report({ node, messageId: 'wallClock', data: { name: c.name } });
          else if (c.name === 'Date') context.report({ node, messageId: 'wallClock', data: { name: 'Date()' } });
        }
      },
      NewExpression(node) {
        // `new Date(2020, 0, 1)` is deterministic; only the argless `new Date()` reads now
        if (node.callee.type === 'Identifier' && node.callee.name === 'Date' && node.arguments.length === 0) {
          context.report({ node, messageId: 'wallClock', data: { name: 'new Date()' } });
        }
      },
    };
  },
};

const noUnseededRandom: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban Math.random() in deterministic scene code (§5.5 pt.2)' },
    messages: {
      random: 'Math.random() is non-deterministic. Use the seeded random(seed)/Rng from @glissade/core, reseeded per draw.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isMember(node.callee, 'Math', 'random')) context.report({ node, messageId: 'random' });
      },
    };
  },
};

const noAsyncInEvaluate: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban async/await in the evaluate() path (§2.5: evaluate is synchronous)' },
    messages: {
      async: 'Async/await is banned in scene/evaluate code — evaluate() is synchronous and never awaits (§2.5). Resolve assets before evaluating.',
    },
    schema: [],
  },
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (node.async) context.report({ node, messageId: 'async' });
      },
      FunctionExpression(node) {
        if (node.async) context.report({ node, messageId: 'async' });
      },
      ArrowFunctionExpression(node) {
        if (node.async) context.report({ node, messageId: 'async' });
      },
      AwaitExpression(node) {
        context.report({ node, messageId: 'async' });
      },
    };
  },
};

export const rules = {
  'no-wall-clock': noWallClock,
  'no-unseeded-random': noUnseededRandom,
  'no-async-in-evaluate': noAsyncInEvaluate,
};

const allRules = {
  'gas/no-wall-clock': 'error',
  'gas/no-unseeded-random': 'error',
  'gas/no-async-in-evaluate': 'error',
} as const;

interface Plugin {
  meta: { name: string };
  rules: typeof rules;
  configs: Record<string, unknown>;
}

const plugin: Plugin = { meta: { name: '@glissade/eslint-plugin' }, rules, configs: {} };

// Flat-config preset: apply all three rules, but never to test files (async
// golden tests legitimately await — the rules can't tell test code from
// evaluate code). Spread into your eslint.config.js and scope with `files` as
// needed: `export default [...glissade.configs.recommended]`.
plugin.configs['recommended'] = [
  {
    name: 'glissade/recommended',
    ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**', '**/tests/**'],
    plugins: { gas: plugin },
    rules: allRules,
  },
];

export default plugin;
