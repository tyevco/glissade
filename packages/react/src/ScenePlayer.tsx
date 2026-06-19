/**
 * <ScenePlayer> (DESIGN.md §4.3 tier 3, the React twin of <gs-player>): a
 * declarative component over mount(). Props are mount-native (`scene` +
 * `timeline`); the controls inventory mirrors the element's — play/pause,
 * scrubber, time readout — but as plain React with className-styled nodes
 * rather than a shadow DOM + CSS parts.
 *
 * All mount() work happens in a useEffect keyed on [scene, timeline] (never
 * during render — SSR renders the inert canvas only). The component owns
 * playback so it can observe each play's `.finished` promise for onFinished
 * (a per-play completion signal, §2 — NOT a polled state).
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { type Timeline } from '@glissade/core';
import { type Scene } from '@glissade/scene';
import { mount, type LoopMode, type Player } from '@glissade/player';
import { usePlayerState } from './index.js';

export interface ScenePlayerProps {
  /** The scene graph to render. */
  scene: Scene;
  /** The timeline document driving it. */
  timeline: Timeline;
  /** Loop policy (forwarded to the Player). */
  loop?: LoopMode;
  /** Render the default controls bar (play/pause, scrubber, time readout). */
  controls?: boolean;
  /** Start playing on mount. */
  autoplay?: boolean;
  /** Fired when a play completes naturally (true) or is interrupted (false). */
  onFinished?: (completed: boolean) => void;
  /** Called once the underlying Player is mounted (for imperative control). */
  onReady?: (player: Player) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * The controls bar — split out so it can subscribe to live playhead state via
 * usePlayerState (a hook, so it must live in a component that only renders once
 * the player exists).
 */
function Controls({ player }: { player: Player }): React.ReactElement {
  const { playing, time, duration } = usePlayerState(player);
  return (
    <div className="gs-controls">
      <button
        className="gs-controls-button"
        type="button"
        aria-label="Play or pause"
        onClick={() => {
          if (player.playing) player.pause();
          else void player.play();
        }}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        className="gs-controls-scrubber"
        type="range"
        min={0}
        max={1}
        step={0.0001}
        value={duration > 0 ? time / duration : 0}
        aria-label="Seek"
        onChange={(e) => {
          player.pause();
          player.seek(parseFloat(e.target.value) * player.duration);
        }}
      />
      <span className="gs-controls-time">
        {time.toFixed(2)} / {duration.toFixed(2)}s
      </span>
    </div>
  );
}

export function ScenePlayer({
  scene,
  timeline,
  loop,
  controls = false,
  autoplay = false,
  onFinished,
  onReady,
  className,
  style,
}: ScenePlayerProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState<Player | null>(null);

  // latest callbacks without re-running the mount effect (the effect is keyed
  // on [scene, timeline] only — props like onFinished change freely between)
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    // mount() owns autoplay's play() handle (it swallows it), so we mount with
    // autoplay:false and drive play ourselves — that way every play's
    // `.finished` (the per-play completion promise) routes through onFinished.
    const mounted = mount(scene, timeline, canvas, {
      ...(loop !== undefined ? { loop } : {}),
      autoplay: false,
    });
    const p = mounted.player;

    // Wrap play() so EVERY play — the autoplay-driven first play AND the
    // controls Play button (which calls player.play() directly) — re-arms
    // onFinished against that play's own `.finished` promise. `.finished` is
    // per-play, so we must re-subscribe on each play, not poll a signal.
    const rawPlay = p.play.bind(p);
    const playAndTrack: Player['play'] = (opts) => {
      const handle = rawPlay(opts);
      handle.finished.then(
        (completed) => {
          if (!cancelled) onFinishedRef.current?.(completed);
        },
        () => undefined,
      );
      return handle;
    };
    p.play = playAndTrack;

    setPlayer(p);
    onReadyRef.current?.(p);

    if (autoplayRef.current) playAndTrack();

    return () => {
      cancelled = true;
      setPlayer(null);
      mounted.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, timeline]);

  return (
    <div className={className} style={style}>
      <canvas ref={canvasRef} width={scene.size.w} height={scene.size.h} />
      {controls && player ? <Controls player={player} /> : null}
    </div>
  );
}
