import { useCallback, useRef } from 'react';
import { type CompiledTimeline } from '@glissade/core';
import { type Player } from '@glissade/player';
import { usePlayhead } from '@glissade/react';

export function TimelinePanel({ compiled, player }: { compiled: CompiledTimeline; player: Player }) {
  const time = usePlayhead(player);
  const duration = Math.max(compiled.duration, 1e-9);
  const bodyRef = useRef<HTMLDivElement>(null);

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
          <div className="lane">
            {track.keys.length <= 400 ? (
              track.keys.map((k, i) => (
                <span
                  key={i}
                  className={`key${k.derived ? ' derived' : ''}`}
                  style={{ left: `${(k.t / duration) * 100}%` }}
                  title={`t=${k.t.toFixed(3)}`}
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
