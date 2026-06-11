import { usePlayhead } from '@glissade/react';
import { type Player } from '@glissade/player';

export function Transport({ player }: { player: Player }) {
  const time = usePlayhead(player);
  return (
    <div className="transport">
      <button
        onClick={() => {
          if (player.playing) player.pause();
          else void player.play();
        }}
      >
        {player.playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.0001}
        value={player.duration > 0 ? time / player.duration : 0}
        onChange={(e) => {
          player.pause();
          player.seek(parseFloat(e.target.value) * player.duration);
        }}
      />
      <span className="time">
        {time.toFixed(3)}s / {player.duration.toFixed(3)}s
      </span>
    </div>
  );
}
