import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { glissade, sidecarPathFor } from '../src/index.js';

const tmp = mkdtempSync(join(tmpdir(), 'glissade-vite-plugin-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

type Handler = (req: FakeReq, res: FakeRes) => void;

class FakeReq {
  private listeners = new Map<string, (arg?: unknown) => void>();
  constructor(
    public method: string,
    public url: string,
    private body?: string,
  ) {}
  on(event: string, cb: (arg?: unknown) => void): void {
    this.listeners.set(event, cb);
    if (event === 'end') {
      if (this.body !== undefined) this.listeners.get('data')?.(Buffer.from(this.body));
      cb();
    }
  }
}

class FakeRes {
  statusCode = 200;
  body = '';
  setHeader(): void {}
  end(chunk?: string): void {
    this.body = chunk ?? '';
  }
}

function makeHandlers(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const plugin = glissade({ root: tmp });
  const fakeServer = {
    config: { root: tmp },
    middlewares: { use: (path: string, fn: Handler) => handlers.set(path, fn) },
  };
  (plugin.configureServer as (s: unknown) => void)(fakeServer);
  return handlers;
}

const call = (h: Handler, method: string, url: string, body?: string): FakeRes => {
  const res = new FakeRes();
  h(new FakeReq(method, url, body), res);
  return res;
};

describe('/__glissade/project (§6.2): glissade.project.json at the root', () => {
  const h = makeHandlers().get('/__glissade/project')!;

  it('GET returns null before the file exists; POST writes and round-trips', () => {
    expect(call(h, 'GET', '/').body).toBe('null');
    const doc = {
      projectVersion: 1,
      markers: [{ t: 1.5, name: 'beat' }],
      renderPresets: { final: { fps: 60, out: 'out.mp4' } },
    };
    const post = call(h, 'POST', '/', JSON.stringify(doc));
    expect(post.statusCode).toBe(200);
    expect(JSON.parse(readFileSync(join(tmp, 'glissade.project.json'), 'utf8'))).toEqual(doc);
    expect(JSON.parse(call(h, 'GET', '/').body)).toEqual(doc);
  });

  it('rejects wrong versions and invalid JSON', () => {
    expect(call(h, 'POST', '/', JSON.stringify({ projectVersion: 2 })).statusCode).toBe(422);
    expect(call(h, 'POST', '/', '{nope').statusCode).toBe(400);
    expect(call(h, 'PUT', '/').statusCode).toBe(405);
  });
});

describe('/__glissade/sidecar: regression', () => {
  const h = makeHandlers().get('/__glissade/sidecar')!;

  it('round-trips a sidecar next to the scene and confines paths to the root', () => {
    writeFileSync(join(tmp, 'scene.ts'), '// scene');
    const doc = { sidecarVersion: 1, tracks: [] };
    const url = `/?scene=${encodeURIComponent('scene.ts')}`;
    expect(call(h, 'POST', url, JSON.stringify(doc)).statusCode).toBe(200);
    expect(JSON.parse(call(h, 'GET', url).body)).toEqual(doc);
    expect(sidecarPathFor('/a/b/scene.ts')).toBe('/a/b/scene.edits.json');
    expect(call(h, 'GET', `/?scene=${encodeURIComponent('../outside.ts')}`).statusCode).toBe(400);
  });
});
