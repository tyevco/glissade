import { useState } from 'react';
import { type ReadonlySignal } from '@glissade/core';
import { type Scene, Node } from '@glissade/scene';
import { useSignalValue } from '@glissade/react';

const INSPECTABLE = [
  'position',
  'rotation',
  'scale',
  'opacity',
  'zIndex',
  'fill',
  'stroke',
  'strokeWidth',
  'radius',
  'width',
  'height',
  'text',
  'fontSize',
] as const;

function isSignal(v: unknown): v is ReadonlySignal<unknown> {
  return typeof v === 'function' && typeof (v as { peek?: unknown }).peek === 'function';
}

function format(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (Array.isArray(v)) return v.map((n) => (typeof n === 'number' ? parseFloat(n.toFixed(3)) : String(n))).join(', ');
  return String(v);
}

/**
 * Tracked properties are editable: committing writes a sidecar key at the
 * playhead (§6.2 — update-under-cursor or insert). Untracked properties stay
 * read-only; code owns them.
 */
function PropRow({
  name,
  sig,
  editable,
  onCommit,
}: {
  name: string;
  sig: ReadonlySignal<unknown>;
  editable: boolean;
  onCommit?: (raw: string) => void;
}) {
  const value = useSignalValue(sig);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <tr>
      <td>{name}</td>
      <td className="value">
        {editable && onCommit ? (
          <input
            className="prop-edit"
            title="edit: writes a key at the playhead"
            value={draft ?? format(value)}
            onFocus={() => setDraft(format(value))}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== null && draft !== format(value)) onCommit(draft);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setDraft(null);
              e.stopPropagation();
            }}
          />
        ) : (
          format(value)
        )}
      </td>
    </tr>
  );
}

export function Inspector({
  scene,
  selected,
  onSelect,
  hasTrack,
  onEditValue,
}: {
  scene: Scene;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Is `<nodeId>/<prop>` animated by the merged document? */
  hasTrack?: (target: string) => boolean;
  /** Commit a value: writes a sidecar key at the playhead. */
  onEditValue?: (target: string, raw: string) => void;
}) {
  const ids = [...scene.nodes.keys()].filter((id) => id !== '__root');
  const node: Node | undefined = selected ? scene.nodes.get(selected) : undefined;
  const props: Array<{ name: string; sig: ReadonlySignal<unknown> }> = node
    ? INSPECTABLE.flatMap((name) => {
        const candidate = (node as unknown as Record<string, unknown>)[name];
        return isSignal(candidate) ? [{ name, sig: candidate }] : [];
      })
    : [];
  // vec2 props tracked per component ('position.x') get their own editable rows
  if (node && selected && hasTrack) {
    for (const name of ['position', 'scale'] as const) {
      const sig = (node as unknown as Record<string, unknown>)[name];
      if (!isSignal(sig)) continue;
      for (const c of ['x', 'y'] as const) {
        const sub = (sig as unknown as Record<string, unknown>)[c];
        if (isSignal(sub) && hasTrack(`${selected}/${name}.${c}`)) {
          props.push({ name: `${name}.${c}`, sig: sub });
        }
      }
    }
  }

  return (
    <>
      <h3>Nodes</h3>
      {ids.map((id) => (
        <div
          key={id}
          className={`node${id === selected ? ' selected' : ''}`}
          onClick={() => onSelect(id)}
        >
          {id}
        </div>
      ))}
      {node && selected && (
        <>
          <h3 style={{ marginTop: 16 }}>{selected}</h3>
          <table>
            <tbody>
              {props.map(({ name, sig }) => {
                const target = `${selected}/${name}`;
                const editable = hasTrack?.(target) ?? false;
                return (
                  <PropRow
                    key={name}
                    name={name}
                    sig={sig}
                    editable={editable}
                    {...(editable && onEditValue ? { onCommit: (raw: string) => onEditValue(target, raw) } : {})}
                  />
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
