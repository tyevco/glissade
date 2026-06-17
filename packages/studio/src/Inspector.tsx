import { useState } from 'react';
import { type ReadonlySignal } from '@glissade/core';
import { type Scene, Node } from '@glissade/scene';
import { useSignalValue } from '@glissade/react';
import { OutlinePanel } from './OutlinePanel.js';

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
 * The single locked editability rule (§6.2 sub-decision): a target is editable
 * IFF its node has an explicit id AND a merged/editor-created track exists
 * (`track.editable`, set by mergeSidecarDetailed). The node half is gated
 * upstream in the App via `isEditableNodeId`; the Inspector receives the final
 * verdict through `editableOf` and never re-derives it.
 *
 * Editable rows commit a sidecar key at the playhead. NON-editable rows are
 * code-owned: they offer a session-transient preview (live, never persisted —
 * §6.2 rule 4) and a "copy as code" affordance, never a sidecar write.
 */
function PropRow({
  name,
  target,
  sig,
  editable,
  onCommit,
  onPreview,
  onCopyCode,
}: {
  name: string;
  target: string;
  sig: ReadonlySignal<unknown>;
  editable: boolean;
  onCommit?: (raw: string) => void;
  onPreview?: (raw: string) => void;
  onCopyCode?: () => void;
}) {
  const value = useSignalValue(sig);
  const [draft, setDraft] = useState<string | null>(null);
  const handler = editable ? onCommit : onPreview;
  const cls = editable ? 'prop-edit' : 'prop-edit preview';
  const title = editable
    ? 'edit: writes a key at the playhead'
    : 'preview only — code owns this prop; the edit is not saved (copy as code to keep it)';
  return (
    <tr>
      <td>{name}</td>
      <td className="value">
        {handler ? (
          <input
            className={cls}
            title={title}
            value={draft ?? format(value)}
            onFocus={() => setDraft(format(value))}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== null && draft !== format(value)) handler(draft);
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
        {!editable && onCopyCode && (
          <button
            className="copy-code"
            title={`copy ${target} as code — the preview is not persisted (§6.2)`}
            onClick={onCopyCode}
          >
            copy as code
          </button>
        )}
      </td>
    </tr>
  );
}

export function Inspector({
  scene,
  selected,
  onSelect,
  editableOf,
  onEditValue,
  onPreviewValue,
  onCopyAsCode,
  onExtractEdits,
}: {
  scene: Scene;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Is `<nodeId>/<prop>` editable (id'd node AND an editable/editor-created track)? */
  editableOf?: (target: string) => boolean;
  /** Editable prop: commit a value — writes a sidecar key at the playhead. */
  onEditValue?: (target: string, raw: string) => void;
  /** Non-editable prop: session-transient preview — live, never persisted (§6.2 rule 4). */
  onPreviewValue?: (target: string, raw: string) => void;
  /** Non-editable prop: copy the current value as `key(...)` source to the clipboard. */
  onCopyAsCode?: (target: string) => void;
  /** Editable track: extract its keys to the clipboard, then drop the sidecar entry (§6.2 rule 7). */
  onExtractEdits?: (target: string) => void;
}) {
  const node: Node | undefined = selected ? scene.nodes.get(selected) : undefined;
  const props: Array<{ name: string; sig: ReadonlySignal<unknown> }> = node
    ? INSPECTABLE.flatMap((name) => {
        const candidate = (node as unknown as Record<string, unknown>)[name];
        return isSignal(candidate) ? [{ name, sig: candidate }] : [];
      })
    : [];
  // vec2 props edited per component ('position.x') get their own editable rows
  if (node && selected && editableOf) {
    for (const name of ['position', 'scale'] as const) {
      const sig = (node as unknown as Record<string, unknown>)[name];
      if (!isSignal(sig)) continue;
      for (const c of ['x', 'y'] as const) {
        const sub = (sig as unknown as Record<string, unknown>)[c];
        if (isSignal(sub) && editableOf(`${selected}/${name}.${c}`)) {
          props.push({ name: `${name}.${c}`, sig: sub });
        }
      }
    }
  }

  return (
    <>
      <OutlinePanel scene={scene} selected={selected} onSelect={onSelect} />
      {node && selected && (
        <>
          <h3 style={{ marginTop: 16 }}>{selected}</h3>
          <table>
            <tbody>
              {props.map(({ name, sig }) => {
                const target = `${selected}/${name}`;
                const editable = editableOf?.(target) ?? false;
                return (
                  <PropRow
                    key={name}
                    name={name}
                    target={target}
                    sig={sig}
                    editable={editable}
                    {...(editable && onEditValue ? { onCommit: (raw: string) => onEditValue(target, raw) } : {})}
                    {...(!editable && onPreviewValue ? { onPreview: (raw: string) => onPreviewValue(target, raw) } : {})}
                    {...(!editable && onCopyAsCode ? { onCopyCode: () => onCopyAsCode(target) } : {})}
                  />
                );
              })}
            </tbody>
          </table>
          {onExtractEdits && (
            <ExtractEdits
              targets={props
                .map(({ name }) => `${selected}/${name}`)
                .filter((t) => editableOf?.(t) ?? false)}
              onExtract={onExtractEdits}
            />
          )}
        </>
      )}
    </>
  );
}

/** The "extract edits to code" action list — one button per editable track (§6.2 rule 7). */
function ExtractEdits({ targets, onExtract }: { targets: string[]; onExtract: (target: string) => void }) {
  if (targets.length === 0) return null;
  return (
    <div className="extract-edits">
      {targets.map((target) => (
        <button
          key={target}
          className="extract-edit"
          title={`copy ${target}'s keys as code and remove the sidecar entry (source is not modified)`}
          onClick={() => onExtract(target)}
        >
          extract {target.split('/')[1]} to code
        </button>
      ))}
    </div>
  );
}
