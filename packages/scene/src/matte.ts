/**
 * TrackMatte (0.34): mask CONTENT by a MATTE layer's alpha (or luminance) — the
 * motion-craft suite's fourth piece. `trackMatte(content, matte)` renders the
 * content normally into this node's own isolated layer, then composites the
 * matte layer over it with `destination-in`: content pixels survive only where
 * the matte is opaque. Both subtrees are ordinary nodes, so the matte ANIMATES
 * like anything else — a sliding shape wipes text in, a scaling blob irises a
 * photo, a text matte fills glyphs with animated content.
 *
 * Purity: everything is one emit pass — the matte marker rides an optional
 * `matte` field on the inner pushGroup (the shader?/cacheKey? IR-extension
 * precedent; the BlendMode union stays closed), and the compositor applies
 * native `destination-in` (alpha, byte-exact on both canvas rasterizers) or the
 * shared straight-alpha luma kernel first (`mode: 'luma'` — one deterministic
 * CPU pass, the mesh-kernel discipline). Skia goldens byte-compare; browser↔Skia
 * pixel parity is PERCEPTUAL at anti-aliased matte edges (like motion blur), and
 * the DisplayList geometry is the exact cross-backend contract. backend-dom
 * (preview tier) hides the matte layer and stamps `data-approx` — it never
 * affects `gs render`.
 *
 * The node forces its own group so the destination-in stays ISOLATED: it can
 * only erase the content inside this node's layer, never siblings or the
 * backdrop.
 */

import { type DisplayListBuilder } from './displayList.js';
import { Group } from './nodes.js';
import { type EvalContext, type Node, type NodeProps } from './node.js';

export interface TrackMatteProps extends NodeProps {
  /** the visible content — masked by the matte. */
  content: Node;
  /** the mask — its alpha (or luma) decides which content pixels survive. */
  matte: Node;
  /** 'alpha' (default): matte opacity masks. 'luma': matte brightness masks
   *  (white = keep, black = erase), via the shared deterministic CPU kernel. */
  mode?: 'alpha' | 'luma';
}

export class TrackMatte extends Group {
  override get describeType(): string {
    return 'TrackMatte';
  }
  readonly content: Node;
  readonly matte: Node;
  readonly mode: 'alpha' | 'luma';

  constructor(props: TrackMatteProps) {
    // content + matte become real children (parented, hit-tested, walked) so
    // world transforms and scene registration behave like any group's children.
    const { content, matte, mode, ...rest } = props;
    super({ ...rest, children: [content, matte] });
    // fail loud at construction (the trackMatte/Chart/logScale discipline): a
    // typo'd mode would otherwise ride into pushGroup.matte and reach a backend
    // as an unknown compositing operation — a silently-broken matte.
    if (mode !== undefined && mode !== 'alpha' && mode !== 'luma') {
      throw new Error(`trackMatte mode must be 'alpha' or 'luma', got ${JSON.stringify(mode)}`);
    }
    this.content = content;
    this.matte = matte;
    this.mode = mode ?? 'alpha';
  }

  /** destination-in must not leak past this node — always isolate in a layer. */
  protected override requiresGroup(): boolean {
    return true;
  }

  protected override draw(out: DisplayListBuilder, ctx: EvalContext): void {
    // content paints normally into this node's (isolated) layer …
    this.content.emit(out, ctx);
    // … then the matte layer composites onto it as destination-in
    out.push({ op: 'pushGroup', opacity: 1, blend: 'source-over', filters: [], matte: this.mode });
    this.matte.emit(out, ctx);
    out.push({ op: 'popGroup' });
  }
}

/** `trackMatte(photo, circleWipe)` — photo visible only inside the (animatable)
 * circle. Pass `{ mode: 'luma' }` to mask by matte brightness instead of alpha. */
export function trackMatte(
  content: Node,
  matte: Node,
  props: Omit<TrackMatteProps, 'content' | 'matte'> = {},
): TrackMatte {
  return new TrackMatte({ ...props, content, matte });
}
