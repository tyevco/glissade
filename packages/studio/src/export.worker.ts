/**
 * Studio export worker (§5.1): the same scene-module glob the App uses, so
 * sceneKey === glob key on both sides. The worker re-creates the scene fresh
 * and renders the studio's sidecar-MERGED timeline — you export what you see.
 */

import { serveExportRequest, type ExportWorkerRequest, type ExportWorkerResponse } from '@glissade/export-web';
import { type SceneModule } from '@glissade/scene';

const scenes = import.meta.glob('../../examples/src/scenes/**/*.ts');

self.onmessage = (e: MessageEvent<ExportWorkerRequest>) => {
  void serveExportRequest(
    e.data,
    async (key) => {
      const loader = scenes[key];
      if (!loader) throw new Error(`unknown scene module '${key}'`);
      const mod = (await loader()) as { default?: SceneModule };
      if (typeof mod.default?.createScene !== 'function') {
        throw new Error(`'${key}' has no default SceneModule export`);
      }
      return mod.default.createScene();
    },
    (msg: ExportWorkerResponse, transfer) => self.postMessage(msg, { transfer: transfer ?? [] }),
  );
};
