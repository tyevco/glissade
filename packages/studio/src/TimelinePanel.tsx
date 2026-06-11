import { useCallback, useRef } from 'react';
import { type CompiledTimeline } from '@glissade/core';
import { type Player } from '@glissade/player';
import { usePlayhead } from '@glissade/react';

export function TimelinePanel({
  compiled,
  player,
  onEditKey,
}: {
  compiled: CompiledTimeline;
  player: Player;
  onEditKey?: (target: string, keyIndex: number, newT: number) => void;
}) {
  const time = usePlayhead(player);
  const duration = Math.max(compiled.duration, 1e-9);
  const bodyRef = useRef<HTMLDivElement>(null);
  // identity over index: every edit re-sorts keys, so a frozen index would
  // silently swap which key is being dragged when it crosses a neighbor
  // (found via a user's sidecar with a vanished key)
  const drag = useRef<{ target: string; lastT: number } | null>(null);

  const dragTo = useCallback(
    (e: React.PointerEvent, lane: Element) => {
      if (!drag.current || !onEditKey) return;
      const track = compiled.tracks.get(drag.current.target);
      if (!track) return;
      const rect = lane.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const newT = p * duration;
      let keyIndex = 0;
      let best = Infinity;
      track.keys.forEach((k, i) => {
        const d = Math.abs(k.t - drag.current!.lastT);
        if (d < best) {
          best = d;
          keyIndex = i;
        }
      });
      drag.current.lastT = newT;
      onEditKey(drag.current.target, keyIndex, newT);
    },
    [onEditKey, duration, compiled],
  );

  const seekFromPointer = useCallback(
    (e: React.PointerEvent) => {
      const lane = bodyRef.current?.querySelector('.lane');
      if (!lane) return;
      const rect = lane.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      player.pause();
      player.seek(p * duration);
    },
    [player, duration],
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
              drag.current = null;
            }}
          >
            {track.keys.length <= 400 ? (
              track.keys.map((k, i) => (
                <span
                  key={i}
                  className={`key${k.derived ? ' derived' : ''}`}
                  style={{ left: `${(k.t / duration) * 100}%` }}
                  title={`${track.target} t=${k.t.toFixed(3)} (drag to retime)`}
                  onPointerDown={(e) => {
                    drag.current = { target: track.target, lastT: k.t };
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // synthetic events carry no active pointer
                    }
                    e.stopPropagation();
                  }}
                  onPointerMove={(e) => e.buttons === 1 && dragTo(e, e.currentTarget.parentElement!)}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                />
              ))
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
