/**
 * Target references (DESIGN.md §2.6): the builder accepts either a canonical
 * target string ('circle/opacity') or a property signal that carries its own
 * path — attached by the scene package at node construction via TARGET_PATH.
 */

export const TARGET_PATH = Symbol.for('glissade.targetPath');

export interface TargetCarrier {
  [TARGET_PATH]?: string;
}

/**
 * A target string, or any object carrying TARGET_PATH (property signals of
 * id-bearing nodes). Typed as `object` because signals are callables and the
 * symbol prop is attached dynamically; resolution is checked at build time.
 */
export type TweenTarget = string | object;

export class UnresolvableTargetError extends Error {
  constructor() {
    super(
      'tween target is not addressable: pass a target string ("node/prop") or a property ' +
        'signal of a node that has an explicit id (§3.1 — anonymous nodes cannot be track targets)',
    );
    this.name = 'UnresolvableTargetError';
  }
}

export function resolveTweenTarget(target: TweenTarget): string {
  if (typeof target === 'string') return target;
  const path = (target as TargetCarrier)[TARGET_PATH];
  if (typeof path !== 'string') throw new UnresolvableTargetError();
  return path;
}
