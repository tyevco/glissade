#!/usr/bin/env node
/**
 * One-time backfill of GitHub Releases for versions published to npm WITHOUT a
 * git tag / GitHub Release. Tags + releases stopped at v0.4.5; 0.5.0 → 0.16.0
 * (17 stable versions) were published with neither. This idempotently creates a
 * `v<version>` tag (at the version's release commit) + a GitHub Release whose
 * notes are that commit's body (the per-release summary written at version time;
 * the umbrella CHANGELOG is dep-only and too sparse). Pre-releases are skipped.
 * `gh release create --target <sha>` creates the remote tag + the release in one
 * atomic call, so no local tag/push dance is needed.
 *
 *   node scripts/backfill-releases.mjs           # DRY RUN — prints what it would do
 *   node scripts/backfill-releases.mjs --apply   # create the tags + releases
 *
 * Requires: gh (authenticated), git. Safe to re-run — existing releases skip.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const APPLY = process.argv.includes('--apply');

// version → release-commit SHA (verified against `git log --grep "Version Packages:"`;
// 0.5.0 is the manual `Release 0.5.0` commit). Newest last so --latest lands on 0.16.0.
const RELEASES = [
  ['0.5.0', '379a4c0'], ['0.6.0', '9462bd7'], ['0.6.1', 'a7aa7e9'], ['0.7.0', '0c1c667'],
  ['0.8.0', '21b7fd0'], ['0.8.1', '3d6dc98'], ['0.9.0', '29e21c6'], ['0.9.1', '27e9d5c'],
  ['0.10.0', '3d80b91'], ['0.10.1', '9dcb007'], ['0.11.0', 'faaaf6d'], ['0.12.0', '2255512'],
  ['0.12.1', '30a66f5'], ['0.13.0', 'f5a0221'], ['0.14.0', 'bb35294'], ['0.15.0', 'bb208ad'],
  ['0.16.0', 'a7a03cf'],
];
const LATEST = RELEASES[RELEASES.length - 1][0];

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const releaseExists = (tag) => {
  try { execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' }); return true; } catch { return false; }
};

/** Notes = the release commit's body (the per-release summary). Falls back to a stub. */
function notesFor(sha, ver) {
  const msg = git('show', '-s', '--format=%B', sha).trim();
  const body = msg.replace(/^Version Packages:[^\n]*\n*/, '').replace(/^Release [^\n]*\n*/, '').trim();
  const stub = `glissade ${ver} — published to npm (lockstep). See the package CHANGELOGs for details.`;
  const notes = body.length > 0 ? body : stub;
  return `${notes}\n\n---\n*Backfilled release. Published to npm \`@glissade/*@${ver}\` (Apache-2.0).*`;
}

const tmp = mkdtempSync(join(tmpdir(), 'gs-backfill-'));
let created = 0, skipped = 0;

for (const [ver, sha] of RELEASES) {
  const tag = `v${ver}`;
  if (releaseExists(tag)) { console.log(`SKIP  ${tag} (release exists)`); skipped++; continue; }
  const notes = notesFor(sha, ver);
  const target = git('rev-parse', sha); // GitHub's target_commitish needs the FULL sha
  const isLatest = ver === LATEST;
  const firstLine = notes.split('\n').find((l) => l.trim()) ?? '';
  console.log(`\n${APPLY ? 'CREATE' : 'DRY  '} ${tag}  --target ${target.slice(0, 10)}  ${isLatest ? '(--latest)' : ''}`);
  console.log(`        notes[0]: ${firstLine.slice(0, 110)}`);
  if (!APPLY) continue;

  const nf = join(tmp, `${tag}.md`);
  writeFileSync(nf, notes);
  execFileSync('gh', [
    'release', 'create', tag, '--target', target, '--title', tag, '--notes-file', nf,
    isLatest ? '--latest' : '--latest=false',
  ], { stdio: 'inherit' });
  created++;
}

console.log(`\n${APPLY ? 'Done' : 'Dry run'}: ${created} to create, ${skipped} skipped.${APPLY ? '' : '  Re-run with --apply to execute.'}`);
