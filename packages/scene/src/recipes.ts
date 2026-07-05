// @glissade/scene/recipes — 0.63 clean-by-construction starter SCAFFOLD.
//
// A registry of whole-scene PATTERNS an agent discovers via `describe().recipes`
// (the way it discovers node PRIMITIVES via describe().nodes), and instantiates via
// `recipe(name, props) → Group` (a ready subtree with typed props like a node).
//
// The point (retire the SCAFFOLD, not the teaching): these are the GENERIC pieces
// an author would otherwise hand-build every episode — lower-third / title-card /
// stat-reveal / cold-open. They are deliberately NOT bespoke teaching visuals
// (NNDL-sweep / send-line / trust-dial) — that distinctive language is where human
// craft goes. The 10x is "stop hand-authoring the scaffold," not "generate the
// teaching."
//
// GUARD (clean-by-construction): every recipe passes assess() CLEAN at DEFAULT props
// (no off-canvas / overflow / occlusion) — so an agent starting from a recipe only
// fixes the delta ITS prop values introduce, not an author-from-scratch cascade. A
// test asserts this for every registered recipe.
//
// Build-time FACTORIES (like Grid / Gauge / defineComponent) — a pure props→subtree
// function, NO evaluate/render-path code. Ships ONLY on this subpath (@glissade/
// scene/recipes), never the base scene index; re-exported onto the browser IIFE
// (kind:'tool'). The base embed pays ZERO bytes.

import { Group, Rect, Text } from './nodes.js';
import { registerRecipes, type DescribedRecipe } from './describe.js';

/** The 16:9 canvas the starter recipes are laid out for (the golden default). An
 *  author overrides it via the `frame` prop to re-place elements for another size. */
export interface Frame {
  w: number;
  h: number;
}
export const DEFAULT_FRAME: Frame = { w: 1920, h: 1080 };

const WHITE = '#ffffff';
const MUTED = '#c8d2e0';
const ACCENT = '#3366ff';
const INK = '#0b0e14';

/** The starter scaffold names. */
export type RecipeName = 'lower-third' | 'title-card' | 'stat-reveal' | 'cold-open';

/** Shared frame prop. */
interface FrameProp {
  /** Target canvas; defaults to {@link DEFAULT_FRAME} (1920×1080). */
  frame?: Frame;
  /** The root Group id; defaults to the recipe name. */
  id?: string;
}

export interface LowerThirdProps extends FrameProp {
  title?: string;
  subtitle?: string;
  accent?: string;
}
export interface TitleCardProps extends FrameProp {
  title?: string;
  subtitle?: string;
}
export interface StatRevealProps extends FrameProp {
  value?: string;
  label?: string;
  accent?: string;
}
export interface ColdOpenProps extends FrameProp {
  kicker?: string;
  title?: string;
  accent?: string;
  background?: string;
}

export interface RecipePropsByName {
  'lower-third': LowerThirdProps;
  'title-card': TitleCardProps;
  'stat-reveal': StatRevealProps;
  'cold-open': ColdOpenProps;
}

// ── the factories ───────────────────────────────────────────────────────────────

function lowerThird(props: LowerThirdProps = {}): Group {
  const frame = props.frame ?? DEFAULT_FRAME;
  const id = props.id ?? 'lower-third';
  const accent = props.accent ?? ACCENT;
  const x = Math.round(frame.w * 0.06); // left safe margin
  const barY = frame.h - Math.round(frame.h * 0.17);
  return new Group({
    id,
    children: [
      new Rect({ id: `${id}-accent`, position: [x, barY], width: 12, height: 96, fill: accent }),
      new Text({ id: `${id}-title`, position: [x + 34, barY - 18], text: props.title ?? 'Name', align: 'left', fontSize: 52, fill: WHITE }),
      new Text({ id: `${id}-subtitle`, position: [x + 34, barY + 34], text: props.subtitle ?? 'Title · role', align: 'left', fontSize: 30, fill: MUTED }),
    ],
  });
}

function titleCard(props: TitleCardProps = {}): Group {
  const frame = props.frame ?? DEFAULT_FRAME;
  const id = props.id ?? 'title-card';
  const cx = frame.w / 2;
  const cy = frame.h / 2;
  return new Group({
    id,
    children: [
      new Text({ id: `${id}-title`, position: [cx, cy - 24], text: props.title ?? 'Title', align: 'center', fontSize: 84, fill: WHITE }),
      new Text({ id: `${id}-subtitle`, position: [cx, cy + 60], text: props.subtitle ?? 'Subtitle', align: 'center', fontSize: 36, fill: MUTED }),
    ],
  });
}

function statReveal(props: StatRevealProps = {}): Group {
  const frame = props.frame ?? DEFAULT_FRAME;
  const id = props.id ?? 'stat-reveal';
  const accent = props.accent ?? ACCENT;
  const cx = frame.w / 2;
  const cy = frame.h / 2;
  return new Group({
    id,
    children: [
      new Text({ id: `${id}-value`, position: [cx, cy - 16], text: props.value ?? '100%', align: 'center', fontSize: 140, fill: accent }),
      new Text({ id: `${id}-label`, position: [cx, cy + 96], text: props.label ?? 'metric', align: 'center', fontSize: 40, fill: WHITE }),
    ],
  });
}

