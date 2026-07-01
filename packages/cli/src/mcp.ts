/**
 * `gs mcp <scene>` (0.28): the AI-native WRITE layer as an MCP stdio server. It
 * loads one scene and exposes the author→render→verify loop as tools an agent
 * calls WITHOUT reading source — turning describe() from a read-only manifest into
 * a full action space:
 *
 *   describe        → the API manifest (which props are animatable, per node type)
 *   list_targets    → the concrete `<nodeId>/<prop>` animatable targets in THIS scene
 *   apply_patch     → a VALIDATED, REVERSIBLE Timeline Patch batch (returns the inverse)
 *   undo            → revert the last apply_patch
 *   render_frame    → render one frame → a PNG the agent SEES inline (the verifier)
 *   get_timeline    → the current (patched) merged timeline as JSON
 *
 * Lives in `cli` (Node-only) — NEVER on the ≤39 kB embed path. The tool logic is in
 * `mcpSession.ts` (unit-tested); this file is the thin JSON-RPC/stdio wiring.
 */

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { TimelinePatch } from '@glissade/core/studio-host';
import { McpSession } from './mcpSession.js';
import { glissadeVersion } from './version.js';

const TOOLS = [
  {
    name: 'describe',
    description:
      'The glissade API manifest: every node type with its props (animatable ones carry a track target template), value types, easings, builder methods and helpers. Read this to know what is animatable before patching.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_targets',
    description:
      "The concrete animatable targets of the LOADED scene: for every node, its '<nodeId>/<prop>' track targets (id-substituted) + the value type each expects. Patch only these.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'apply_patch',
    description:
      "Apply a batch of Timeline Patch ops to the scene's edit sidecar — validated (a target that isn't animatable on this scene is rejected before it touches the doc) and reversible (undo restores it). Ops: setTrackKeys/removeTrack/addKey/removeKey/moveKey/setKeyValue/setKeyEase/setLabel/removeLabel. Each track op carries { op, timelineId:'main', target:'<id>/<prop>', ... }.",
    inputSchema: {
      type: 'object',
      properties: { patches: { type: 'array', items: { type: 'object' }, description: 'TimelinePatch[]' } },
      required: ['patches'],
      additionalProperties: false,
    },
  },
  {
    name: 'undo',
    description: 'Revert the most recent apply_patch (apply its recorded inverse).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'render_frame',
    description:
      'Render ONE frame of the current (patched) scene at time t (seconds) to a PNG and return it inline as an image — the deterministic verifier. Call it after a patch to SEE the result.',
    inputSchema: {
      type: 'object',
      properties: { t: { type: 'number', description: 'time in seconds', minimum: 0 } },
      required: ['t'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_timeline',
    description: 'The current merged timeline (code + your edits) as JSON — tracks, labels, duration.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const;

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

/** Start the gs mcp stdio server for a scene module. Resolves when the transport closes. */
export async function startMcpServer(modulePath: string): Promise<void> {
  const session = await McpSession.load(modulePath);
  const frameDir = mkdtempSync(join(tmpdir(), 'gs-mcp-frames-'));
  const server = new Server(
    { name: 'glissade', version: glissadeVersion() },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS.map((t) => ({ ...t })) }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      switch (name) {
        case 'describe':
          return text(session.describe());
        case 'list_targets':
          return text(session.listTargets());
        case 'get_timeline':
          return text(session.mergedTimeline());
        case 'apply_patch': {
          const patches = (args as { patches?: unknown }).patches;
          if (!Array.isArray(patches)) return { content: [{ type: 'text', text: 'error: `patches` must be an array of TimelinePatch ops' }], isError: true };
          const r = session.applyPatch(patches as TimelinePatch[]);
          return r.ok
            ? text({ ok: true, edits: session.editCount(), inverse: r.inverse })
            : { content: [{ type: 'text', text: `patch rejected: ${r.error}` }], isError: true };
        }
        case 'undo': {
          const r = session.undo();
          return r.ok ? text({ ok: true, edits: session.editCount() }) : { content: [{ type: 'text', text: r.error ?? 'undo failed' }], isError: true };
        }
        case 'render_frame': {
          const t = Number((args as { t?: unknown }).t);
          if (!Number.isFinite(t) || t < 0) return { content: [{ type: 'text', text: 'error: `t` must be a number ≥ 0 (seconds)' }], isError: true };
          const out = join(frameDir, `frame-${Date.now()}.png`);
          const info = await session.renderFrame(t, out);
          const b64 = readFileSync(out).toString('base64');
          return {
            content: [
              { type: 'text', text: `rendered ${info.width}×${info.height} @ t=${t}s → ${out}` },
              { type: 'image', data: b64, mimeType: 'image/png' },
            ],
          };
        }
        default:
          return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  await server.connect(new StdioServerTransport());
  // The transport keeps the process alive on stdin; resolve when it closes.
  await new Promise<void>((resolve) => server.onclose = resolve);
}
