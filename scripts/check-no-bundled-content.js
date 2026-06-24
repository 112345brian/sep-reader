#!/usr/bin/env node
/**
 * CI guard: enforce the "fetch, don't bundle" rule.
 *
 * SEP article content is © the Metaphysics Research Lab, Stanford University, and
 * is not openly licensed. We may distribute the TOOL that fetches the archive onto
 * the user's device — never the content itself. This script fails the build if a
 * forbidden content artifact could ship.
 *
 * Fails if any TRACKED file:
 *   1. is a database file (*.db, *.sqlite, *.sqlite3), anywhere; or
 *   2. lives under a bundled-asset dir (src/assets/) AND exceeds MAX_ASSET_BYTES,
 *      unless it is on ALLOWLIST.
 *
 * Dependency-free; uses `git ls-files` so only committed/staged files are checked.
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

// ── Knobs ──────────────────────────────────────────────────────────────────
// Bundled-asset directories whose large files must be justified.
const ASSET_DIRS = ['src/assets/'];

// Max size for an unlisted file under an asset dir. The legitimate index files
// (entry-seed.json ~146 KB, linkMapData.ts ~180 KB) sit well under 1 MB; a SQLite
// archive of ~1,800 articles would be many MB. 1 MB leaves comfortable headroom.
const MAX_ASSET_BYTES = 1024 * 1024; // 1 MB

// Files explicitly permitted to be large in asset dirs. These contain ONLY the
// entry title/link index (slugs + titles + cross-link targets) — facts, not
// copyrightable article prose.
const ALLOWLIST = new Set([
  'src/assets/entry-seed.json',
  'src/assets/linkMapData.ts',
]);

// Database extensions are never allowed in the artifact, regardless of size/path.
const DB_RE = /\.(db|sqlite|sqlite3)$/i;
// ───────────────────────────────────────────────────────────────────────────

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

const violations = [];

for (const file of trackedFiles()) {
  if (DB_RE.test(file)) {
    violations.push(`  ✗ ${file} — database files may never be committed (would ship SEP content).`);
    continue;
  }

  const inAssetDir = ASSET_DIRS.some((d) => file.startsWith(d));
  if (!inAssetDir || ALLOWLIST.has(file)) continue;

  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    continue; // listed but absent (e.g. submodule) — nothing to check
  }
  if (size > MAX_ASSET_BYTES) {
    violations.push(
      `  ✗ ${file} — ${(size / 1024 / 1024).toFixed(2)} MB exceeds ${(MAX_ASSET_BYTES / 1024 / 1024).toFixed(0)} MB ` +
        `and is not on the allowlist. If this is the title/link index, add it to ALLOWLIST in ` +
        `scripts/check-no-bundled-content.js. If it contains SEP article text, it must NOT ship.`
    );
  }
}

if (violations.length) {
  console.error('\nFETCH-DON\'T-BUNDLE CHECK FAILED\n');
  console.error(
    'SEP article content is © the Metaphysics Research Lab, Stanford University, and may\n' +
      'not be redistributed. This app ships only the fetcher + title/link index; article\n' +
      'content is fetched on-device at runtime. The following would violate that rule:\n'
  );
  console.error(violations.join('\n'));
  console.error('\nSee NOTICE.md for the full policy.\n');
  process.exit(1);
}

console.log('fetch-don\'t-bundle check passed — no forbidden content artifacts found.');
