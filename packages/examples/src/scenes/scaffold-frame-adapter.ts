/**
 * A MINIMAL fixture `scaffoldFrame` adapter — the ~6-line convention wrapper an author
 * writes over their episode frame, here standing in for a real frame (e.g. NNDL's
 * makeEpisode) so the `gs scaffold --frame` OUTPUT (scaffold-frame-fixture.scaffold.ts)
 * TYPECHECKS + renders. Real frames own richer editorial (accent/habit/footnote choreography);
 * this fixture just satisfies the contract: `makeEpisode(opts)` → `buildBody(ep)` →
 * `ep.finish({ audio })`, with the frame owning the captions / labels / backdrop / duration.
 */
import { key, timeline, track, type Track } from '@glissade/core';
import { captionNode, captionTrack, narration, type NarrationTiming } from '@glissade/narrate';
import { createScene, type Node, type SceneModule } from '@glissade/scene';

/** The opts the scaffold emits (editorial + inferable + the frame essentials). */
export interface ScaffoldFrameOpts {
  size: { w: number; h: number };
  timing: NarrationTiming;
  require: readonly string[];
  accent?: string;
  title?: { title: string };
  habitText?: string;
  next?: { title: string };
  footnote?: { text: string; verified: boolean };
  titleOutSeg?: string;
  outroSeg?: string;
  audio?: readonly unknown[];
}

/** The imperative body-authoring handle the scaffold emits calls against. */
export interface Ep {
  readonly size: { w: number; h: number };
  readonly anchor: ReturnType<typeof narration>;
  push(node: Node): void;
  add(t: Track | readonly Track[]): void;
  fadeIn(id: string, at: number): Track;
}

export function scaffoldFrame(opts: ScaffoldFrameOpts, buildBody: (ep: Ep) => void): SceneModule {
  const anchor = narration(opts.timing);
  anchor.require([...opts.require]); // drift-guard: fail loud if a committed id vanished
  const children: Node[] = [];
  const tracks: Track[] = [];
  const ep: Ep = {
    size: opts.size,
    anchor,
    push: (n) => children.push(n),
    add: (t) => {
      if (Array.isArray(t)) tracks.push(...t);
      else tracks.push(t as Track);
    },
    fadeIn: (id, at) => track(`${id}/opacity`, 'number', [key(at, 0), key(at + 0.3, 1, 'easeOutCubic')]),
  };
  buildBody(ep);
  // finish() OWNS the caption wiring / labels / duration (the frame's job, not the body's).
  return {
    createScene: () => createScene({ size: opts.size, children: [...children, captionNode(opts.size)] }),
    timeline: timeline({
      fps: 60,
      duration: anchor.totalDuration,
      labels: anchor.labels(),
      tracks: [captionTrack(opts.timing), ...tracks],
    }),
  };
}
