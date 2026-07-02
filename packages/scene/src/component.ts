/**
 * `@glissade/scene/component` — `defineComponent()` (0.36): reusable, typed,
 * describe()-legible animated subscenes. The missing COMPOSITION unit — the
 * user-defined generalization of the built-in `Grid()`/`Chart()`/`splitText()`
 * factories (all already "props → subtree" pure build-time functions).
 *
 *   const LowerThird = defineComponent({
 *     name: 'LowerThird',
 *     props: { name: { type: 'string' }, title: { type: 'string' }, accent: { type: 'color' } },
 *     build: ({ name, title, accent }, cid) => new Group({ id: cid(), children: [
 *       new Rect({ id: cid('bar'), width: 6, height: 40, fill: accent }),
 *       new Text({ id: cid('name'), text: name, ... }),
 *       new Text({ id: cid('title'), text: title, fill: accent, ... }),
 *     ]}),
 *   });
 *
 *   const lt = LowerThird({ id: 'intro', name: 'Ada', title: 'Engineer', accent: '#4ea1ff' });
 *   // scene children: [lt.node]
 *   // animate a child: tl.to(lt.childId('bar') + '/height', 40, { from: 0 })
 *   //   or the ready ids: tl.stagger(lt.targets('bar', 'opacity'), …)
 *
 * PURE build-time fan-out: `build` runs at construction and emits ordinary nodes,
 * so `evaluate()` stays a pure function of time and the goldens hold by
 * construction. Nothing executes at play time.
 *
 * ID-SCOPING is the whole safety story: every instance carries a required stable
 * `id`, and every internal node id is stamped through `cid(sub) = '<id>/<sub>'`,
 * so instancing the SAME component N times (distinct ids) can't collide track
 * targets. Two instances built with the SAME id DO collide — the same footgun
 * `Grid`/`Chart` have; give each instance a unique id.
 *
 * On its OWN tree-shakeable subpath (off the base embed) + re-exported onto the
 * `@glissade/browser` IIFE. `describe().components` lists every component defined
 * so far (side-effect registration on definition — the value-type/examples
 * pattern), so an agent or the studio sees each component's typed prop surface.
 */

import { Group } from './nodes.js';
import type { Node } from './node.js';

/** One prop in a component's public surface — a manifest type + optionality. */
export interface ComponentPropSpec {
  /** the §2.2 value-type / shape id this prop accepts (e.g. 'number', 'color', 'string', 'Node[]'). */
  type: string;
  /** true when the factory REQUIRES it (default false). */
  required?: boolean;
}

/** The props every component instance carries in addition to its own — a stable
 *  id (REQUIRED, the collision-safety anchor) plus the base Group passthrough. */
export interface ComponentBaseProps {
  /** Stable id — REQUIRED; every internal node is namespaced under it. */
  id: string;
}

/** What an instance returns: the subtree + its id + the child-id helpers. */
export interface ComponentInstance {
  /** the built subtree (a Group whose id === the instance id). */
  readonly node: Group;
  /** the instance id (its own namespace root). */
  readonly id: string;
  /** namespace a child id: `childId('bar')` → `'<id>/bar'`; no arg → the root id. */
  childId(sub?: string): string;
  /** ready-to-bind track targets for a child's prop: `['<id>/<child>/<prop>']`. */
  targets(child: string, prop: string): string[];
}

export interface ComponentDef<P extends Record<string, unknown> = Record<string, unknown>> {
  /** the component's type name — surfaced in describe().components, must be unique. */
  name: string;
  /** the public prop surface (names → type/optionality) for describe(). */
  props: { readonly [prop: string]: ComponentPropSpec };
  /**
   * PURE build: given the instance props (incl. the required `id`) and a
   * child-id namer, return the subtree. Runs ONCE at construction; must not
   * read the playhead or any cross-frame state (bind children with tracks/
   * PropInit closures like any node).
   */
  build(props: P & ComponentBaseProps, childId: (sub?: string) => string): Group;
}

export class ComponentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComponentError';
  }
}

/** Join an instance id + a child sub-id into a namespaced target root. */
export function childId(id: string, sub?: string): string {
  return sub === undefined || sub === '' ? id : `${id}/${sub}`;
}

// ── the registry (describe() reads it; mirrors the value-type registry) ──────
export interface RegisteredComponent {
  readonly name: string;
  readonly props: { readonly [prop: string]: ComponentPropSpec };
}
const registry = new Map<string, RegisteredComponent>();

/** Every component defined so far, in definition order — the seam describe()
 *  reads to list `components` from the LIVE registry (can't drift). Pure read. */
export function listComponents(): RegisteredComponent[] {
  return [...registry.values()];
}

/**
 * Define a reusable component. Returns a factory `(props) → ComponentInstance`.
 * Registers the component's name + prop surface so `describe().components` lists
 * it. A duplicate name throws (a component library can't silently shadow).
 */
export function defineComponent<P extends Record<string, unknown> = Record<string, unknown>>(
  def: ComponentDef<P>,
): (props: P & ComponentBaseProps) => ComponentInstance {
  if (registry.has(def.name)) {
    throw new ComponentError(`a component named '${def.name}' is already defined`);
  }
  registry.set(def.name, { name: def.name, props: def.props });

  return (props: P & ComponentBaseProps): ComponentInstance => {
    if (props.id === undefined || props.id === '') {
      throw new ComponentError(
        `${def.name}(...) needs a stable id — every instance namespaces its children under it (so N instances don't collide track targets)`,
      );
    }
    const id = props.id;
    const cid = (sub?: string): string => childId(id, sub);
    const node = def.build(props, cid);
    // the subtree's own id MUST be the instance id, so `<id>/<prop>` addresses
    // the component root and every `cid(child)` addresses a namespaced child.
    if (node.id !== id) {
      throw new ComponentError(
        `${def.name}(...).build must return a Group with id === childId() ('${id}'); got '${node.id ?? '<unset>'}'. Use \`new Group({ id: cid(), … })\`.`,
      );
    }
    return {
      node,
      id,
      childId: cid,
      targets: (child, prop) => [`${cid(child)}/${prop}`],
    };
  };
}

/** re-export Node/Group types consumers of this entry name for their `build`. */
export type { Node };
export { Group };
