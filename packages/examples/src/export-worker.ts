/**
 * Export worker (§5.1): the examples' scene registry served through the
 * export-web worker protocol. Vite bundles this via new Worker(new URL(...)).
 */

import { serveExportRequest, type ExportWorkerRequest, type ExportWorkerResponse } from '@glissade/export-web';
import goldenShapes from './scenes/golden-shapes.js';
import withAudio from './scenes/with-audio.js';

const corpus = { shapes: goldenShapes, audio: withAudio } as const;

self.onmessage = (e: MessageEvent<ExportWorkerRequest>) => {
  void serveExportRequest(
    e.data,
    (key) => {
      const mod = corpus[key as keyof typeof corpus];
      if (!mod) throw new Error(`unknown export scene '${key}'`);
      return Promise.resolve(mod.createScene());
    },
    (msg: ExportWorkerResponse, transfer) => self.postMessage(msg, { transfer: transfer ?? [] }),
  );
};
