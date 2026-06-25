#!/usr/bin/env node
/**
 * scripts/buildObsidianVault.mjs
 *
 * Fetches every SEP entry and writes it as an Obsidian-compatible markdown note,
 * enriched with InPhO (Internet Philosophy Ontology) data for people notes.
 *
 * Usage:
 *   node scripts/buildObsidianVault.mjs [output-dir] [options]
 *   node scripts/buildObsidianVault.mjs --output=~/Documents/SEP [options]
 *   node scripts/buildObsidianVault.mjs          ← prompts for location
 *
 * Options:
 *   --concurrency=N     parallel fetches (default: 3)
 *   --delay=N           ms between fetch slots (default: 800)
 *   --limit=N           only process first N SEP entries (for testing)
 *   --no-cache          bypass all caches; re-fetch everything
 *   --refresh           rewrite output files using cached HTML (fast reformat/backfill)
 *   --inpho-details     fetch per-thinker detail records; adds teachers/influenced_by/
 *                       related_ideas frontmatter with normalized [[wikilinks]]
 *   --all-thinkers      also create stub notes for InPhO thinkers with no SEP article
 *   --all-ideas         create concept stubs for InPhO ideas without SEP articles
 *                       (Marxism, Ontology, Analytic Philosophy, German Idealism, etc.)
 *                       These become hub nodes in the Obsidian graph, linked from
 *                       thinker notes via related_ideas frontmatter.
 *
 * File naming:
 *   People (InPhO thinkers):  lastname-firstname.md   e.g. marx-karl.md
 *   Mononyms:                 name.md                 e.g. aristotle.md
 *   Concepts / articles:      {sep-slug}.md           e.g. abduction.md
 *
 * InPhO data is fetched from inphoproject.org (CC BY-NC-SA) per-client at
 * runtime — same model as how the app fetches SEP articles. Never bundled.
 *
 * Output (default: ./sep-vault/):
 *   {name}.md             one note per entry / thinker
 *   _SEP Index.md         alphabetical index with wikilinks
 *   .obsidian/app.json    enables Obsidian LaTeX math rendering
 *
 * Caches (gitignored, resumable):
 *   .vault-cache/{slug}.html              SEP article HTML
 *   .vault-cache/inpho-index.json         bulk idea + thinker index
 *   .vault-cache/inpho-detail-{id}.json   per-thinker detail record
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { parseDocument } from 'htmlparser2';
import { findOne, findAll, getText, getAttributeValue } from 'domutils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENTRY_SEED = path.join(ROOT, 'src/assets/entry-seed.json');
const CACHE_DIR = path.join(ROOT, '.vault-cache');
const INPHO_BASE = 'https://www.inphoproject.org';
const SEP_BASE = 'https://plato.stanford.edu';
const INPHO_UA = 'Nous/0.6 (SEP vault builder; +https://github.com/112345brian/sep-reader)';

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith('--'));
const flagMap = new Map(argv.filter(a => a.startsWith('--')).map(f => {
  const [k, v] = f.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

let rawOutDir = positional[0] ?? flagMap.get('output');
if (!rawOutDir) rawOutDir = (await prompt('Vault folder path (created for you — no need to add a subfolder) [./sep-vault]: ')) || 'sep-vault';
const outDir = path.resolve(rawOutDir);
const concurrency   = parseInt(flagMap.get('concurrency') ?? '3', 10);
const delayMs       = parseInt(flagMap.get('delay') ?? '800', 10);
const limit         = parseInt(flagMap.get('limit') ?? '0', 10);
const noCache       = flagMap.has('no-cache');
const refresh       = flagMap.has('refresh');   // rewrite output files but keep HTML cache
const sinceArg      = flagMap.get('since');     // --since=YYYY-MM-DD: skip articles not revised since this date
const sinceDate     = sinceArg ? new Date(sinceArg) : null;
const inphoDetails  = flagMap.has('inpho-details');
const allThinkers   = flagMap.has('all-thinkers');
const allIdeas      = flagMap.has('all-ideas');

// ── Entry index ───────────────────────────────────────────────────────────────
const allEntries  = JSON.parse(fs.readFileSync(ENTRY_SEED, 'utf8'));
const slugToTitle = Object.fromEntries(allEntries.map(e => [e.slug, e.title]));
const entrySet    = new Set(allEntries.map(e => e.slug));
const entries     = limit > 0 ? allEntries.slice(0, limit) : allEntries;

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

// ── Concurrency queue ─────────────────────────────────────────────────────────
function makeQueue(n, gap) {
  let active = 0;
  const pending = [];
  const drain = () => {
    if (active >= n || !pending.length) return;
    const { fn, res, rej } = pending.shift();
    active++;
    fn().then(res, rej).finally(() => { active--; setTimeout(drain, gap); });
  };
  return fn => new Promise((res, rej) => { pending.push({ fn, res, rej }); drain(); });
}

// ── HTTP GET ──────────────────────────────────────────────────────────────────
function httpGet(url, ua) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': ua ??
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/json,*/*',
      },
      timeout: 30_000,
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        const loc = res.headers.location ?? '';
        const next = loc.startsWith('http') ? loc : SEP_BASE + loc;
        return httpGet(next, ua).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

