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
  if (Array.isArray(v)) return `[${v.map((n) => (typeof n === 'number' ? n.toFixed(2) : String(n))).join(', ')}]`;
  return String(v);
}

function PropRow({ name, sig }: { name: string; sig: ReadonlySignal<unknown> }) {
  const value = useSignalValue(sig);
  return (
    <tr>
      <td>{name}</td>
      <td className="value">{format(value)}</td>
    </tr>
  );
}

export function Inspector({
  scene,
  selected,
  onSelect,
}: {
  scene: Scene;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const ids = [...scene.nodes.keys()].filter((id) => id !== '__root');
  const node: Node | undefined = selected ? scene.nodes.get(selected) : undefined;
  const props = node
    ? INSPECTABLE.flatMap((name) => {
        const candidate = (node as unknown as Record<string, unknown>)[name];
        return isSignal(candidate) ? [{ name, sig: candidate }] : [];
      })
    : [];

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
      {node && (
        <>
          <h3 style={{ marginTop: 16 }}>{selected}</h3>
          <table>
            <tbody>
              {props.map(({ name, sig }) => (
                <PropRow key={name} name={name} sig={sig} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
