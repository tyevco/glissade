/**
 * gs mcp session (0.28): the stateful core behind the AI-native WRITE layer. It
 * holds one loaded scene + its editor sidecar, and exposes the author→render→verify
 * loop as plain methods (mcp.ts wraps them as MCP tools; keeping the logic here
 * makes it unit-testable without the stdio transport):
 *
 *  - describe()      — the API manifest: which props are animatable, per node TYPE.
 *  - listTargets()   — the concrete `<nodeId>/<prop>` targets in THIS scene.
 *  - applyPatch()    — a VALIDATED, REVERSIBLE Timeline Patch batch (records the inverse).
 *  - undo()          — apply the last inverse.
 *  - renderFrame(t)  — render one frame of the (patched) scene → PNG, the verifier.
 *
 * Every seam is a shipped primitive — describe() (0.18, can't drift), Timeline Patch
 * (pure doc→doc, describe-validated, reversible), the sidecar merge, and a single
 * deterministic Skia frame — so the whole loop stays pure. An agent authors, renders,
 * and verifies a scene without ever reading source, and a bad patch can't emit a
 * track for a non-animatable prop (fail-loud at the write boundary).
 */

import { writeFileSync } from 'node:fs';
import type { Timeline } from '@glissade/core';
import { emptySidecar, mergeSidecar, type SidecarDoc } from '@glissade/core/sidecar';
import { applyPatches, type BaselineLookup, type PatchResult, type TimelinePatch } from '@glissade/core/studio-host';
import { evaluate, type Scene, type SceneModule } from '@glissade/scene';
import { describe, type ApiManifest } from '@glissade/scene/describe';
import { SkiaBackend } from '@glissade/backend-skia';
import { loadSceneModule } from './render.js';

export interface TargetInfo {
  /** the canonical animatable target: `<nodeId>/<prop>` */
  target: string;
  nodeId: string;
  nodeType: string;
  prop: string;
  /** the value type a track for this target must carry (number | vec2 | color | …) */
  type: string;
}

export class McpSession {
  private readonly scene: Scene;
  private readonly codeTimeline: Timeline;
  private sidecar: SidecarDoc = emptySidecar();
  private readonly undoStack: TimelinePatch[][] = [];

  private constructor(private readonly mod: SceneModule) {
    this.scene = mod.createScene();
    this.codeTimeline = mod.timeline;
  }

  static async load(modulePath: string): Promise<McpSession> {
    return new McpSession(await loadSceneModule(modulePath));
  }

  /** Seed a first edit on a code-only track from the code timeline's baseline (§6.2). */
  private readonly baseline: BaselineLookup = (timelineId, target) => {
    if (timelineId !== 'main') return null;
    const tr = this.codeTimeline.tracks.find((t) => t.target === target);
    return tr ? { type: tr.type, keys: tr.keys } : null;
  };

  /** The API manifest — the agent reads which props are animatable (per node type). */
  describe(): ApiManifest {
    return describe();
  }

  /** The concrete animatable `<nodeId>/<prop>` targets in THIS scene (id-substituted). */
  listTargets(): TargetInfo[] {
    const manifest = describe();
    const out: TargetInfo[] = [];
    for (const [id, node] of this.scene.nodes) {
      const desc = manifest.nodes[node.describeType];
      if (!desc) continue;
      for (const [prop, p] of Object.entries(desc.props)) {
        if (p.animatable && p.target) {
          out.push({ target: p.target.replace('<id>', id), nodeId: id, nodeType: node.describeType, prop, type: p.type });
        }
      }
    }
    return out;
  }

  /**
   * True if `target` (`<nodeId>/<prop.path>`) is a real animatable target of THIS
   * scene — the node exists and registered that prop. This is the describe()-backed
   * write-boundary check (resolveTarget reflects the same registrations describe()
   * enumerates, PLUS sub-components like `position.x`). Fail-loud on a bad target.
   */
  private isValidTarget(target: string): boolean {
    const slash = target.indexOf('/');
    if (slash <= 0) return false;
    const node = this.scene.nodes.get(target.slice(0, slash));
    return node !== undefined && node.resolveTarget(target.slice(slash + 1)) !== undefined;
  }

  /** Apply a validated, reversible patch batch. Records the inverse; doc is untouched on error. */
  applyPatch(patches: TimelinePatch[]): PatchResult {
    // fail-loud at the write boundary: a patch can't create a track for a prop
    // that isn't an animatable target of this scene (before it reaches the doc).
    for (const p of patches) {
      if ('target' in p && !this.isValidTarget(p.target)) {
        return { ok: false, error: `'${p.target}' is not an animatable target of this scene (unknown node or non-animatable prop) — call list_targets` };
      }
    }
    const r = applyPatches(this.sidecar, patches, this.baseline);
    if (r.ok) {
      this.sidecar = r.doc;
      this.undoStack.push(r.inverse);
    }
    return r;
  }

  /** Undo the last applyPatch (apply its recorded inverse). */
  undo(): { ok: boolean; error?: string } {
    const inv = this.undoStack.pop();
    if (!inv) return { ok: false, error: 'nothing to undo' };
    const r = applyPatches(this.sidecar, inv, this.baseline);
    if (r.ok) {
      this.sidecar = r.doc;
      return { ok: true };
    }
    this.undoStack.push(inv); // restore the stack if the inverse somehow failed
    return { ok: false, error: r.error };
  }

  /** The code timeline with the session's edits merged in (what render_frame evaluates). */
  mergedTimeline(): Timeline {
    return mergeSidecar(this.codeTimeline, this.sidecar);
  }

  /** How many undoable edits are on the stack. */
  editCount(): number {
    return this.undoStack.length;
  }

  /**
   * Render ONE frame of the current (patched) scene to a PNG — the agent's verifier.
   * Builds a FRESH scene each call (like `gs render` does per run): the verifier is
   * stateless, so a track that was added then undone — leaving the sidecar back at a
   * prior/empty state — can't leave a stale binding on a reused scene instance
   * (evaluate binds the current timeline's tracks but won't unbind a track absent
   * from it). This keeps render_frame a pure function of (current merged timeline, t).
   */
  async renderFrame(t: number, outPath: string): Promise<{ path: string; width: number; height: number }> {
    const scene = this.mod.createScene();
    const hasLayout = [...scene.nodes.values()].some(
      (n) => (n.constructor as { isLayoutNode?: boolean }).isLayoutNode === true,
    );
    if (hasLayout) {
      const { loadYogaLayoutEngine } = await import('@glissade/scene/layout');
      await loadYogaLayoutEngine();
    }
    const dl = evaluate(scene, this.mergedTimeline(), t);
    const backend = new SkiaBackend(scene.size.w, scene.size.h);
    try {
      scene.setTextMeasurer(backend);
      backend.render(dl);
      writeFileSync(outPath, backend.encodePng());
    } finally {
      backend.dispose();
    }
    return { path: outPath, width: scene.size.w, height: scene.size.h };
  }
}
