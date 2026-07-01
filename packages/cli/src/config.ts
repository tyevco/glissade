/**
 * `@glissade/cli/config` — the typed surface for a `glissade.config.ts` project
 * file consumed by `gs build`. A config may also just default-export a plain
 * `{ scenes: [...] }` object; `defineProject` only adds type-checking.
 *
 *   import { defineProject } from '@glissade/cli/config';
 *   export default defineProject({ scenes: ['episodes/**\/*.ts'] });
 */

export { defineProject, type ProjectConfig } from './build.js';
