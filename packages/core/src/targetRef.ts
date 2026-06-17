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
  constructor(message?: string) {
    super(
      message ??
        'tween target is not addressable: pass a target string ("node/prop") or a property ' +
          'signal of a node that has an explicit id (§3.1 — anonymous nodes cannot be track targets)',
    );
    this.name = 'UnresolvableTargetError';
  }
}

/** The node-id portion of a canonical `nodeId/prop.path` target. */
export function targetNodeId(target: string): string {
  const slash = target.indexOf('/');
  return slash < 0 ? target : target.slice(0, slash);
}

/**
 * The single editable-host rule (§6.4 sub-decision, the 0.9 locked predicate):
 * only a node with an EXPLICIT, non-structural id can host an editable or
 * editor-created track. Structural fallback ids (`~Type.ordinal`, §6.5) are
 * inspection-only and reorder-fragile, so they are never editable nor valid
 * track targets. Lives here (the addressing module) so the builder guard, the
 * scene, and the studio host all share ONE definition.
 */
export function isEditableNodeId(id: string | undefined | null): id is string {
  return typeof id === 'string' && id.length > 0 && id !== '__root' && !id.startsWith('~');
}

export function resolveTweenTarget(target: TweenTarget): string {
  const path = typeof target === 'string' ? target : (target as TargetCarrier)[TARGET_PATH];
  if (typeof path !== 'string') throw new UnresolvableTargetError();
  if (targetNodeId(path).startsWith('~')) {
    throw new UnresolvableTargetError(
      `'${path}': structural ids (~Type.ordinal) are inspection-only and cannot be track targets (§6.5) — give the node an explicit id`,
    );
  }
  return path;
}