async function fetchSepArticle(slug) {
  const file = path.join(CACHE_DIR, `${slug}.html`);
  if (!noCache && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const html = await httpGet(`${SEP_BASE}/entries/${slug}/`);
  fs.writeFileSync(file, html);
  return html;
}

// ── InPhO data loading ────────────────────────────────────────────────────────
function unwrapInpho(raw) {
  return raw?.responseData?.results ?? raw?.responseData ?? raw?.results ?? raw;
}

async function loadInphoIndex() {
  const file = path.join(CACHE_DIR, 'inpho-index.json');
  if (!noCache && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  process.stdout.write('  Fetching InPhO index (idea + thinker) ... ');
  const [ideaRaw, thinkerRaw] = await Promise.all([
    httpGet(`${INPHO_BASE}/idea.json`, INPHO_UA),
    httpGet(`${INPHO_BASE}/thinker.json`, INPHO_UA),
  ]);
  const ideas    = unwrapInpho(JSON.parse(ideaRaw));
  const thinkers = unwrapInpho(JSON.parse(thinkerRaw));
  const index    = { ideas, thinkers };
  fs.writeFileSync(file, JSON.stringify(index));
  console.log(`done (${ideas.length} ideas, ${thinkers.length} thinkers)`);
  return index;
}

async function fetchThinkerDetail(id) {
  const file = path.join(CACHE_DIR, `inpho-detail-${id}.json`);
  if (!noCache && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const raw = await httpGet(`${INPHO_BASE}/thinker/${id}.json`, INPHO_UA);
  const d = unwrapInpho(JSON.parse(raw));
  fs.writeFileSync(file, JSON.stringify(d));
  return d;
}

// ── Name normalization ────────────────────────────────────────────────────────
//
// Filename rule: lastname-firstname, all lowercase, ASCII-only hyphens.
// Mononyms (single word or mononym-like): just the name.

function parseName(label) {
  // Strip parenthetical alternate names: "Alfarabi (al-Farabi)" → "Alfarabi"
  const clean = label.replace(/\s*\(.*?\)\s*/g, '').trim();

  // "Last, First" comma format
  if (clean.includes(',')) {
    const i = clean.indexOf(',');
    return { last: clean.slice(0, i).trim(), first: clean.slice(i + 1).trim() };
  }

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return { last: words[0], first: '' };

  // Put everything before the final word as "first", final word as "last"
  return { last: words[words.length - 1], first: words.slice(0, -1).join(' ') };
}

function normSegment(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')   // strip periods, apostrophes, hyphens in names
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function thinkerFilename(label) {
  const { last, first } = parseName(label);
  const parts = [normSegment(last)];
  if (first) parts.push(normSegment(first));
  return parts.filter(Boolean).join('-');
}

// ── Build vault filename map ──────────────────────────────────────────────────

function buildMaps(inphoIndex) {
  const { ideas, thinkers } = inphoIndex;

  // Indexed by InPhO ID
  const inphoById = {
    idea:    Object.fromEntries(ideas.map(i => [i.ID, i])),
    thinker: Object.fromEntries(thinkers.map(t => [t.ID, t])),
  };

  // SEP slug → InPhO node
  const thinkerBySlug = {};
  const ideaBySlug    = {};
  for (const t of thinkers) if (t.sep_dir) thinkerBySlug[t.sep_dir] = t;
  for (const i of ideas)    if (i.sep_dir) ideaBySlug[i.sep_dir]    = i;

  // SEP slug → vault filename (without .md)
  const slugToFile = {};
  for (const { slug } of allEntries) {
    const thinker = thinkerBySlug[slug];
    slugToFile[slug] = thinker ? thinkerFilename(thinker.label) : slug;
  }

  // InPhO idea ID → vault filename.
  // Ideas with sep_dir use the SEP article filename; ideas without sep_dir use
  // normSegment(label) so e.g. "Marxism" → "marxism", "German Idealism" → "german-idealism".
  const ideaNodeFile = {};
  for (const i of ideas) {
    ideaNodeFile[i.ID] = i.sep_dir ? (slugToFile[i.sep_dir] ?? i.sep_dir)
                                   : normSegment(i.label);
  }

  // Normalized label → InPhO idea (for enriching hub notes + creating concept stubs).
  // Only for ideas without sep_dir — those with sep_dir already have SEP article notes.
  const ideaByFilename = {};
  for (const i of ideas) {
    if (!i.sep_dir) {
      const fn = normSegment(i.label);
      if (!ideaByFilename[fn]) ideaByFilename[fn] = i;
    }
  }

  // Reverse title → slug map (for family resolution)
  const titleToSlug = Object.fromEntries(allEntries.map(e => [e.title.toLowerCase(), e.slug]));

  return { slugToFile, thinkerBySlug, ideaBySlug, inphoById, ideaNodeFile, ideaByFilename, titleToSlug };
}

// ── Family / taxonomy system ──────────────────────────────────────────────────
//
// SEP titles with ": " encode a parent→subtopic hierarchy:
//   "Nietzsche, Friedrich: aesthetics"   → parent: Nietzsche, domain: aesthetics
//   "aesthetics: environmental"          → parent: aesthetics hub
//   "Aristotle, General Topics: logic"   → parent: Aristotle, domain: logic
//   "feminist philosophy, topics: X"     → parent: feminist-philosophy
//
// Hub notes are created for parents that don't have their own SEP article
// (e.g. "logic", "ethics", "aesthetics", "Chinese Philosophy").

function resolvePrefix(raw, titleToSlug, entrySet) {
  // 1. Exact title match (case-insensitive)
  const s1 = titleToSlug[raw.toLowerCase()];
  if (s1) return s1;

  // 2. Before-comma match — handles "Last, First", "Concept, qualifier", "Aristotle, General Topics"
  const ci = raw.indexOf(',');
  if (ci > 0) {
    const base = raw.slice(0, ci).trim();
    const s2 = titleToSlug[base.toLowerCase()];
    if (s2) return s2;
    // also try normalized slug of base
    const baseSlug = base.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (entrySet.has(baseSlug)) return baseSlug;
  }

  // 3. Normalized slug of full prefix
  const norm = raw.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (entrySet.has(norm)) return norm;

  return null; // → will become a virtual hub note
}

// Normalized filename for a prefix (used when no SEP article exists)
function prefixToFilename(raw) {
  const ci = raw.indexOf(',');
  const base = ci > 0 ? raw.slice(0, ci).trim() : raw;
  return base.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function buildFamilyRegistry(maps) {
  const { slugToFile, thinkerBySlug, titleToSlug } = maps;

  // hub key → { displayName, sepSlug, isThinker, filename, virtual, asParent[], asDomain[] }
  const hubs = new Map();
  // entry slug → family info
  const slugToFamily = new Map();

  const getOrCreateHub = (rawPrefix, sepSlug, file, isThinker) => {
    if (!hubs.has(file)) {
      hubs.set(file, {
        displayName: rawPrefix,
        sepSlug,
        isThinker,
        filename: file,
        virtual: !sepSlug,
        asParent: [],
        asDomain: [],
      });
    }
    return hubs.get(file);
  };

  for (const entry of allEntries) {
    const ci = entry.title.indexOf(': ');
    if (ci === -1) continue;

    const rawParent   = entry.title.slice(0, ci).trim();
    const rawSubtopic = entry.title.slice(ci + 2).trim();

    // Resolve parent
    const parentSepSlug = resolvePrefix(rawParent, titleToSlug, entrySet);
    const parentIsThinker = !!(parentSepSlug && thinkerBySlug[parentSepSlug]);
    const parentFile = parentSepSlug ? (slugToFile[parentSepSlug] ?? parentSepSlug)
                                     : prefixToFilename(rawParent);

    const parentHub = getOrCreateHub(rawParent, parentSepSlug, parentFile, parentIsThinker);
    parentHub.asParent.push({ slug: entry.slug, title: entry.title, subtopic: rawSubtopic });

    // Resolve subtopic as a secondary domain link — only meaningful when parent is a person.
    // (If parent is a concept, the concept IS the domain — no need for a second link.)
    let domainFile = null;
    let domainSepSlug = null;

    if (parentIsThinker) {
      domainSepSlug = resolvePrefix(rawSubtopic, titleToSlug, entrySet);
      domainFile = domainSepSlug ? (slugToFile[domainSepSlug] ?? domainSepSlug)
                                 : prefixToFilename(rawSubtopic);
      // Only worth registering if this domain appears as a parent of other articles too,
      // OR it's a known SEP concept.  We register it regardless and prune empties at output.
      const domainHub = getOrCreateHub(rawSubtopic, domainSepSlug, domainFile, false);
      domainHub.asDomain.push({ slug: entry.slug, title: entry.title, parentFile });
    }

    slugToFamily.set(entry.slug, {
      rawParent, parentSepSlug, parentFile, parentIsThinker,
      rawSubtopic, domainSepSlug, domainFile,
    });
  }

  return { hubs, slugToFamily };
}

function writeHubNotes(hubs, maps, outDir) {
  const { slugToFile, ideaByFilename } = maps;
  let written = 0;

  for (const [, hub] of hubs) {
    // Skip hubs that already have a SEP article (that note already exists)
    if (!hub.virtual) continue;
    // Skip hubs with no meaningful content
    if (hub.asParent.length + hub.asDomain.length === 0) continue;

    const file = path.join(outDir, `${hub.filename}.md`);
    if (!noCache && !refresh && fs.existsSync(file)) continue;

    const capTitle = hub.displayName.charAt(0).toUpperCase() + hub.displayName.slice(1);
    const inphoIdea = ideaByFilename?.[hub.filename];

    const lines = [
      '---',
      `title: ${q(capTitle)}`,
      inphoIdea ? `inpho_id: ${inphoIdea.ID}` : null,
      inphoIdea ? `inpho_kind: idea` : null,
      '---',
      '',
      '*Domain / category — no standalone SEP article.*',
      '',
    ];

    if (hub.asParent.length > 0) {
      lines.push(`## Articles in this Category`);
      lines.push('');
      for (const m of hub.asParent.sort((a, b) => a.subtopic.localeCompare(b.subtopic))) {
        const file = slugToFile[m.slug] ?? m.slug;
        lines.push(`- [[${file}|${m.subtopic}]]`);
      }
      lines.push('');
    }

    if (hub.asDomain.length > 0) {
      lines.push(`## ${capTitle} in Other Thinkers`);
      lines.push('');
      for (const m of hub.asDomain.sort((a, b) => a.title.localeCompare(b.title))) {
        const mFile = slugToFile[m.slug] ?? m.slug;
        lines.push(`- [[${mFile}|${m.title}]] ← [[${m.parentFile}]]`);
      }
      lines.push('');
    }

    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    written++;
  }

  return written;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const domAttr = (node, name) => getAttributeValue(node, name) ?? '';

function deepFind(pred, node) {
  const kids = Array.isArray(node) ? node : (node.children ?? []);
  return findOne(pred, kids, true);
}

// ── Sections to skip ──────────────────────────────────────────────────────────
const SKIP_IDS = new Set([
  'header-wrapper', 'header', 'branding', 'site-logo', 'site-title',
  'navigation', 'navpanel', 'site-navigation', 'article-nav', 'article-sidebar',
  'search', 'footer', 'footer-menu', 'mirrors', 'mirror-info', 'site-credits',
  'pubinfo',                   // already in frontmatter
  'toc',                       // heading hierarchy serves as ToC in Obsidian
  'academic-tools',
  'other-internet-resources',
  'article-copyright',
  'article-banner', 'article-banner-content',
]);
const SKIP_TAGS = new Set([
  'script', 'style', 'nav', 'button', 'input',
  'select', 'noscript', 'iframe', 'meta', 'link',
]);

function shouldSkip(node) {
  if (node.type !== 'tag') return false;
  if (SKIP_TAGS.has(node.name)) return true;
  const id = domAttr(node, 'id');
  if (SKIP_IDS.has(id)) return true;
  return domAttr(node, 'class').split(/\s+/).some(c => c === 'topnav' || c === 'navbox');
}

// ── TeX → Obsidian math ───────────────────────────────────────────────────────
function convertMath(text) {
  text = text.replace(/\s*\\\[([\s\S]*?)\\\]\s*/g, (_, eq) => `\n$$\n${eq.trim()}\n$$\n`);
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, eq) => `$${eq}$`);
  return text;
}

// ── SEP slug extraction (absolute + relative hrefs) ───────────────────────────
function extractSlug(href) {
  if (!href) return null;
  const abs = href.match(/\/entries\/([^/#?]+)/);
  if (abs) return abs[1];
  const rel = href.match(/^\.\.\/([^/#?]+)\/?/);
  if (rel) return rel[1];
  // slug.html relative links — older SEP cross-article format
  const html = href.match(/^([a-z][a-z0-9-]+)\.html(?:#.*)?$/);
  if (html) return html[1];
  return null;
}

// Extract related-entries links as frontmatter YAML lines.
function extractSeeAlsoYaml(doc, slugToFile, s2t) {
  const section = deepFind(n => n.type === 'tag' && domAttr(n, 'id') === 'related-entries', doc);
  if (!section) return [];
  const links = findAll(n => n.type === 'tag' && n.name === 'a' && domAttr(n, 'href'), section.children ?? []);
  const entries = links.map(lk => {
    const slug = extractSlug(domAttr(lk, 'href'));
    if (!slug) return null;
    const file  = slugToFile[slug];
    const title = s2t[slug];
    if (!file) return null;
    return `  - "[[${file}${title && title !== file ? `|${title}` : ''}]]"`;
  }).filter(Boolean);
  if (!entries.length) return [];
  return ['see_also:', ...entries];
}

// ── DOM → Markdown ────────────────────────────────────────────────────────────
//
// ctx shape:
//   slugToFile  : {[slug]: filename}   SEP slug → vault filename (no .md)
//   s2t         : {[slug]: title}      SEP slug → display title
//   listType    : 'ul' | 'ol'
//   listDepth   : number
//   counter     : () => number         for ordered lists

function nodeToMd(node, ctx) {
  if (node.type === 'text') {
    // Whitespace-only nodes between block elements (containing \n) contribute nothing
    if (node.data.includes('\n') && /^[\s ]*$/.test(node.data)) return '';
    return convertMath(node.data.replace(/\s*\n\s*/g, ' ').replace(/ /g, ' '));
  }
  if (node.type !== 'tag') return '';
  if (shouldSkip(node)) return '';

  const { name, children = [] } = node;
  const id = domAttr(node, 'id');

  // Related entries are extracted into frontmatter — skip in body
  if (id === 'related-entries') return '';

  const inner = (kids = children) => kids.map(ch => nodeToMd(ch, ctx)).join('');

  switch (name) {
    case 'h1': return ''; // title lives in frontmatter
    case 'h2': return `\n## ${inner().trim()}\n\n`;
    case 'h3': return `\n### ${inner().trim()}\n\n`;
    case 'h4': return `\n#### ${inner().trim()}\n\n`;
    case 'h5': return `\n##### ${inner().trim()}\n\n`;
    case 'h6': return `\n###### ${inner().trim()}\n\n`;

    case 'p': {
      const t = inner().trim();
      return t ? `\n${t}\n` : '';
    }
    case 'br': return '  \n';
    case 'hr': return '\n---\n';

    case 'pre': {
      const lang = domAttr(node, 'class').replace(/.*language-(\S+).*/, '$1').trim();
      return `\n\`\`\`${lang}\n${getText(node)}\n\`\`\`\n`;
    }

    case 'blockquote': {
      const t = inner().trim();
      return '\n' + t.split('\n').map(l => `> ${l}`).join('\n') + '\n';
    }

    case 'strong': case 'b':  return `**${inner()}**`;
    case 'em':     case 'i':  return `*${inner()}*`;
    case 'code':   case 'tt': return `\`${inner()}\``;
    case 'sup':               return `^${inner()}^`;
    case 'sub':               return `~${inner()}~`;
    case 'mark':              return `==${inner()}==`;

    case 'a': {
      const href  = domAttr(node, 'href');
      const content = inner().trim();
      if (!content) return '';
      // Internal SEP entry → Obsidian wikilink
      const slug = extractSlug(href);
      if (slug) {
        const file  = ctx.slugToFile[slug];
        const title = ctx.s2t[slug];
        if (file) {
          // If link text is the raw URL or matches the display title, omit pipe
          if (content === href || content === title || content === file) return `[[${file}]]`;
          return `[[${file}|${content}]]`;
        }
      }
      if (!href || href.startsWith('#')) return content;
      // Drop relative .html links (e.g. notes.html#note-1 — footnote back-references)
      if (/^[^/]*\.html/i.test(href)) return content;
      // External link — if text is just the URL, show as plain URL text
      if (content === href) return href;
      return `[${content}](${href})`;
    }

    case 'img': {
      const alt = domAttr(node, 'alt');
      const src = domAttr(node, 'src');
      if (!src) return alt ? `\n> *[Figure: ${alt}]*\n` : '';
      const full = src.startsWith('http') ? src : `${SEP_BASE}${src}`;
      return `\n![${alt || 'figure'}](${full})\n`;
    }

    case 'figure': {
      const img = deepFind(n => n.type === 'tag' && n.name === 'img', node);
      const caption = deepFind(n => n.type === 'tag' && n.name === 'figcaption', node);
      const captionText = caption ? getText(caption).trim() : '';
      if (!img) return captionText ? `\n> *[Figure: ${captionText}]*\n` : '';
      const alt = domAttr(img, 'alt') || captionText;
      const src = domAttr(img, 'src');
      if (!src) return captionText ? `\n> *[Figure: ${captionText}]*\n` : '';
      const full = src.startsWith('http') ? src : `${SEP_BASE}${src}`;
      return captionText
        ? `\n![${alt || 'figure'}](${full})\n*${captionText}*\n`
        : `\n![${alt || 'figure'}](${full})\n`;
    }

    case 'ul': {
      const c = { ...ctx, listType: 'ul', listDepth: (ctx.listDepth ?? 0) + 1 };
      return '\n' + children.map(ch => nodeToMd(ch, c)).join('');
    }
    case 'ol': {
      let n = 0;
      const c = { ...ctx, listType: 'ol', listDepth: (ctx.listDepth ?? 0) + 1, counter: () => ++n };
      return '\n' + children.map(ch => nodeToMd(ch, c)).join('');
    }
    case 'li': {
      const depth  = Math.max(0, (ctx.listDepth ?? 1) - 1);
      const indent = '  '.repeat(depth);
      const bullet = ctx.listType === 'ol' ? `${ctx.counter?.() ?? 1}.` : '-';
      return `${indent}${bullet} ${inner().trim()}\n`;
    }

    case 'dl': return `\n${inner()}\n`;
    case 'dt': return `\n**${inner().trim()}**\n`;
    case 'dd': return `  ${inner().trim()}\n`;

    case 'table': return convertTable(node, ctx);

    default: return inner();
  }
}

function convertTable(tableNode, ctx) {
  const allRows = findAll(n => n.type === 'tag' && n.name === 'tr', tableNode.children ?? []);
  if (!allRows.length) return '';
  const mdRows = allRows.map(row => {
    const cells = (row.children ?? []).filter(c => c.type === 'tag' && (c.name === 'td' || c.name === 'th'));
    return '| ' + cells.map(c => nodeToMd({ ...c, name: 'span' }, ctx).trim().replace(/\n+/g, ' ')).join(' | ') + ' |';
  });
  const firstCells = (allRows[0].children ?? []).filter(c => c.type === 'tag' && (c.name === 'td' || c.name === 'th'));
  const sep = '| ' + Array(firstCells.length).fill('---').join(' | ') + ' |';
  const [header, ...rest] = mdRows;
  return `\n${header}\n${sep}\n${rest.join('\n')}\n`;
}

// ── DOM metadata extraction ───────────────────────────────────────────────────
function extractDomMeta(doc, slug) {
  let title = slugToTitle[slug] ?? slug;
  const h1 = deepFind(n => n.type === 'tag' && n.name === 'h1', doc);
  if (h1) { const t = getText(h1).trim(); if (t) title = t; }

  let author = '';
  const copyright = deepFind(n => n.type === 'tag' && domAttr(n, 'id') === 'article-copyright', doc);
  if (copyright) {
    author = getText(copyright).replace(/\s+/g, ' ').trim()
      .replace(/^Copyright\s+[©®]\s*\d{4}\s+by\s+/i, '')
      .replace(/^by\s+/i, '')
      .replace(/<[^>]+>/g, '')        // strip any HTML entities left over
      .replace(/\s*<[^\s@>]+@[^\s>]+>/g, '') // strip email addresses
      .replace(/\s+/g, ' ')
      .trim();
  }

  let pubDate = '';
  let revised = '';
  const pubinfo = deepFind(n => n.type === 'tag' && domAttr(n, 'id') === 'pubinfo', doc);
  if (pubinfo) {
    const raw = getText(pubinfo).replace(/\s+/g, ' ').trim();
    // "First published Mon Feb 3, 2003; substantive revision Tue Aug 16, 2022"
    const revMatch = raw.match(/;\s*(?:substantive\s+)?revision\s+(.+)$/i);
    if (revMatch) {
      pubDate = raw.slice(0, raw.indexOf(';')).trim();
      revised = revMatch[1].trim();
    } else {
      pubDate = raw;
    }
  }

  return { title, author, pubDate, revised };
}

// ── Frontmatter builders ──────────────────────────────────────────────────────
const q = s => `"${String(s).replace(/"/g, '\\"')}"`;

// ── Family breadcrumb helpers ─────────────────────────────────────────────────

// Title-case if all-lowercase, otherwise preserve existing capitalisation.
function smartCase(s) {
  return /[A-Z]/.test(s.slice(1)) ? s : s.replace(/\b[a-z]/g, c => c.toUpperCase());
}

function parentDisplayLabel(rawParent, isThinker) {
  const ci = rawParent.indexOf(',');
  if (ci === -1) return smartCase(rawParent);
  const last  = rawParent.slice(0, ci).trim();
  const after = rawParent.slice(ci + 1).trim();
  // Qualifiers like "General Topics", "Special Topics" → just use last name
  if (isThinker && !/\b(Topics?|Approaches?|Disciplines?|Special|General)\b/i.test(after)) {
    return `${after} ${last}`; // "Immanuel Kant", "Georg Wilhelm Friedrich Hegel"
  }
  return smartCase(last);
}

// ── Auto-linkifier (first-occurrence title mentions → [[wikilinks]]) ──────────
function buildLinkifier(slugToFile) {
  const sorted = [...allEntries].sort((a, b) => b.title.length - a.title.length);
  const titleMap = Object.create(null);
  const patterns = [];

  for (const e of sorted) {
    const lo = e.title.toLowerCase();
    if (!titleMap[lo]) {
      titleMap[lo] = { file: slugToFile[e.slug] ?? e.slug, display: e.title };
      patterns.push(e.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
  }

  const re = new RegExp('(?:' + patterns.join('|') + ')', 'gi');

  return function linkifyMd(body) {
    const linked = new Set();
    // Skip existing wikilinks, fenced/inline code, and LaTeX
    const SKIP = /(\[\[[\s\S]*?\]\]|```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^\n$]*?\$)/g;
    let result = '';
    let last = 0;
    let m;
    SKIP.lastIndex = 0;
    while ((m = SKIP.exec(body)) !== null) {
      if (m.index > last) result += linkText(body.slice(last, m.index), re, titleMap, linked);
      result += m[0];
      last = m.index + m[0].length;
    }
    result += linkText(body.slice(last), re, titleMap, linked);
    return result;
  };
}

function linkText(text, re, titleMap, linked) {
  re.lastIndex = 0;
  let result = '';
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const lo = m[0].toLowerCase();
    const entry = titleMap[lo];
    if (entry && !linked.has(lo)) {
      linked.add(lo);
      result += text.slice(last, m.index);
      result += `[[${entry.file}|${m[0]}]]`;
      last = m.index + m[0].length;
    }
  }
  result += text.slice(last);
  return result;
}

function conceptFrontmatter({ slug, title, author, pubDate, revised, idea, family, seeAlsoYaml = [] }) {
  const lines = [
    '---',
    `title: ${q(title)}`,
    author  ? `author: ${q(author)}`   : null,
    pubDate ? `date: ${q(pubDate)}`    : null,
    revised ? `revised: ${q(revised)}` : null,
    `slug: "${slug}"`,
    `url: "${SEP_BASE}/entries/${slug}/"`,
    idea ? `inpho_id: ${idea.ID}` : null,
    idea ? `inpho_kind: idea`     : null,
    family?.parentFile ? `parent: "[[${family.parentFile}|${parentDisplayLabel(family.rawParent, family.parentIsThinker)}]]"` : null,
    family?.domainFile ? `domain: "[[${family.domainFile}|${smartCase(family.rawSubtopic)}]]"` : null,
    ...seeAlsoYaml,
    `aliases:`,
    `  - ${q(title)}`,
    `  - "${slug}"`,
    '---',
    '',
  ].filter(l => l !== null);
  return lines.join('\n');
}

function thinkerFrontmatter({ slug, title, author, pubDate, revised, thinker, detail, family, influenceYaml = [], seeAlsoYaml = [] }) {
  const { last, first } = parseName(thinker.label);

  // Collect aliases: natural name, SEP slug, normalized lowercase
  const aliases = [
    thinker.label,
    slug,
    first ? `${first} ${last}` : null,
    thinker.label.toLowerCase(),
  ].filter((a, i, arr) => a && arr.indexOf(a) === i);

  const birth = detail ? yearOf(detail.birth) : null;
  const death = detail ? yearOf(detail.death) : null;

  const lines = [
    '---',
    `title: ${q(thinker.label)}`,
    `name: "${normSegment(last)}"`,
    first ? `name-first: "${normSegment(first)}"` : null,
    birth != null ? `birth: ${birth}` : null,
    death != null ? `death: ${death}` : null,
    slug   ? `slug: "${slug}"`                        : null,
    slug   ? `url: "${SEP_BASE}/entries/${slug}/"`    : null,
    author  ? `author: ${q(author)}`   : null,
    pubDate ? `date: ${q(pubDate)}`    : null,
    revised ? `revised: ${q(revised)}` : null,
    `inpho_id: ${thinker.ID}`,
    `inpho_kind: thinker`,
    ...influenceYaml,
    ...seeAlsoYaml,
    family?.parentFile ? `parent: "[[${family.parentFile}|${parentDisplayLabel(family.rawParent, family.parentIsThinker)}]]"` : null,
    family?.domainFile ? `domain: "[[${family.domainFile}|${smartCase(family.rawSubtopic)}]]"` : null,
    `aliases:`,
    ...aliases.map(a => `  - ${q(a)}`),
    '---',
    '',
  ].filter(l => l !== null);
  return lines.join('\n');
}

function yearOf(field) {
  const e = Array.isArray(field) ? field[0] : field;
  return typeof e?.year === 'number' ? e.year : null;
}

// ── Influence YAML for thinker frontmatter ────────────────────────────────────
// Builds normalized wikilink YAML lines for teachers/students/influence/ideas
// so Obsidian and Dataview can follow them.

function buildInfluenceYaml(detail, inphoById, ideaNodeFile) {
  if (!detail) return [];

  const thinkerWL = id => {
    const t = inphoById.thinker[id];
    if (!t) return null;
    return `  - "[[${thinkerFilename(t.label)}|${t.label}]]"`;
  };

  const ideaWL = id => {
    const i = inphoById.idea[id];
    const fn = ideaNodeFile?.[id];
    if (!i || !fn) return null;
    return `  - "[[${fn}|${i.label}]]"`;
  };

  const section = (key, ids, toLine) => {
    const lines = (ids ?? []).map(toLine).filter(Boolean);
    if (!lines.length) return [];
    return [`${key}:`, ...lines];
  };

  return [
    ...section('teachers',         detail.teachers,         thinkerWL),
    ...section('students',         detail.students,         thinkerWL),
    ...section('influenced_by',    detail.influenced_by,    thinkerWL),
    ...section('influenced',       detail.influenced,       thinkerWL),
    ...section('related_thinkers', detail.related_thinkers, thinkerWL),
    ...section('related_ideas',    detail.related_ideas,    ideaWL),
  ];
}

// ── Concept stub (InPhO idea without a SEP article) ───────────────────────────
function createIdeaStub(idea, ideaNodeFile, outDir) {
  const filename = ideaNodeFile[idea.ID] ?? normSegment(idea.label);
  const file = path.join(outDir, `${filename}.md`);
  if (!refresh && fs.existsSync(file)) return 'skipped'; // already written by hub notes or SEP article

  const capLabel = idea.label.charAt(0).toUpperCase() + idea.label.slice(1);
  const lines = [
    '---',
    `title: ${q(capLabel)}`,
    `inpho_id: ${idea.ID}`,
    `inpho_kind: idea`,
    '---',
    '',
    `*Philosophical concept — [InPhO entry](https://www.inphoproject.org${idea.url}).*`,
    '',
  ];
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return 'ok';
}

// ── Process one SEP article ───────────────────────────────────────────────────
async function processEntry(entry, maps, detailQueue) {
  const { slug } = entry;
  const { slugToFile, thinkerBySlug, ideaBySlug, inphoById, ideaNodeFile, slugToFamily } = maps;

  const filename  = slugToFile[slug];
  const outFile   = path.join(outDir, `${filename}.md`);
  if (!noCache && !refresh && fs.existsSync(outFile)) {
    // --since: skip if the note's revised: date is older than the cutoff
    if (sinceDate) {
      const existing = fs.readFileSync(outFile, 'utf8');
      const m = existing.match(/^revised:\s*["']?([^"'\n]+)["']?/m);
      if (m) {
        const noteRevised = new Date(m[1].replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+/i, ''));
        if (!isNaN(noteRevised) && noteRevised < sinceDate) return { slug, status: 'skipped' };
      }
    } else {
      return { slug, status: 'skipped' };
    }
  }

  let html;
  try { html = await fetchSepArticle(slug); }
  catch (err) { return { slug, status: 'error', message: err.message }; }

  const doc = parseDocument(html);
  const ctx = { slugToFile, s2t: slugToTitle };
  const { title, author, pubDate, revised } = extractDomMeta(doc, slug);

  const thinker = thinkerBySlug[slug];
  const idea    = ideaBySlug[slug];
  const family  = slugToFamily?.get(slug) ?? null;

  // Fetch thinker detail if requested
  let detail = null;
  if (thinker && inphoDetails) {
    try { detail = await detailQueue(() => fetchThinkerDetail(thinker.ID)); }
    catch {}
  }

  // Build frontmatter
  const influenceYaml = (thinker && detail)
    ? buildInfluenceYaml(detail, inphoById, ideaNodeFile)
    : [];
  const seeAlsoYaml = extractSeeAlsoYaml(doc, slugToFile, slugToTitle);
  const fm = thinker
    ? thinkerFrontmatter({ slug, title, author, pubDate, revised, thinker, detail, family, influenceYaml, seeAlsoYaml })
    : conceptFrontmatter({ slug, title, author, pubDate, revised, idea, family, seeAlsoYaml });

  // Find article root — prefer container that includes bibliography + related-entries
  const root =
    deepFind(n => n.type === 'tag' && domAttr(n, 'id') === 'article-content', doc) ??
    deepFind(n => n.type === 'tag' && domAttr(n, 'id') === 'aueditable',      doc) ??
    deepFind(n => n.type === 'tag' && domAttr(n, 'id') === 'article',         doc) ??
    deepFind(n => n.type === 'tag' && domAttr(n, 'id') === 'main-text',       doc) ??
    deepFind(n => n.type === 'tag' && n.name === 'article',                   doc);

  if (!root) return { slug, status: 'error', message: 'article root not found' };

  let body = nodeToMd(root, ctx).replace(/\n{3,}/g, '\n\n').trim();
  if (maps.linkify) {
    // Only linkify the main text — skip bibliography and appendix sections
    const cutoff = body.search(/\n## (Bibliography|Academic Tools|Other Internet Resources)\n/);
    if (cutoff !== -1) {
      body = maps.linkify(body.slice(0, cutoff)) + body.slice(cutoff);
    } else {
      body = maps.linkify(body);
    }
  }

  fs.writeFileSync(outFile, `${fm}${body}\n`, 'utf8');
  return { slug, status: 'ok', isThinker: !!thinker, isIdea: !!idea };
}

// ── Thinker stub (no SEP article) ────────────────────────────────────────────
async function createThinkerStub(thinker, maps, detailQueue) {
  const { slugToFile, inphoById, ideaNodeFile } = maps;
  const filename = thinkerFilename(thinker.label);
  const outFile  = path.join(outDir, `${filename}.md`);
  if (!noCache && !refresh && fs.existsSync(outFile)) return;

  let detail = null;
  if (inphoDetails) {
    try { detail = await detailQueue(() => fetchThinkerDetail(thinker.ID)); }
    catch {}
  }

  const influenceYaml = detail ? buildInfluenceYaml(detail, inphoById, ideaNodeFile) : [];
  const fm = thinkerFrontmatter({ slug: null, title: thinker.label, author: null, pubDate: null, thinker, detail, influenceYaml });

  fs.writeFileSync(outFile, `${fm}\n*No SEP article. InPhO ID: ${thinker.ID}.*\n`, 'utf8');
}

// ── Index note ────────────────────────────────────────────────────────────────
function writeIndex(results, maps) {
  const { slugToFile, thinkerBySlug } = maps;
  const sorted = [...allEntries].sort((a, b) =>
    a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })
  );
  const errors = new Set(results.filter(r => r.status === 'error').map(r => r.slug));

  const lines = [
    '---', 'title: SEP Index', '---', '',
    `${sorted.length - errors.size} entries. Source: [plato.stanford.edu](https://plato.stanford.edu).`, '',
    '## Dataview Queries', '',
    'Requires the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin.', '',
    '### Thinker timeline',
    '```dataview',
    'TABLE birth, death FROM ""',
    'WHERE inpho_kind = "thinker" AND birth != null',
    'SORT birth ASC',
    '```', '',
    '### Recently revised',
    '```dataview',
    'TABLE revised, author FROM ""',
    'WHERE revised != null',
    'SORT file.mtime DESC',
    'LIMIT 50',
    '```', '',
    '### Articles by domain',
    '```dataview',
    'TABLE domain FROM ""',
    'WHERE domain != null',
    'SORT domain ASC',
    '```', '',
    '## All Entries', '',
    ...sorted.map(e => {
      if (errors.has(e.slug)) return `- ${e.title} *(fetch error)*`;
      const file  = slugToFile[e.slug] ?? e.slug;
      const title = e.title;
      return `- [[${file}${title.toLowerCase() !== file ? `|${title}` : ''}]]`;
    }),
  ];
  fs.writeFileSync(path.join(outDir, '_SEP Index.md'), lines.join('\n') + '\n', 'utf8');
}

// ── Obsidian config ───────────────────────────────────────────────────────────
function writeObsidianConfig() {
  const d = path.join(outDir, '.obsidian');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'app.json'),
    JSON.stringify({ legacyEditor: false, livePreview: true }, null, 2) + '\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\nSEP → Obsidian vault`);
console.log(`Output:      ${outDir}`);
console.log(`Entries:     ${entries.length}${limit ? ` (limited from ${allEntries.length})` : ''}`);
console.log(`Concurrency: ${concurrency}   Delay: ${delayMs}ms`);
console.log(`InPhO details: ${inphoDetails ? 'yes' : 'no'}   All thinkers: ${allThinkers ? 'yes' : 'no'}   All ideas: ${allIdeas ? 'yes' : 'no'}`);
if (sinceDate) console.log(`Since: ${sinceArg} (incremental — skipping articles not revised since this date)`);
console.log();

// Load InPhO index
const inphoIndex = await loadInphoIndex();
const maps = buildMaps(inphoIndex);
maps.linkify = buildLinkifier(maps.slugToFile);

// Build family taxonomy (parent/domain links between entries)
const { hubs, slugToFamily } = buildFamilyRegistry(maps);
maps.hubs        = hubs;
maps.slugToFamily = slugToFamily;
console.log(`Family: ${slugToFamily.size} entries with parent/domain links\n`);

const { thinkerBySlug } = maps;
const thinkerCount = Object.keys(thinkerBySlug).length;
console.log(`InPhO: ${thinkerCount} thinkers matched to SEP articles\n`);

// Queue shared by article fetching + thinker detail fetching
const queue       = makeQueue(concurrency, delayMs);
const detailQueue = makeQueue(2, 500); // polite separate lane for InPhO detail fetches

let done = 0;
const results = [];

await Promise.all(
  entries.map(entry =>
    queue(async () => {
      const result = await processEntry(entry, maps, detailQueue);
      results.push(result);
      done++;
      const pct = ((done / entries.length) * 100).toFixed(1);
      if (result.status === 'error') {
        process.stdout.write(`\n[ERROR] ${entry.slug}: ${result.message}\n`);
      } else {
        const tag = result.isThinker ? ' 👤' : result.isIdea ? ' 💡' : '';
        process.stdout.write(`\r[${pct}%] ${done}/${entries.length}  ${(entry.slug + tag).padEnd(45)}`);
      }
    })
  )
);

// Optionally create stub notes for InPhO thinkers without SEP articles
if (allThinkers) {
  const linkedSlugs  = new Set(Object.keys(thinkerBySlug));
  const orphans      = inphoIndex.thinkers.filter(t => !t.sep_dir || !entrySet.has(t.sep_dir));
  console.log(`\n\nCreating ${orphans.length} thinker stubs (no SEP article)...`);
  let stubDone = 0;
  await Promise.all(orphans.map(t =>
    queue(async () => {
      await createThinkerStub(t, maps, detailQueue);
      stubDone++;
      process.stdout.write(`\r  ${stubDone}/${orphans.length} ${t.label.slice(0,40).padEnd(40)}`);
    })
  ));
}

console.log('\n\nWriting index, hub notes, and config...');
writeIndex(results, maps);
const hubsWritten = writeHubNotes(hubs, maps, outDir);
if (hubsWritten) console.log(`Hub notes: ${hubsWritten} virtual domain/category notes`);

// Optionally create concept stubs for InPhO ideas without SEP articles.
// These become topic hub nodes (Marxism, Ontology, Analytic Philosophy, etc.)
// linked from thinker notes via `related_ideas` frontmatter.
if (allIdeas) {
  const concepts = inphoIndex.ideas.filter(i => !i.sep_dir);
  let ideaNew = 0;
  for (const idea of concepts) {
    const status = createIdeaStub(idea, maps.ideaNodeFile, outDir);
    if (status === 'ok') ideaNew++;
  }
  console.log(`Concept stubs: ${ideaNew} new notes (${concepts.length - ideaNew} already existed as hub/SEP notes)`);
}

writeObsidianConfig();

const ok      = results.filter(r => r.status === 'ok').length;
const skipped = results.filter(r => r.status === 'skipped').length;
const errors  = results.filter(r => r.status === 'error');

console.log(`\nDone.`);
console.log(`  Written:  ${ok}  (${results.filter(r => r.isThinker).length} people, ${results.filter(r => r.isIdea).length} InPhO concepts)`);
console.log(`  Skipped:  ${skipped}`);
console.log(`  Errors:   ${errors.length}`);
if (errors.length) console.log(`  Failed:   ${errors.map(e => e.slug).join(', ')}`);
console.log(`\nOpen ${outDir} as a vault in Obsidian.`);
