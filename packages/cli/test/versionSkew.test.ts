/**
 * @glissade version-skew diagnostic (0.41.0-pre.1, video-canary adopt finding).
 * Installing `@glissade/cli` at a different version than the `@glissade/core` a
 * scene resolves is a dual-package hazard: subpath side-effect registries (the
 * `/expr` sampler, Yoga `layout`) register per-package-INSTANCE, so a correctly
 * imported `@glissade/core/expr` still fails with a misleading "need import". gs
 * warns on the skew BEFORE evaluate so the failure reads as "align versions".
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSceneModule } from '../src/render.js';
import { glissadeVersion } from '../src/version.js';

let dir: string;
let stderr: string;
let origWrite: typeof process.stderr.write;

/** A minimal project rooted at `dir`: a stubbed @glissade/core@<ver> + a scene.ts. */
const project = (coreVersion: string): string => {
  const core = join(dir, 'node_modules', '@glissade', 'core');
  mkdirSync(core, { recursive: true });
  writeFileSync(join(core, 'package.json'), JSON.stringify({ name: '@glissade/core', version: coreVersion, main: 'index.js', exports: { '.': './index.js' } }));
  writeFileSync(join(core, 'index.js'), 'module.exports = {};');
  const scene = join(dir, 'scene.ts');
  writeFileSync(scene, 'export default {};'); // invalid SceneModule — loadSceneModule throws AFTER the skew check
  return scene;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gs-skew-'));
  stderr = '';
  origWrite = process.stderr.write;
  process.stderr.write = ((c: string | Uint8Array): boolean => { stderr += c.toString(); return true; }) as typeof process.stderr.write;
});
afterEach(() => { process.stderr.write = origWrite; rmSync(dir, { recursive: true, force: true }); });

describe('version-skew warning', () => {
  it('WARNS when the scene resolves a different @glissade/core than the running cli', async () => {
    const scene = project('0.1.0-skewed'); // deliberately != cli version
    await expect(loadSceneModule(scene)).rejects.toThrow(); // stub is not a SceneModule
    expect(stderr).toMatch(/version skew/i);
    expect(stderr).toContain('0.1.0-skewed');
    expect(stderr).toContain(glissadeVersion()); // names the target version to align to
    expect(stderr).toMatch(/expr|LayoutEngine/); // explains WHY (the per-instance registries)
  });

  it('is SILENT when the resolved core version matches the cli version (no false positive)', async () => {
    const scene = project(glissadeVersion()); // matched → no skew
    await expect(loadSceneModule(scene)).rejects.toThrow();
    expect(stderr).not.toMatch(/version skew/i);
  });

  it('is SILENT when @glissade/core cannot be resolved (never blocks a render)', async () => {
    const scene = join(dir, 'lonely.ts'); // no node_modules/@glissade/core at all
    writeFileSync(scene, 'export default {};');
    await expect(loadSceneModule(scene)).rejects.toThrow();
    expect(stderr).not.toMatch(/version skew/i);
  });
});
