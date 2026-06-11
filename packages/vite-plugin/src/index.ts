/**
 * @glissade/vite-plugin (DESIGN.md §6.1): dev-server middleware persisting
 * studio sidecars. GET/POST /__glissade/sidecar?scene=<module-path> reads and
 * writes `<module>.edits.json` next to the scene module. Writes are confined
 * to *.edits.json paths inside the configured root.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, normalize, resolve, sep } from 'node:path';
import { type Plugin } from 'vite';

export interface GlissadeSidecarOptions {
  /** Directory sidecar writes are confined to; defaults to the vite root. */
  root?: string;
}

export function sidecarPathFor(scenePath: string): string {
  return scenePath.replace(/\.[jt]sx?$/, '') + '.edits.json';
}

export function glissade(options: GlissadeSidecarOptions = {}): Plugin {
  return {
    name: 'glissade-sidecar',
    configureServer(server) {
      const root = resolve(options.root ?? server.config.root);

      const resolveScene = (scene: string | null): string | null => {
        if (!scene) return null;
        const abs = normalize(isAbsolute(scene) ? scene : resolve(root, scene));
        if (abs !== root && !abs.startsWith(root + sep)) return null; // confinement
        return sidecarPathFor(abs);
      };

      server.middlewares.use('/__glissade/sidecar', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const sidecarPath = resolveScene(url.searchParams.get('scene'));
        if (!sidecarPath || !sidecarPath.endsWith('.edits.json')) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'scene query param must resolve inside the project root' }));
          return;
        }
        if (req.method === 'GET') {
          res.setHeader('content-type', 'application/json');
          res.end(existsSync(sidecarPath) ? readFileSync(sidecarPath, 'utf8') : 'null');
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const doc = JSON.parse(body) as { sidecarVersion?: number };
              if (doc === null || doc.sidecarVersion !== 1) {
                res.statusCode = 422;
                res.end(JSON.stringify({ error: 'body must be a sidecarVersion 1 document' }));
                return;
              }
              writeFileSync(sidecarPath, JSON.stringify(doc, null, 2) + '\n');
              res.end(JSON.stringify({ ok: true, path: sidecarPath }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'invalid JSON body' }));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}