function coldOpen(props: ColdOpenProps = {}): Group {
  const frame = props.frame ?? DEFAULT_FRAME;
  const id = props.id ?? 'cold-open';
  const accent = props.accent ?? ACCENT;
  const bg = props.background ?? INK;
  const cx = frame.w / 2;
  const cy = frame.h / 2;
  return new Group({
    id,
    children: [
      // full-frame backdrop painted FIRST (below) — never occludes the text above it.
      new Rect({ id: `${id}-bg`, position: [cx, cy], width: frame.w, height: frame.h, fill: bg }),
      new Text({ id: `${id}-kicker`, position: [cx, cy - 80], text: props.kicker ?? 'COLD OPEN', align: 'center', fontSize: 32, fill: accent }),
      new Text({ id: `${id}-title`, position: [cx, cy + 8], text: props.title ?? 'Title', align: 'center', fontSize: 96, fill: WHITE }),
    ],
  });
}

// ── the registry ────────────────────────────────────────────────────────────────

type AnyRecipe = (props?: Record<string, unknown>) => Group;

const FACTORIES: Record<RecipeName, AnyRecipe> = {
  'lower-third': lowerThird as AnyRecipe,
  'title-card': titleCard as AnyRecipe,
  'stat-reveal': statReveal as AnyRecipe,
  'cold-open': coldOpen as AnyRecipe,
};

/**
 * The machine-readable recipe MANIFEST `describe().recipes` surfaces — one entry per
 * registered recipe, with its typed props (the same negative-space shape as a node's
 * described props). Curated alongside the factories; a test pins the two sets equal.
 */
export const RECIPE_MANIFEST: DescribedRecipe[] = [
  {
    name: 'lower-third',
    summary: 'A name/role bar in the lower third (accent tick + title + subtitle).',
    props: {
      title: { type: 'string', default: 'Name' },
      subtitle: { type: 'string', default: 'Title · role' },
      accent: { type: 'color', default: ACCENT },
      frame: { type: 'object', default: DEFAULT_FRAME },
      id: { type: 'string', default: 'lower-third' },
    },
  },
  {
    name: 'title-card',
    summary: 'A centered title + subtitle card.',
    props: {
      title: { type: 'string', default: 'Title' },
      subtitle: { type: 'string', default: 'Subtitle' },
      frame: { type: 'object', default: DEFAULT_FRAME },
      id: { type: 'string', default: 'title-card' },
    },
  },
  {
    name: 'stat-reveal',
    summary: 'A big centered stat/number with a label beneath it.',
    props: {
      value: { type: 'string', default: '100%' },
      label: { type: 'string', default: 'metric' },
      accent: { type: 'color', default: ACCENT },
      frame: { type: 'object', default: DEFAULT_FRAME },
      id: { type: 'string', default: 'stat-reveal' },
    },
  },
  {
    name: 'cold-open',
    summary: 'A generic full-frame cold-open scaffold (backdrop + kicker + title).',
    props: {
      kicker: { type: 'string', default: 'COLD OPEN' },
      title: { type: 'string', default: 'Title' },
      accent: { type: 'color', default: ACCENT },
      background: { type: 'color', default: INK },
      frame: { type: 'object', default: DEFAULT_FRAME },
      id: { type: 'string', default: 'cold-open' },
    },
  },
];

/** The registered recipe names (for discovery / iteration). */
export function listRecipes(): DescribedRecipe[] {
  return RECIPE_MANIFEST.map((r) => ({ ...r }));
}

export class UnknownRecipeError extends Error {
  constructor(name: string) {
    const known = Object.keys(FACTORIES).join(', ');
    super(`unknown recipe '${name}' — known recipes: ${known}. Discover them via describe().recipes.`);
    this.name = 'UnknownRecipeError';
  }
}

/**
 * Instantiate a starter recipe as a Group fragment. `name` is a registered recipe
 * ({@link RecipeName}); `props` are its typed props (all optional — every recipe is
 * clean-by-construction at defaults). Fail-loud on an unknown name.
 */
export function recipe<N extends RecipeName>(name: N, props?: RecipePropsByName[N]): Group;
export function recipe(name: string, props?: Record<string, unknown>): Group;
export function recipe(name: string, props: Record<string, unknown> = {}): Group {
  const factory = FACTORIES[name as RecipeName];
  if (!factory) throw new UnknownRecipeError(name);
  return factory(props);
}

// Self-register so `import '@glissade/scene/recipes'` populates describe().recipes
// (the value-type-registry pattern — describe never statically imports this subpath,
// so the base index / IIFE stay lean; importing the subpath activates it).
registerRecipes(RECIPE_MANIFEST);
