/**
 * gs mcp — the stdio MCP server end-to-end. Spawns `gs mcp <scene>`, speaks
 * newline-delimited JSON-RPC (initialize → tools/list → tools/call), and asserts
 * the server advertises the write-layer tools and answers a real call. The tool
 * LOGIC is covered by mcpSession.test.ts; this pins the protocol wiring.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/mcp-scene.ts', import.meta.url));

interface Rpc { id?: number; result?: any; error?: any }

function client() {
  const proc: ChildProcess = spawn(process.execPath, [CLI, 'mcp', FIXTURE], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  const pending = new Map<number, (m: Rpc) => void>();
  proc.stdout!.on('data', (d: Buffer) => {
    buf += d.toString();
    for (let nl = buf.indexOf('\n'); nl >= 0; nl = buf.indexOf('\n')) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as Rpc;
        if (typeof msg.id === 'number' && pending.has(msg.id)) {
          pending.get(msg.id)!(msg);
          pending.delete(msg.id);
        }
      } catch {
        /* not a JSON-RPC line */
      }
    }
  });
  let id = 0;
  const req = (method: string, params: unknown = {}): Promise<Rpc> =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      pending.set(myId, resolve);
      proc.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id: myId, method, params })}\n`);
      setTimeout(() => reject(new Error(`mcp request timed out: ${method}`)), 20000);
    });
  const notify = (method: string) => proc.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  return { proc, req, notify };
}

let active: ChildProcess | undefined;
afterEach(() => active?.kill());

describe('gs mcp — stdio server', () => {
  it('initializes, advertises the write-layer tools, and answers a tool call', async () => {
    const c = client();
    active = c.proc;

    const init = await c.req('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    expect(init.result?.serverInfo?.name).toBe('glissade');
    c.notify('notifications/initialized');

    const tools = await c.req('tools/list');
    const names = (tools.result?.tools ?? []).map((t: { name: string }) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['describe', 'list_targets', 'apply_patch', 'undo', 'render_frame', 'get_timeline']),
    );

    // a real call through the transport → the session's list_targets
    const lt = await c.req('tools/call', { name: 'list_targets', arguments: {} });
    const payload = JSON.parse(lt.result.content[0].text) as { target: string }[];
    expect(payload.some((t) => t.target === 'box/opacity')).toBe(true);

    // apply_patch validation flows through too (bad target → isError)
    const bad = await c.req('tools/call', {
      name: 'apply_patch',
      arguments: { patches: [{ op: 'setTrackKeys', timelineId: 'main', target: 'ghost/opacity', type: 'number', keys: [{ t: 0, value: 1 }] }] },
    });
    expect(bad.result.isError).toBe(true);
  }, 40000);
});
