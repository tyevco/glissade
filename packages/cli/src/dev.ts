/**
 * gs dev (v2 §C.5): serve the scene with its machines mounted; --record adds
 * a Record button that writes .trace.json sidecars next to the module on
 * stop. This is the walkable capture path — producing a trace must never
 * require a hand-written harness page.
 */

import { createServer, type Server } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';

export interface DevOptions {
  modulePath: string;
  port?: number;
  record?: boolean;
}

export interface DevServer {
  port: number;
  close(): Promise<void>;
}

/** The in-browser harness, bundled fresh per page load (F5 picks up edits). */
function harnessSource(absModulePath: string, record: boolean): string {
  return `
import mod from ${JSON.stringify(absModulePath)};
import { mount } from '@glissade/player';
import { createMachine, recordTrace } from '@glissade/interact';

const scene = mod.createScene();
const canvas = document.getElementById('stage');
canvas.width = scene.size.w;
canvas.height = scene.size.h;
const mounted = mount(scene, mod.timeline, canvas, { loop: true, autoplay: true });

const machines = [];
for (const spec of mod.machines ?? []) {
  const machine = createMachine(spec.doc, {
    resolve: (t) => scene.resolveTarget(t),
    ...(spec.timelines ? { timelines: spec.timelines } : {}),
  });
  mounted.player.attach(machine);
  machine.clock.subscribe(() => mounted.render()); // machine steps repaint even while paused
  if (spec.wire) spec.wire({ scene, machine, element: canvas });
  machines.push(machine);
}
${
  record
    ? `
const btn = document.getElementById('rec');
const status = document.getElementById('status');
btn.style.display = 'inline-block';
let recs = null;
btn.onclick = async () => {
  if (!machines.length) { status.textContent = 'no machines declared by this module'; return; }
  if (!recs) {
    recs = machines.map((m) => ({ id: m.id, rec: recordTrace(m) }));
    btn.textContent = 'Stop & save';
    status.textContent = 'recording…';
    return;
  }
  const takes = recs.map(({ id, rec }) => ({ id, trace: rec.stop() }));
  recs = null;
  btn.textContent = 'Record';
  const res = await fetch('/__trace', { method: 'POST', body: JSON.stringify(takes) });
  status.textContent = 'saved ' + (await res.json()).saved.join(', ');
};`
    : ''
}
`;
}

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>gs dev</title>
<style>
  body { margin: 0; background: #16161a; color: #eee; font: 13px system-ui; display: grid; place-items: center; min-height: 100vh; }
  canvas { box-shadow: 0 4px 24px #000a; background: #fff; }
  #ui { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; align-items: center; }
  #rec { display: none; background: #e0245e; color: #fff; border: 0; border-radius: 6px; padding: 6px 14px; cursor: pointer; }
</style>
<div id="ui"><span id="status"></span><button id="rec">Record</button></div>
<canvas id="stage"></canvas>
<script type="module" src="/bundle.js"></script>
`;

function nextTakePath(moduleAbs: string, machineId: string): string {
  const dir = dirname(moduleAbs);
  const base = basename(moduleAbs, extname(moduleAbs));
  for (let n = 1; ; n++) {
    const p = join(dir, `${base}.${machineId}.take${n}.trace.json`);
    if (!existsSync(p)) return p;
  }
}

export async function dev(opts: DevOptions): Promise<DevServer> {
  const abs = isAbsolute(opts.modulePath) ? opts.modulePath : resolve(process.cwd(), opts.modulePath);
  const { build } = await import('esbuild');

  const bundle = async (): Promise<string> => {
    const result = await build({
      stdin: {
        contents: harnessSource(abs, opts.record ?? false),
        resolveDir: dirname(abs),
        sourcefile: 'gs-dev-harness.ts',
        loader: 'ts',
      },
      bundle: true,
      format: 'esm',
      write: false,
      sourcemap: 'inline',
      logLevel: 'silent',
    });
    return result.outputFiles[0]!.text;
  };

  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        if (req.method === 'POST' && req.url === '/__trace') {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const takes = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Array<{ id: string; trace: unknown }>;
          const saved: string[] = [];
          for (const take of takes) {
            const path = nextTakePath(abs, take.id);
            writeFileSync(path, JSON.stringify(take.trace, null, 2));
            saved.push(basename(path));
            process.stderr.write(`gs dev: wrote ${path}\n`);
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ saved }));
        } else if (req.url === '/bundle.js') {
          const js = await bundle();
          res.writeHead(200, { 'content-type': 'text/javascript' });
          res.end(js);
        } else {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(PAGE);
        }
      } catch (err) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
      }
    })();
  });

  await new Promise<void>((resolveListen) => server.listen(opts.port ?? 0, () => resolveListen()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? 0);
  return {
    port,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
