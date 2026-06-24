#!/usr/bin/env node
/*
 * Corpus audit for the native SEP renderer.
 *
 * Fetches every SEP entry body (cached + resumable), runs the parser over each,
 * and reports: parser exceptions, `unsupported` blocks, dropped inline content,
 * and a full tag census flagging every tag the parser does NOT explicitly model.
 * That census is how we discover edge cases (MathML, SVG, iframe, video, …) and
 * decide which RN library to bundle for each.
 *
 * Usage: node scripts/auditCorpus.cjs [limit]
 *   - Re-running is cheap: cached HTML is reused; only parsing re-runs.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.audit', 'cache');
const REPORT = path.join(ROOT, '.audit', 'report.json');
const { parseSepHtml } = require(path.join(ROOT, '.audit', 'parser', 'parse.js'));

const BASE = 'https://plato.stanford.edu';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};
const CONCURRENCY = 6;
// Subcommands:
//   node auditCorpus.cjs fetch <shard> <nshards>   → cache shard's articles only
//   node auditCorpus.cjs parse                      → parse whole cache, write report
//   node auditCorpus.cjs [limit]                    → fetch+parse all (single process)
const MODE = ['fetch', 'parse'].includes(process.argv[2]) ? process.argv[2] : 'all';
const SHARD = MODE === 'fetch' ? parseInt(process.argv[3] || '0', 10) : 0;
const NSHARDS = MODE === 'fetch' ? parseInt(process.argv[4] || '1', 10) : 1;
const LIMIT = MODE === 'all' && process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;

fs.mkdirSync(CACHE, { recursive: true });

// Tags the parser explicitly models (block + inline). Anything else is "unknown"
// and gets surfaced so we never assume it was handled.
const KNOWN = new Set([
  'p','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','dl','dt','dd',
  'table','thead','tbody','tfoot','tr','td','th','hr','img','div','section',
  'em','i','strong','b','a','sup','sub','code','tt','br','span',
]);

// ── mirror of catalog.ts extractById ────────────────────────────────────────
function extractById(html, id) {
  const start = new RegExp(`<(div|nav|section|ol|ul)[^>]*\\bid="${id}"[^>]*>`, 'i');
  const m = start.exec(html);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  let depth = 1;
  let i = m.index + m[0].length;
  while (i < html.length && depth > 0) {
    const open = html.indexOf(`<${tag}`, i);
    const close = html.indexOf(`</${tag}>`, i);
    if (close === -1) break;
    if (open !== -1 && open < close) { depth++; i = open + 1; }
    else { depth--; i = close + tag.length + 3; }
  }
  return html.slice(m.index + m[0].length, i - tag.length - 3).trim() || null;
}

async function fetchWithRetry(url, tries = 3) {
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 500 * (a + 1)));
  }
  return undefined; // signals fetch failure (distinct from 404 null)
}

async function getBody(slug) {
  const file = path.join(CACHE, `${slug}.html`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  if (MODE === 'parse') return undefined; // parse mode is cache-only, never fetches
  const html = await fetchWithRetry(`${BASE}/entries/${slug}/`);
  if (html === undefined) return undefined; // network fail
  if (html === null) { fs.writeFileSync(file, ''); return ''; } // 404 -> empty marker
  fs.writeFileSync(file, html);
  return html;
}

function censusTags(body) {
  const tags = {};
  const re = /<([a-zA-Z][a-zA-Z0-9:-]*)\b/g;
  let m;
  while ((m = re.exec(body))) {
    const t = m[1].toLowerCase();
    tags[t] = (tags[t] || 0) + 1;
  }
  return tags;
}

function recurseUnsupported(blocks, out) {
  for (const b of blocks) {
    if (b.t === 'unsupported') out.push({ reason: b.reason, sample: b.html.slice(0, 160) });
    else if (b.t === 'blockquote') recurseUnsupported(b.children, out);
    else if (b.t === 'list') b.items.forEach(it => recurseUnsupported(it, out));
    else if (b.t === 'deflist') b.rows.forEach(r => recurseUnsupported(r.def, out));
  }
}

// Count math nodes across the AST and collect their TeX for build-time render.
// `leftover` counts delimiters surviving in TEXT nodes only — i.e. real math
// that failed to tokenize (would render as raw source). Delimiter-like
// sequences inside an extracted `tex` field don't count.
function collectMath(blocks, acc, stats) {
  const walkI = arr => {
    for (const x of arr) {
      if (x.t === 'math') acc.push(x);
      else if (x.t === 'text' && stats) {
        const lo = (x.v.match(/\\\(|\\\[/g) || []).length;
        if (lo) stats.leftover += lo;
      }
      if (x.children) walkI(x.children);
    }
  };
  for (const b of blocks) {
    if (b.t === 'para' || b.t === 'heading') walkI(b.children);
    else if (b.t === 'blockquote') collectMath(b.children, acc, stats);
    else if (b.t === 'list') b.items.forEach(it => collectMath(it, acc, stats));
    else if (b.t === 'deflist') b.rows.forEach(r => collectMath(r.def, acc, stats));
    else if (b.t === 'table') { if (b.caption) walkI(b.caption); b.rows.forEach(row => row.cells.forEach(walkI)); }
  }
}

// ── fetch-only sharded mode ─────────────────────────────────────────────────
async function fetchShard() {
  const seed = require(path.join(ROOT, 'src', 'assets', 'entry-seed.json'));
  const mine = seed.map(e => e.slug).filter((_, i) => i % NSHARDS === SHARD);
  let idx = 0, ok = 0, fail = 0, skip = 0;
  async function worker() {
    while (idx < mine.length) {
      const slug = mine[idx++];
      const file = path.join(CACHE, `${slug}.html`);
      if (fs.existsSync(file)) { skip++; continue; }
      const html = await fetchWithRetry(`${BASE}/entries/${slug}/`);
      if (html === undefined) { fail++; continue; }
      fs.writeFileSync(file, html === null ? '' : html);
      ok++;
      if ((ok + skip) % 50 === 0) process.stdout.write(`[shard ${SHARD}/${NSHARDS}] ${ok + skip + fail}/${mine.length} (ok ${ok}, cached ${skip}, fail ${fail})\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[shard ${SHARD}/${NSHARDS}] DONE: ok ${ok}, already-cached ${skip}, failed ${fail}`);
}

async function main() {
  if (MODE === 'fetch') return fetchShard();

  const seed = require(path.join(ROOT, 'src', 'assets', 'entry-seed.json'));
  const slugs = seed.map(e => e.slug).slice(0, LIMIT);

  const result = {
    total: slugs.length,
    fetched: 0,
    fetchFailed: [],
    notFound: [],
    parsed: 0,
    exceptions: [],          // { slug, error }
    unsupportedBy: {},        // reason -> { count, slugs:[], sample }
    unknownTags: {},          // tag -> { count, slugs:Set }
    tagTotals: {},            // tag -> total occurrences corpus-wide
    emptyBody: [],            // slug had no extractable body
    mathArticles: 0,          // articles containing >=1 math node
    mathInline: 0,
    mathDisplay: 0,
    unclosedDelim: [],        // { slug, count } — \( or \[ with no matching close left as text
  };

  let idx = 0;
  let done = 0;
  async function worker() {
    while (idx < slugs.length) {
      const slug = slugs[idx++];
      let html;
      try { html = await getBody(slug); }
      catch (e) { result.fetchFailed.push(slug); continue; }
      if (html === undefined) { result.fetchFailed.push(slug); continue; }
      if (html === '') { result.notFound.push(slug); done++; continue; }
      result.fetched++;

      const body = extractById(html, 'aueditable') || extractById(html, 'article-content');
      if (!body) { result.emptyBody.push(slug); done++; continue; }

      // tag census
      const tags = censusTags(body);
      for (const [t, c] of Object.entries(tags)) {
        result.tagTotals[t] = (result.tagTotals[t] || 0) + c;
        if (!KNOWN.has(t)) {
          const u = (result.unknownTags[t] = result.unknownTags[t] || { count: 0, slugs: [] });
          u.count += c;
          if (u.slugs.length < 8) u.slugs.push(slug);
        }
      }

      // parse, catching ANY exception
      try {
        const parsed = parseSepHtml(body);
        result.parsed++;
        // math census + unclosed-delimiter detection
        const math = [];
        const mathStats = { leftover: 0 };
        collectMath(parsed.blocks, math, mathStats);
        if (math.length) {
          result.mathArticles++;
          for (const m of math) m.display ? result.mathDisplay++ : result.mathInline++;
          if (mathStats.leftover > 0) result.unclosedDelim.push({ slug, count: mathStats.leftover });
        }
        const unsup = [];
        recurseUnsupported(parsed.blocks, unsup);
        for (const u of unsup) {
          const e = (result.unsupportedBy[u.reason] = result.unsupportedBy[u.reason] || { count: 0, slugs: [], sample: u.sample });
          e.count++;
          if (e.slugs.length < 8) e.slugs.push(slug);
        }
      } catch (err) {
        result.exceptions.push({ slug, error: String(err && err.stack || err).slice(0, 300) });
      }
      done++;
      if (done % 100 === 0) {
        process.stdout.write(`  ${done}/${slugs.length} processed (${result.exceptions.length} exc, ${Object.keys(result.unknownTags).length} unknown tags)\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // sort unknown tags by frequency
  result.unknownTags = Object.fromEntries(
    Object.entries(result.unknownTags).sort((a, b) => b[1].count - a[1].count)
  );
  fs.writeFileSync(REPORT, JSON.stringify(result, null, 2));

  console.log('\n=== CORPUS AUDIT COMPLETE ===');
  console.log(`fetched ${result.fetched} / ${result.total}  (failed ${result.fetchFailed.length}, 404 ${result.notFound.length}, empty ${result.emptyBody.length})`);
  console.log(`parsed ${result.parsed},  exceptions ${result.exceptions.length}`);
  console.log(`\nMATH: ${result.mathArticles} articles, ${result.mathInline} inline + ${result.mathDisplay} display nodes`);
  console.log(`  unclosed/leftover delimiters: ${result.unclosedDelim.length} articles${result.unclosedDelim.length ? ' -> ' + result.unclosedDelim.slice(0, 8).map(u => `${u.slug}(${u.count})`).join(', ') : ''}`);
  console.log('\nUNKNOWN TAGS (not modeled by parser):');
  for (const [t, info] of Object.entries(result.unknownTags)) {
    console.log(`  <${t}>  x${info.count}  e.g. ${info.slugs.slice(0, 4).join(', ')}`);
  }
  console.log('\nUNSUPPORTED BLOCKS (parser flagged for fallback):');
  for (const [reason, info] of Object.entries(result.unsupportedBy)) {
    console.log(`  ${reason}: ${info.count}  e.g. ${info.slugs.slice(0, 4).join(', ')}`);
  }
  if (result.exceptions.length) {
    console.log('\nEXCEPTIONS (first 5):');
    for (const e of result.exceptions.slice(0, 5)) console.log(`  ${e.slug}: ${e.error.split('\n')[0]}`);
  }
  console.log(`\nfull report: ${REPORT}`);
}

main();
