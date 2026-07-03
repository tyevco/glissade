/**
 * `gs describe --lint` (0.47 "verifiable ground-truth") — the describe()↔bundle
 * drift guard, factored PURE.
 *
 * describe() curates the node/helper/surface taxonomy by hand for the members that
 * live ABOVE `scene` in the dep graph (player/backend factories scene can't import).
 * That curation can silently drift from what actually ships on `window.glissade`
 * (three historical drifts: `fitTextSize` missing, `ClipRegion` surfaced as a value,
 * `defineComponent` shorthand). This lint reconciles the manifest against the REAL
 * runtime surface and fails loud on any gap — the same cross-check
 * `@glissade/browser`'s smoke test seeded (iterate describe().helpers, assert each
 * resolves), generalized to the whole surface and wired as a CI gate.
 *
 * PURE: `(manifest, runtimeSurface) => violations[]`. The caller injects the
 * surface — the `check:describe` CI gate injects the built `@glissade/browser`
 * bundle (the authoritative IIFE surface); `gs describe --lint` injects the
 * headless surface it can assemble ({@link collectRuntimeSurface}) and exempts the
 * few browser-only helpers a Node CLI can't import.
 */

import type { ApiManifest } from '@glissade/scene/describe';
import { usageArity } from '@glissade/scene/describe';

export type LintKind = 'missing' | 'not-callable' | 'type-as-value' | 'arity';

export interface LintViolation {
  /** Which invariant broke. */
  readonly kind: LintKind;
  /** The offending export name. */
  readonly name: string;
  /** One line: what's wrong + how to fix it. */
  readonly detail: string;
}

export interface LintOptions {
  /**
   * Names the caller could NOT load in this runtime (e.g. browser-only helpers a
   * headless Node CLI can't import) — reported as skipped, never a violation. The
   * `check:describe` CI gate (which loads the whole `@glissade/browser` bundle)
   * passes none, so it covers these.
   */
  readonly exempt?: ReadonlySet<string>;
}

/**
 * Type-only surface names that ARE legitimately a runtime class/value on the
 * bundle (a driver class exported under the same name as its type). Empty today —
 * the current type-only surface (Paint/PathValue/FontAxes) erases entirely — but a
 * seam so a future `FollowPath`-style class-and-type name doesn't false-positive.
 */
const RUNTIME_TYPE_ALLOWLIST = new Set<string>([]);

/**
 * Reconcile a describe() manifest against a runtime surface record. Returns every
 * violation (empty = clean); the CLI prints them and exits non-zero.
 *
 * Assertions:
 *  (a) every callable the manifest advertises (node constructor, helper, surface
 *      value function/constructor) resolves to a `function` on the bundle;
 *  (b) every surface `kind:'type'` name is truly type-only (erases at runtime) —
 *      a type surfaced as a runtime value is the drift this catches;
 *  (c) arity: a documented callable must not REQUIRE materially more positional
 *      args than its usage advertises (`Function.length > documented total + 1`;
 *      tolerant by one — a trailing optional like `measurer` legitimately lifts
 *      `Function.length`).
 */
export function describeLint(
  manifest: ApiManifest,
  surface: Record<string, unknown>,
  opts: LintOptions = {},
): LintViolation[] {
  const exempt = opts.exempt ?? new Set<string>();
  const out: LintViolation[] = [];
  const isFn = (n: string): boolean => typeof surface[n] === 'function';
  const present = (n: string): boolean => surface[n] !== undefined;

  // (a) callable resolution — nodes + helpers + surface value functions/constructors.
  const callables = new Set<string>();
  for (const name of Object.keys(manifest.nodes)) callables.add(name);
  for (const h of manifest.helpers) callables.add(h.name);
  for (const e of manifest.surface ?? []) {
    if (e.kind === 'value' && (e.form === 'constructor' || e.form === 'function')) callables.add(e.name);
  }
  for (const name of [...callables].sort()) {
    if (exempt.has(name) || isFn(name)) continue;
    out.push(
      present(name)
        ? { kind: 'not-callable', name, detail: `window.glissade.${name} is a ${typeof surface[name]}, expected a function` }
        : { kind: 'missing', name, detail: `window.glissade.${name} is documented but MISSING from the runtime bundle` },
    );
  }

  // value OBJECTS (form 'object', e.g. easings): must be present, need not be callable.
  for (const e of manifest.surface ?? []) {
    if (e.kind === 'value' && e.form === 'object' && !exempt.has(e.name) && !present(e.name)) {
      out.push({ kind: 'missing', name: e.name, detail: `window.glissade.${e.name} (value export) is MISSING from the runtime bundle` });
    }
  }

  // (b) type-only names must stay type-only (erase at runtime).
  for (const e of manifest.surface ?? []) {
    if (e.kind === 'type' && !exempt.has(e.name) && present(e.name) && !RUNTIME_TYPE_ALLOWLIST.has(e.name)) {
      out.push({
        kind: 'type-as-value',
        name: e.name,
        detail: `'${e.name}' is tagged kind:'type' but resolves to a runtime ${typeof surface[e.name]} — surface it as kind:'value' or remove it`,
      });
    }
  }

  // (c) arity drift.
  for (const h of manifest.helpers) {
    if (exempt.has(h.name)) continue;
    const fn = surface[h.name];
    if (typeof fn !== 'function') continue; // (a) already flagged it
    const total = usageArity(h.usage);
    if (total !== undefined && fn.length > total + 1) {
      out.push({
        kind: 'arity',
        name: h.name,
        detail: `window.glissade.${h.name} takes ${fn.length} params but its usage documents ${total} — update describe()'s usage or the signature`,
      });
    }
  }

  return out;
}

/**
 * Assemble the runtime surface a HEADLESS `gs describe --lint` can reach: the
 * embed authoring packages the CLI legitimately depends on (core + scene + their
 * tree-shakeable subpaths + player), merged into one record. Browser-only modules
 * (`@glissade/backend-canvas2d/snapshot`, `@glissade/element`) are NOT CLI deps —
 * importing them throws, so those specifiers are collected into `unreachable` and
 * the caller exempts the helpers they'd have provided. (The `check:describe` CI
 * gate injects the built `@glissade/browser` bundle instead, so it verifies those
 * too.)
 */
export async function collectRuntimeSurface(
  manifest: ApiManifest,
): Promise<{ surface: Record<string, unknown>; unreachable: Set<string> }> {
  const modules = new Set<string>([
    '@glissade/core',
    '@glissade/scene',
    '@glissade/scene/describe',
    '@glissade/scene/layout-ctors',
  ]);
  for (const h of manifest.helpers) modules.add(h.import);
  const surface: Record<string, unknown> = {};
  const unreachable = new Set<string>();
  for (const spec of modules) {
    try {
      Object.assign(surface, await import(spec));
    } catch {
      unreachable.add(spec);
    }
  }
  return { surface, unreachable };
}

/** The exempt name-set for a headless lint: helper names whose import module was unreachable. */
export function exemptFromUnreachable(manifest: ApiManifest, unreachable: ReadonlySet<string>): Set<string> {
  const exempt = new Set<string>();
  for (const h of manifest.helpers) if (unreachable.has(h.import)) exempt.add(h.name);
  return exempt;
}
