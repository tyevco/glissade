import { useCallback, useRef } from 'react';
import { type CompiledTimeline, type Marker } from '@glissade/core';
import { type Player } from '@glissade/player';
import { usePlayhead } from '@glissade/react';
import { cycleStack, groupStacks, isSpringKey, type KeyRef } from './edits.js';

export function TimelinePanel({
  compiled,
  player,
  markers = [],
  onEditKey,
  onEndDrag,
  onAddKey,
  selected,
  onSelectKey,
}: {
  compiled: CompiledTimeline;
  player: Player;
  /** Timeline + project markers, flagged in the ruler. */
  markers?: readonly Pick<Marker, 't' | 'name'>[];
  /** Drag retiming; identity by the key's pre-drag t (closest-t — never a frozen index).
   * first=true on the drag's first move: opens the §6.3 scrub capture buffer. */
  onEditKey?: (target: string, fromT: number, newT: number, first: boolean) => void;
  /** Pointer-up: commit the scrub capture as one undo entry (or discard a no-move gesture). */
  onEndDrag?: () => void;
  /** Double-click a lane: add a key at that t, value sampled from the curve (§6.2). */
  onAddKey?: (target: string, t: number) => void;
  selected?: KeyRef | null;
  onSelectKey?: (ref: KeyRef | null) => void;
}) {
  const time = usePlayhead(player);
  const duration = Math.max(compiled.duration, 1e-9);
  const bodyRef = useRef<HTMLDivElement>(null);
  // identity over index: every edit re-sorts keys, so a frozen index would
  // silently swap which key is being dragged when it crosses a neighbor
  // (found via a user's sidecar with a vanished key)
  const drag = useRef<{ target: string; lastT: number; moved: boolean } | null>(null);

  const laneT = useCallback(
    (e: React.PointerEvent | React.MouseEvent, lane: Element) => {
      const rect = lane.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      return p * duration;
    },
    [duration],
  );

  const dragTo = useCallback(
    (e: React.PointerEvent, lane: Element) => {
      if (!drag.current || !onEditKey) return;
      const newT = laneT(e, lane);
      onEditKey(drag.current.target, drag.current.lastT, newT, !drag.current.moved);
      drag.current.moved = true;
      drag.current.lastT = newT;
    },
    [onEditKey, laneT],
  );

  const seekFromPointer = useCallback(
    (e: React.PointerEvent) => {
      const lane = bodyRef.current?.querySelector('.lane');
      if (!lane) return;
      player.pause();
      player.seek(laneT(e, lane));
    },
    [player, laneT],
  );

  const ticks = [];
  for (let t = 0; t <= duration; t += 0.5) {
    ticks.push(t);
  }

  return (
    <div ref={bodyRef}>
      <div
        className="ruler row"
        onPointerDown={(e) => {
          try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          } catch {
            // synthetic events carry no active pointer; capture is best-effort
          }
          seekFromPointer(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e)}
      >
        <div className="name" />
        <div className="lane">
          {ticks.map((t) => (
            <span key={t} className="tick" style={{ left: `${(t / duration) * 100}%` }}>
              {t.toFixed(1)}
            </span>
          ))}
          {markers.map((m, i) => (
            <span
              key={`m${i}`}
              className="marker"
              style={{ left: `${(m.t / duration) * 100}%` }}
              title={`${m.name} @ ${m.t.toFixed(2)}s`}
            >
              ⚑
            </span>
          ))}
          <div className="cursor" style={{ left: `${(time / duration) * 100}%` }} />
        </div>
      </div>
      {[...compiled.tracks.values()].map((track) => (
        <div className="row" key={track.target}>
          <div className="name" title={track.target}>
            {track.target}
          </div>
          <div
            className="lane"
            onPointerMove={(e) => e.buttons === 1 && dragTo(e, e.currentTarget)}
            onPointerUp={() => {
              if (drag.current) onEndDrag?.();
              drag.current = null;
            }}
            onDoubleClick={(e) => onAddKey?.(track.target, laneT(e, e.currentTarget))}
          >
            {track.keys.length <= 400 ? (
              groupStacks(track.keys, duration).map((stack, si) => {
                const stacked = stack.keys.length > 1;
                const selectedInStack =
                  selected && selected.target === track.target
                    ? (stack.keys.find((k) => Math.abs(k.t - selected.t) < 1e-9) ?? null)
                    : null;
                const rep = selectedInStack ?? stack.keys[0]!;
                const springRep = isSpringKey(rep);
                const title = stacked
                  ? `${stack.keys.length} stacked keys @ ${stack.keys.map((k) => k.t.toFixed(3)).join(', ')} — click to cycle`
                  : springRep
                    ? `${track.target} t=${rep.t.toFixed(3)} — spring: t is intrinsic, retime the previous key (§2.7)`
                    : `${track.target} t=${rep.t.toFixed(3)} (drag to retime · click to edit)`;
                return (
                  <span
                    key={si}
                    data-testid="timeline-key"
                    data-target={track.target}
                    data-t={rep.t}
                    className={`key${rep.derived ? ' derived' : ''}${springRep ? ' spring' : ''}${
                      selectedInStack ? ' selected' : ''
                    }`}
                    style={{ left: `${(rep.t / duration) * 100}%` }}
                    title={title}
                    onPointerDown={(e) => {
                      // stacks cycle selection per click; the armed member is what a drag moves
                      const member = stacked ? cycleStack(stack, selectedInStack?.t ?? null) : rep;
                      drag.current = { target: track.target, lastT: member.t, moved: false };
                      onSelectKey?.({ target: track.target, t: member.t });
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        // synthetic events carry no active pointer
                      }
                      e.stopPropagation();
                    }}
                    onPointerMove={(e) => e.buttons === 1 && dragTo(e, e.currentTarget.parentElement!)}
                    onPointerUp={() => {
                      if (drag.current) onEndDrag?.();
                      drag.current = null;
                    }}
                  >
                    {stacked && <span className="stack-badge">{stack.keys.length}</span>}
                  </span>
                );
              })
            ) : (
              <span className="name">{track.keys.length} keys (baked)</span>
            )}
            <div className="cursor" style={{ left: `${(time / duration) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
