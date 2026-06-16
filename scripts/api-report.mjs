/**
 * API-surface reports (DESIGN.md §7). Runs api-extractor over each published
 * package's built `dist/index.d.ts` and writes a committed Markdown report to
 * `packages/<pkg>/etc/<unscoped>.api.md`. The report is the reviewable public
 * type surface: any change to it shows up in the diff, so an accidental export
 * (or a removed one) is caught in review.
 *
 *   node scripts/api-report.mjs           # CI/verify: fail if a report is stale
 *   node scripts/api-report.mjs --local   # regenerate reports (run after API changes)
 *
 * Reports are generated from already-built .d.ts, so run `pnpm build` first.
 */

import { readdirSync, readFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localBuild = process.argv.includes('--local');
// freshly-generated copies go here for the comparison, not into the repo tree
const tempFolder = mkdtempSync(join(tmpdir(), 'glissade-api-'));

const packages = readdirSync(join(root, 'packages'))
  .map((name) => join(root, 'packages', name))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .filter((dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).private !== true)
  .sort();

// Noise we deliberately don't gate on: we don't use @public/@beta release tags,
// and tsdoc/undocumented/link diagnostics aren't the point of these reports.
const silenced = {
  'ae-missing-release-tag': { logLevel: 'none' },
  'ae-undocumented': { logLevel: 'none' },
  'ae-unresolved-link': { logLevel: 'none' },
  'ae-forgotten-export': { logLevel: 'warning', addToApiReportFile: true },
};

let stale = 0;
let failed = 0;
for (const dir of packages) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const unscoped = pkg.name.replace(/^@[^/]+\//, '');
  const entry = join(dir, 'dist', 'index.d.ts');
  if (!existsSync(entry)) {
    console.error(`FAIL ${pkg.name}: ${entry} missing — run pnpm build first`);
    failed++;
    continue;
  }

  mkdirSync(join(dir, 'etc'), { recursive: true });
  const config = ExtractorConfig.prepare({
    configObject: {
      projectFolder: dir,
      mainEntryPointFilePath: entry,
      apiReport: { enabled: true, reportFolder: join(dir, 'etc'), reportTempFolder: tempFolder, reportFileName: `${unscoped}.api.md` },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
      compiler: {
        overrideTsconfig: {
          compilerOptions: {
            target: 'ESNext',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            skipLibCheck: true,
            strict: false,
            types: ['node'],
          },
          files: [entry],
        },
      },
      messages: {
        compilerMessageReporting: { default: { logLevel: 'none' } },
        extractorMessageReporting: { default: { logLevel: 'warning' }, ...silenced },
        tsdocMessageReporting: { default: { logLevel: 'none' } },
      },
    },
    configObjectFullPath: join(dir, 'api-extractor.json'),
    packageJsonFullPath: join(dir, 'package.json'),
  });

  const result = Extractor.invoke(config, { localBuild, showVerboseMessages: false });
  if (result.succeeded) {
    console.log(`ok   ${pkg.name}`);
  } else if (result.apiReportChanged && !localBuild) {
    stale++;
    console.error(`STALE ${pkg.name}: etc/${unscoped}.api.md is out of date — run \`node scripts/api-report.mjs --local\` and commit`);
  } else {
    failed++;
    console.error(`FAIL ${pkg.name}: ${result.errorCount} error(s), ${result.warningCount} warning(s)`);
  }
}

if (failed > 0 || stale > 0) {
  console.error(`\napi-extractor: ${stale} stale, ${failed} failed.`);
  process.exit(1);
}
console.log(`\napi-extractor ok — ${packages.length} reports ${localBuild ? 'written' : 'up to date'}.`);
