/**
 * The glissade VERSION string folded into the persistent frame-cache key
 * (DESIGN.md §3.5, 0.12). Lockstep `0.x` versioning means the @glissade/cli
 * package version bumps with EVERY release, so any Raster2D-composite or
 * Skia-toolchain change ships under a new version — making bump-on-version the
 * cheapest CORRECT cache invalidation. Read once from the package manifest (the
 * single source of truth) rather than hard-coded so it can never drift from the
 * published version.
 */

import { createRequire } from 'node:module';

let cached: string | undefined;

/** The @glissade/cli package version (the glissade VERSION for the cache key). */
export function glissadeVersion(): string {
  if (cached !== undefined) return cached;
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version?: string };
    cached = pkg.version ?? '0.0.0';
  } catch {
    cached = '0.0.0';
  }
  return cached;
}
