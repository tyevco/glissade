// Fixture scene for the gs parity media/asset test — a Rect backdrop + an Image
// bound to a real committed PNG (parity-swatch.png). Exercises the asset-decode
// leg of prepareSkiaRenderEnv: gs parity used to ERROR on any image scene (no
// asset decode); now the reference decodes + draws it. (The Lottie leg drops the
// image with a warning, so this scene diverges — the test only asserts it RENDERS
// without error, i.e. the asset path is wired.)
import { timeline } from '@glissade/core';
import { createScene, Rect, Image, type SceneModule } from '@glissade/scene';

const mod: SceneModule = {
  createScene: () =>
    createScene({
      size: { w: 64, h: 64 },
      children: [
        new Rect({ id: 'bg', width: 64, height: 64, position: [32, 32], fill: '#10131a' }),
        new Image({ id: 'swatch', assetId: 'swatch', width: 48, height: 48, position: [32, 32] }),
      ],
    }),
  timeline: timeline(() => {}, {
    fps: 60,
    duration: 0.2,
    assets: { swatch: { kind: 'image', url: './parity-swatch.png' } },
  }),
};

export default mod;
