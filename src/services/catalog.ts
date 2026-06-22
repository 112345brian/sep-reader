import { upsertIndexEntries, cacheArticle, getMeta, setMeta, getEntryCount } from './db';

const BASE = 'https://plato.stanford.edu';
const INDEX_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export async function refreshIndexIfStale(): Promise<void> {
  const lastRefresh = await getMeta('index_refreshed_at');
  const count = await getEntryCount();
  const isStale = !lastRefresh ||
    Date.now() - Number(lastRefresh) > INDEX_REFRESH_INTERVAL_MS ||
    count === 0;

  if (!isStale) return;

  const entries = await fetchEntryList();
  if (entries.length > 0) {
    await upsertIndexEntries(entries);
    await setMeta('index_refreshed_at', String(Date.now()));
  }
}

export type DownloadProgress = {
  done: number;
  total: number;
  current: string;
};

export async function downloadAll(
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const { getEntryCount } = await import('./db');
  // We already have the index; fetch all uncached slugs
  const { getAllUncachedSlugs } = await import('./db');
  const slugs = await getAllUncachedSlugs();
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

export async function fetchAndCacheArticle(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/entries/${slug}/`);
    if (!res.ok) return false;
    const html = await res.text();

    const title = extractTitle(html) ?? slug;
    const tocHtml = extractById(html, 'toc');
    const preambleHtml = extractById(html, 'preamble');
    const contentHtml =
      extractById(html, 'aueditable') || extractById(html, 'article-content');

    if (!contentHtml) return false;

    await cacheArticle(slug, {
      author: extractAuthor(html),
      toc_html: tocHtml,
      preamble_html: preambleHtml,
      content_html: contentHtml,
    });
    return true;
  } catch {
    return false;
  }
}

async function fetchEntryList(): Promise<{ slug: string; title: string }[]> {
  const res = await fetch(`${BASE}/contents.html`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const seen = new Set<string>();
  const entries: { slug: string; title: string }[] = [];
  const re = /href="\/entries\/([a-z0-9-]+)\/"[^>]*>([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push({ slug, title: decodeEntities(m[2].trim()) });
  }
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

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]+?)\s*\(Stanford/i) ??
            html.match(/<h1[^>]*class="[^"]*pagetitle[^"]*"[^>]*>([^<]+)/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractAuthor(html: string): string | null {
  const m = html.match(/<p[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)/i);
  return m ? decodeEntities(m[1].trim()).slice(0, 200) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ');
}
