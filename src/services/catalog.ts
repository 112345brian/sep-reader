import { upsertIndexEntries, cacheArticle, getMeta, setMeta, getEntryCount, getAllUncachedSlugs, getCachedSlugs, indexLinks, getAllEntryTitles, invalidateLinkCache, cleanDenormalizedTitles, getMathArticleHtml, updateArticleHtml } from './db';
import { linkifyHtml } from '../utils/linkifier';
import seedEntries from '../assets/entry-seed.json';
import { renderMathBatch } from './mathRender';

// Replace all \(…\) and \[…\] TeX math in the raw HTML with <math-i> elements
// whose text content is the base64-encoded pre-rendered SVG. The SVGs are
// rendered by the off-screen MathRenderWebView (MathJax can't run on Hermes);
// the parser later decodes <math-i> into `mathsvg` AST nodes, so no MathJax runs
// at read time.
const MATH_SUBST_RE = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
async function substitutemath(html: string): Promise<string> {
  const spots: Array<{ index: number; len: number; tex: string; display: boolean }> = [];
  MATH_SUBST_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_SUBST_RE.exec(html)) !== null) {
    const inline = m[1];
    const block = m[2];
    spots.push({
      index: m.index,
      len: m[0].length,
      tex: decodeEntities((inline ?? block).trim()),
      display: block !== undefined,
    });
  }
  if (!spots.length) return html;

  const results = await renderMathBatch(spots.map(s => ({ tex: s.tex, display: s.display })));

  // Splice in reverse so earlier indices stay valid. Equations that failed to
  // render (results[i].error) are left as raw TeX for the legacy fallback.
  let out = html;
  for (let i = spots.length - 1; i >= 0; i--) {
    const r = results[i];
    if (!r || r.error || !r.b64) continue;
    const { index, len, display } = spots[i];
    const w = (r.w ?? 1).toFixed(4);
    const h = (r.h ?? 1).toFixed(4);
    const tag = `<math-i d="${display ? '1' : '0'}" w="${w}" h="${h}">${r.b64}</math-i>`;
    out = out.slice(0, index) + tag + out.slice(index + len);
  }
  return out;
}

// One-time startup backfill: run substitutemath on all already-cached math
// articles so their stored content_html has SVGs instead of raw TeX.
// Runs entirely from the local DB — no network. Guarded by a meta key.
export async function backfillMathInline(): Promise<void> {
  // v2: v1 ran before the WebView renderer existed and converted nothing
  // (MathJax can't run on Hermes), so re-run once against the real renderer.
  const done = await getMeta('math_inline_v2');
  if (done) return;
  const articles = await getMathArticleHtml();
  for (const article of articles) {
    await new Promise<void>(r => setTimeout(r, 0));
    try {
      const updated = await substitutemath(article.content_html);
      if (updated !== article.content_html) {
        await updateArticleHtml(article.slug, updated);
      }
    } catch {
      // non-fatal — article will fall back to legacy monospace TeX
    }
  }
  await setMeta('math_inline_v2', '1');
}

const BASE = 'https://plato.stanford.edu';
const INDEX_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

const SEP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export async function refreshIndexIfStale(): Promise<void> {
  const lastRefresh = await getMeta('index_refreshed_at');
  const count = await getEntryCount();
  const isStale = !lastRefresh ||
    Date.now() - Number(lastRefresh) > INDEX_REFRESH_INTERVAL_MS ||
    count === 0;

  if (!isStale) return;

  let entries: { slug: string; title: string }[];
  try {
    entries = await fetchEntryList();
  } catch {
    // fall back to bundled seed on first launch; if index already exists, skip silently
    if (count === 0) entries = seedEntries as { slug: string; title: string }[];
    else return;
  }

  if (entries.length > 0) {
    await upsertIndexEntries(entries);
    await cleanDenormalizedTitles();
    await setMeta('index_refreshed_at', String(Date.now()));
    // Rebuild link index in background after new index data lands
    buildLinkIndex().catch(() => {});
  }
}

async function buildLinkIndex(): Promise<void> {
  const entries = await getAllEntryTitles();
  const payload = JSON.stringify(
    entries.slice(0, 700).map(e => ({
      s: e.slug,
      t: e.title,
      p: e.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    }))
  );
  await setMeta('link_index_json', payload);
  invalidateLinkCache();
}

export type DownloadProgress = {
  done: number;
  total: number;
  current: string;
};

export async function downloadAll(
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
  scope: 'all' | 'sep' | 'owl' = 'all'
): Promise<void> {
  const slugs = await getAllUncachedSlugs(scope);
  const total = slugs.length;
  let done = 0;

  const CONCURRENCY = 4;
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    if (signal?.aborted) return;
    const chunk = slugs.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async ({ slug, title }) => {
      await fetchAndCacheArticle(slug);
      done++;
      onProgress({ done, total, current: title });
    }));
    await new Promise<void>(r => setTimeout(r, 300));
  }
}

