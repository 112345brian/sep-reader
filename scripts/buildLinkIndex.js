#!/usr/bin/env node
// Run: node scripts/buildLinkIndex.js
// Reads entry-seed.json → writes src/assets/linkMapData.ts
// Re-run whenever the SEP index changes.

const fs = require('fs');
const path = require('path');

const seed = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/assets/entry-seed.json'), 'utf8')
);

// Sort longest title first so the alternation regex matches most-specific first
const sorted = [...seed].sort((a, b) => b.title.length - a.title.length);

const entries = sorted.map(e => ({
  s: e.slug,
  t: e.title,
  // Pre-escape regex special chars, then add word boundaries so "war" doesn't
  // match inside "reward". String goes into JSON then into new RegExp(), so
  // one level of JSON unescaping happens before regex parsing.
  p: '\\b' + e.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b',
}));

const json = JSON.stringify(entries);

const out = `// AUTO-GENERATED — run: node scripts/buildLinkIndex.js
// ${entries.length} entries, sorted longest-title-first for longest-match linking
// eslint-disable-next-line
export const LINK_MAP_JSON: string = ${JSON.stringify(json)};
`;

const outPath = path.join(__dirname, '../src/assets/linkMapData.ts');
fs.writeFileSync(outPath, out, 'utf8');
console.log(`Wrote ${entries.length} entries to src/assets/linkMapData.ts (${(out.length / 1024).toFixed(1)} KB)`);
