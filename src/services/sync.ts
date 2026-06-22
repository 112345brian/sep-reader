import { saveArticle, getAllArticleSlugs, setSyncMeta, getSyncMeta } from './db';
import type { SyncStatus } from '../types';

const BASE = 'https://plato.stanford.edu';
const CONTENTS_URL = `${BASE}/contents.html`;
const CONCURRENCY = 6;
const RATE_DELAY_MS = 250;

export type OnStatus = (status: SyncStatus) => void;

export async function runSync(onStatus: OnStatus, forceRefresh = false): Promise<void> {
  onStatus({ phase: 'fetching-list' });

  let entries: { slug: string; title: string }[];
  try {
    entries = await fetchEntryList();
  } catch (e: any) {
    onStatus({ phase: 'error', message: `Failed to fetch entry list: ${e.message}` });
    return;
  }

  const existingSlugs = new Set(await getAllArticleSlugs());
  const toSync = forceRefresh
    ? entries
    : entries.filter(e => !existingSlugs.has(e.slug));

  if (toSync.length === 0) {
    onStatus({ phase: 'done', count: entries.length });
    return;
  }

  let done = entries.length - toSync.length;
  const total = entries.length;

  onStatus({ phase: 'syncing', done, total, current: '' });

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < toSync.length; i += CONCURRENCY) {
    const chunk = toSync.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async entry => {
        try {
          await syncOneArticle(entry.slug, entry.title);
        } catch {
          // Skip failed articles — don't abort the whole sync
        }
        done++;
        onStatus({ phase: 'syncing', done, total, current: entry.title });
      })
    );
    await delay(RATE_DELAY_MS);
  }

  await setSyncMeta('last_sync', String(Date.now()));
  onStatus({ phase: 'done', count: total });
}

async function fetchEntryList(): Promise<{ slug: string; title: string }[]> {
  const res = await fetch(CONTENTS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const entries: { slug: string; title: string }[] = [];
  const linkRe = /href="\/entries\/([a-z0-9-]+)\/"[^>]*>([^<]+)</g;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const slug = match[1];
    const title = decodeHtmlEntities(match[2].trim());
    if (slug && title && !entries.find(e => e.slug === slug)) {
      entries.push({ slug, title });
    }
  }
  return entries;
}

async function syncOneArticle(slug: string, fallbackTitle: string): Promise<void> {
  const url = `${BASE}/entries/${slug}/`;
  const res = await fetch(url);
  if (!res.ok) return;
  const html = await res.text();

  const title = extractText(html, 'h1', 'pagetitle') || extractTitle(html) || fallbackTitle;
  const author = extractAuthorLine(html);
  const tocHtml = extractById(html, 'toc');
  const preambleHtml = extractById(html, 'preamble');
  const contentHtml = extractById(html, 'aueditable') || extractById(html, 'article-content');

  if (!contentHtml) return;

  await saveArticle({
    slug,
    title,
    author,
    toc_html: tocHtml,
    preamble_html: preambleHtml,
    content_html: contentHtml,
    word_count: 0,
  });
}

// ---- HTML extraction helpers ----

function extractById(html: string, id: string): string | null {
  const startTag = new RegExp(`<(?:div|nav|section|ol|ul)[^>]*\\bid="${id}"[^>]*>`, 'i');
  const startMatch = startTag.exec(html);
  if (!startMatch) return null;

  const startIdx = startMatch.index + startMatch[0].length;
  const tagName = startMatch[0].match(/<(\w+)/)?.[1]?.toLowerCase() ?? 'div';

  let depth = 1;
  let i = startIdx;
  while (i < html.length && depth > 0) {
    const openIdx = html.indexOf(`<${tagName}`, i);
    const closeIdx = html.indexOf(`</${tagName}>`, i);
    if (closeIdx === -1) break;
    if (openIdx !== -1 && openIdx < closeIdx) {
      depth++;
      i = openIdx + 1;
    } else {
      depth--;
      i = closeIdx + `</${tagName}>`.length;
    }
  }

  const content = html.slice(startIdx, i - `</${tagName}>`.length);
  return content.trim() || null;
}

function extractText(html: string, tag: string, className: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\bclass="[^"]*${className}[^"]*"[^>]*>([^<]+)`, 'i');
  const match = re.exec(html);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title>([^<]+)\s*\(Stanford/i);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function extractAuthorLine(html: string): string | null {
  const match = html.match(/First\s+published[^<]*<\/p>/i) ??
    html.match(/<p[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)/i);
  if (!match) return null;
  return decodeHtmlEntities(match[0].replace(/<[^>]*>/g, '').trim()).slice(0, 200);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