export async function syncCachedArticles(
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  await refreshIndexIfStale();
  const slugs = await getCachedSlugs();
  const total = slugs.length;
  let done = 0;
  const CONCURRENCY = 3;
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    if (signal?.aborted) return;
    const chunk = slugs.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async ({ slug, title }) => {
      await fetchAndCacheArticle(slug);
      done++;
      onProgress({ done, total, current: title });
    }));
    await new Promise<void>(r => setTimeout(r, 200));
  }
  await setMeta('last_deep_sync', String(Date.now()));
}

export async function fetchAndCacheArticle(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/entries/${slug}/`, { headers: SEP_HEADERS });
    if (!res.ok) return false;
    const html = await res.text();

    const title = extractTitle(html) ?? slug;
    const tocHtml = extractById(html, 'toc');
    const preambleHtml = extractById(html, 'preamble');
    const rawContentHtml =
      extractById(html, 'aueditable') || extractById(html, 'article-content');

    if (!rawContentHtml) return false;

    // aueditable starts with <h1> (title) which the template re-adds itself.
    const contentHtml = rawContentHtml.replace(/^\s*<!--[^>]*-->\s*/, '').replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '');

    const linkedHtml = linkifyHtml(contentHtml);
    const hasMath = linkedHtml.includes('\\(') || linkedHtml.includes('\\[');
    // Substitute math before storing so content_html is always SVG-ready.
    const finalHtml = hasMath ? await substitutemath(linkedHtml) : linkedHtml;
    await cacheArticle(slug, {
      author: extractMetaContent(html, 'citation_author') ?? extractAuthor(html),
      pub_date: extractMetaContent(html, 'citation_publication_date'),
      toc_html: tocHtml,
      preamble_html: preambleHtml,
      content_html: finalHtml,
      has_math: hasMath ? 1 : 0,
    });
    // Index outgoing links for graph view
    indexLinks(slug, contentHtml).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function fetchEntryList(): Promise<{ slug: string; title: string; parent_label: string | null }[]> {
  const res = await fetch(`${BASE}/contents.html`, { headers: SEP_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const entries: { slug: string; title: string; parent_label: string | null }[] = [];
  const seen = new Set<string>();
  const STRONG_LINK = /href="entries\/([a-z0-9-]+)\/"><strong>([^<]+)<\/strong>/g;
  let m: RegExpExecArray | null;

  // Pass 1: parent groups — <li> HEADER \n <ul> sub-entries </ul>
  // Header may be plain text OR a linked entry
  const parentGroupRe = /<li>\s*([^\n]+)\n\s*<ul>([\s\S]*?)<\/ul>/g;
  while ((m = parentGroupRe.exec(html)) !== null) {
    const header = m[1].trim();
    const subHtml = m[2];
    const strongM = header.match(/<strong>([^<]+)<\/strong>/);
    const parentLabel = decodeEntities(strongM ? strongM[1].trim() : header.replace(/<[^>]*>/g, '').trim());
    if (!parentLabel) continue;
    // If header is a linked entry, add the parent itself (no parent_label — it IS the parent)
    const parentLink = header.match(/href="entries\/([a-z0-9-]+)\/"/);
    if (parentLink && !seen.has(parentLink[1])) {
      seen.add(parentLink[1]);
      entries.push({ slug: parentLink[1], title: parentLabel, parent_label: null });
    }
    // Add sub-entries: store only the sub-title as title, parent_label separately
    const subRe = /href="entries\/([a-z0-9-]+)\/"><strong>([^<]+)<\/strong>/g;
    let sub: RegExpExecArray | null;
    while ((sub = subRe.exec(subHtml)) !== null) {
      const slug = sub[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      entries.push({ slug, title: decodeEntities(sub[2].trim()), parent_label: parentLabel });
    }
  }

  // Pass 2: standalone entries not already captured
  STRONG_LINK.lastIndex = 0;
  while ((m = STRONG_LINK.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push({ slug, title: decodeEntities(m[2].trim()), parent_label: null });
  }

  entries.sort((a, b) => a.title.localeCompare(b.title));
  return entries;
}

// ── HTML extraction ──────────────────────────────────────────────────────────

function extractById(html: string, id: string): string | null {
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

  const content = html.slice(m.index + m[0].length, i - tag.length - 3).trim();
  return content || null;
}

function extractMetaContent(html: string, property: string): string | null {
  const m = html.match(new RegExp(`<meta property="${property}" content="([^"]+)"`));
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]+?)\s*\(Stanford/i) ??
            html.match(/<h1[^>]*class="[^"]*pagetitle[^"]*"[^>]*>([^<]+)/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractAuthor(html: string): string | null {
  const m = html.match(/<p[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)/i);
  return m ? decodeEntities(m[1].trim()).slice(0, 200) : null;
}

const ENTITY_MAP: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', aring: 'å', aelig: 'æ',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', ouml: 'ö', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', ccedil: 'ç', szlig: 'ß', yacute: 'ý',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Ouml: 'Ö', Oslash: 'Ø',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Ccedil: 'Ç', Yacute: 'Ý',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', hellip: '…', middot: '·',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITY_MAP[name] ?? m);
}
