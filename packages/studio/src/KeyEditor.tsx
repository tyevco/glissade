/**
 * Per-key editor strip (§6.2): t / value / arriving-ease for the selected
 * key. The ease picker is the easing registry plus cubic-bezier and spring
 * with config fields — spring assignment re-pins the key's t intrinsically
 * (§2.7), which the surrounding ops guarantee via normalizeEditedKeys.
 */

import { useEffect, useState } from 'react';
import { easings, spring, type EaseSpec, type Track } from '@glissade/core';
import { closestIndex, formatValue, type KeyRef } from './edits.js';

type EaseMode = 'linear' | 'named' | 'cubicBezier' | 'spring' | 'hold';

function easeMode(ease: EaseSpec | undefined, interp: string | undefined): { mode: EaseMode; name?: string } {
  if (interp === 'hold') return { mode: 'hold' };
  if (ease === undefined) return { mode: 'linear' };
  if (typeof ease === 'string') return { mode: 'named', name: ease };
  return { mode: ease.kind };
}

/** Uncontrolled-while-focused text input that tracks the live value otherwise. */
function ValueField({
  value,
  onCommit,
  width = 110,
  title,
}: {
  value: string;
  onCommit: (raw: string) => void;
  width?: number;
  title?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="keyeditor-field"
      style={{ width }}
      title={title ?? ''}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
        e.stopPropagation(); // typing must not trigger the Delete-key shortcut
      }}
    />
  );
}

export function KeyEditor({
  track,
  selected,
  onRetime,
  onValue,
  onEase,
  onDelete,
}: {
  track: Track;
  selected: KeyRef;
  onRetime: (raw: string) => void;
  onValue: (raw: string) => void;
  onEase: (ease: EaseSpec | undefined, hold?: boolean) => void;
  onDelete: () => void;
}) {
  const k = track.keys[closestIndex(track.keys, selected.t)]!;
  const { mode, name } = easeMode(k.ease, k.interp);
  // local spring/bezier drafts so partial edits don't thrash the document
  const [springCfg, setSpringCfg] = useState({ stiffness: 170, damping: 26, mass: 1 });
  const [bezier, setBezier] = useState<[number, number, number, number]>([0.25, 0.1, 0.25, 1]);
  useEffect(() => {
    if (k.ease && typeof k.ease === 'object') {
      if (k.ease.kind === 'spring') {
        const { stiffness, damping, mass } = k.ease;
        setSpringCfg({ stiffness, damping, mass });
      } else setBezier(k.ease.pts);
    }
  }, [k.ease]);

  const isSpring = mode === 'spring';
  const springIntrinsicT = isSpring ? `t is intrinsic: prev + spring.duration = ${k.t.toFixed(3)}s (§2.7)` : undefined;

  return (
    <div className="keyeditor">
      <span className="keyeditor-target" title={selected.target}>
        {selected.target}
      </span>
      <label>
        t
        <ValueField
          value={formatValue(k.t)}
          onCommit={onRetime}
          width={64}
          {...(springIntrinsicT ? { title: springIntrinsicT } : {})}
        />
      </label>
      <label>
        value
        <ValueField value={formatValue(k.value)} onCommit={onValue} title={`type: ${track.type}`} />
      </label>
      <label>
        ease
        <select
          className="keyeditor-field"
          value={mode === 'named' ? name : mode}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'linear') onEase(undefined);
            else if (v === 'hold') onEase(undefined, true);
            else if (v === 'spring') onEase({ kind: 'spring', ...springCfg });
            else if (v === 'cubicBezier') onEase({ kind: 'cubicBezier', pts: bezier });
            else onEase(v);
          }}
        >
          <option value="linear">linear</option>
          <option value="hold">hold</option>
          {Object.keys(easings).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="cubicBezier">cubicBezier…</option>
          <option value="spring">spring…</option>
        </select>
      </label>
      {isSpring &&
        (['stiffness', 'damping', 'mass'] as const).map((f) => (
          <label key={f}>
            {f[0]}
            <ValueField
              value={String(springCfg[f])}
              width={44}
              title={`${f} (settles in ${spring.duration(springCfg).toFixed(2)}s)`}
              onCommit={(raw) => {
                const n = parseFloat(raw);
                if (!Number.isFinite(n) || n <= 0) return;
                const next = { ...springCfg, [f]: n };
                setSpringCfg(next);
                onEase({ kind: 'spring', ...next });
              }}
            />
          </label>
        ))}
      {mode === 'cubicBezier' && (
        <ValueField
          value={bezier.join(', ')}
          width={120}
          title="x1, y1, x2, y2"
          onCommit={(raw) => {
            const pts = raw.split(/[,\s]+/).filter(Boolean).map(parseFloat);
            if (pts.length !== 4 || pts.some((n) => !Number.isFinite(n))) return;
            const next = pts as [number, number, number, number];
            setBezier(next);
            onEase({ kind: 'cubicBezier', pts: next });
          }}
        />
      )}
      <button className="keyeditor-delete" title="delete key (or press Delete)" onClick={onDelete}>
        delete
      </button>
    </div>
  );
}
