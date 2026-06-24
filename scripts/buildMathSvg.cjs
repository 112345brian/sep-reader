#!/usr/bin/env node
/*
 * Math corpus AUDIT / SIZING tool. NOT a shipped-asset producer.
 *
 * Walks the cached corpus, extracts every TeX equation, dedups by content hash,
 * renders each unique equation to SVG via MathJax, and writes a keyed store to
 * .audit/math-store.json (gitignored). It reports raw + gzipped size so we know
 * the on-device cache's eventual footprint.
 *
 * IMPORTANT: this output must NOT be folded into the content DB or app bundle.
 * Math is rendered ON-DEVICE at runtime (src/utils/sepHtml/render/mathStore.ts):
 * the client builds each SVG from fetched TeX and stores it locally. SEP-derived
 * rendered output may not be redistributed — see NOTICE.md / AGENTS.md. This
 * script exists only to measure and validate, never to ship.
 *
 * Usage: node scripts/buildMathSvg.cjs [limit]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.audit', 'cache');
const OUT = path.join(ROOT, '.audit', 'math-store.json');
const { parseSepHtml } = require(path.join(ROOT, '.audit', 'parser', 'parse.js'));
const { texToSvg } = require(path.join(ROOT, 'scripts', 'renderMath.cjs'));

const LIMIT = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;

function bodyOf(file) {
  const h = fs.readFileSync(path.join(CACHE, file), 'utf8');
  if (!h) return null;
  const s = /<(div)[^>]*\bid="aueditable"[^>]*>/i.exec(h);
  if (!s) return null;
  let d = 1, i = s.index + s[0].length;
  while (i < h.length && d > 0) {
    const o = h.indexOf('<div', i), c = h.indexOf('</div>', i);
    if (c === -1) break;
    if (o !== -1 && o < c) { d++; i = o + 1; } else { d--; i = c + 6; }
  }
  return h.slice(s.index + s[0].length, i - 6);
}

function collectMath(blocks, acc) {
  const wi = a => a.forEach(x => { if (x.t === 'math') acc.push(x); if (x.children) wi(x.children); });
  blocks.forEach(b => {
    if (b.t === 'para' || b.t === 'heading') wi(b.children);
    else if (b.t === 'blockquote') collectMath(b.children, acc);
    else if (b.t === 'list') b.items.forEach(it => collectMath(it, acc));
    else if (b.t === 'deflist') b.rows.forEach(r => collectMath(r.def, acc));
    else if (b.t === 'table') { if (b.caption) wi(b.caption); b.rows.forEach(r => r.cells.forEach(wi)); }
  });
}

const hashOf = (tex, display) =>
  crypto.createHash('sha1').update((display ? 'D' : 'I') + tex).digest('hex').slice(0, 16);

function main() {
  const files = fs.readdirSync(CACHE).filter(f => f.endsWith('.html')).slice(0, LIMIT);
  const store = {};
  let total = 0, errors = 0, done = 0;
  const t0 = Date.now();

  for (const file of files) {
    let body;
    try { body = bodyOf(file); } catch { continue; }
    if (!body) continue;
    let parsed;
    try { parsed = parseSepHtml(body); } catch { continue; }
    const math = [];
    collectMath(parsed.blocks, math);
    for (const m of math) {
      total++;
      const key = hashOf(m.tex, m.display);
      if (store[key]) continue; // dedup
      const r = texToSvg(m.tex, m.display);
      if (r.error) { errors++; continue; }
      store[key] = { s: r.svg, w: r.width, h: r.height, d: m.display ? 1 : 0 };
    }
    if (++done % 200 === 0) process.stdout.write(`  ${done}/${files.length} articles, ${Object.keys(store).length} unique eqs\n`);
  }

  const json = JSON.stringify(store);
  fs.writeFileSync(OUT, json);
  const gz = zlib.gzipSync(json, { level: 9 });
  const dt = Date.now() - t0;

  console.log('\n=== MATH STORE BUILT ===');
  console.log(`articles scanned : ${done}`);
  console.log(`equations total  : ${total}`);
  console.log(`unique equations : ${Object.keys(store).length}  (dedup ${(total / Object.keys(store).length).toFixed(1)}x)`);
  console.log(`render errors    : ${errors}`);
  console.log(`raw store size   : ${(json.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`gzipped (shipped): ${(gz.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`build time       : ${(dt / 1000).toFixed(1)}s  (${(dt / total).toFixed(2)}ms/eq)`);
  console.log(`output           : ${OUT}`);
}

main();
