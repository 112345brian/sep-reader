// Linkifies an HTML string by wrapping first-occurrence article title mentions
// in <a class="wl" href="/entries/slug/"> tags. Runs at article cache time
// (not at render time) so the stored content_html is already linked.
//
// Skips text inside <a>, <code>, <pre>, <script>, <style>, <h1-3>, <cite>,
// <blockquote> to avoid double-linking or corrupting existing markup.

import { LINK_MAP_JSON } from '../assets/linkMapData';

type LinkEntry = { s: string; t: string; p: string };

// Module-level singletons — built once, reused for every article.
let _map: Record<string, string> | null = null;
let _re: RegExp | null = null;

function init() {
  if (_re) return;
  const entries: LinkEntry[] = JSON.parse(LINK_MAP_JSON);
  _map = Object.create(null);
  for (const e of entries) _map![e.t.toLowerCase()] = e.s;
  _re = new RegExp('(?:' + entries.map(e => e.p).join('|') + ')', 'gi');
}

const SKIP_OPEN  = /^<(a|code|pre|script|style|h[123]|cite|blockquote)\b/i;
const SKIP_CLOSE = /^<\/(a|code|pre|script|style|h[123]|cite|blockquote)>/i;

export function linkifyHtml(html: string): string {
  init();
  const map = _map!;
  const re  = _re!;
  const linked = new Set<string>();
  let skipDepth = 0;

  return html.split(/(<[^>]*>)/g).map(part => {
    if (part.startsWith('<')) {
      if (SKIP_OPEN.test(part))  skipDepth++;
      else if (SKIP_CLOSE.test(part)) skipDepth = Math.max(0, skipDepth - 1);
      return part;
    }
    if (skipDepth > 0 || !part.trim()) return part;

    re.lastIndex = 0;
    let result = '';
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(part)) !== null) {
      const lo = m[0].toLowerCase();
      if (m.index > last) result += part.slice(last, m.index);
      if (!linked.has(lo) && map[lo]) {
        linked.add(lo);
        result += `<a href="/entries/${map[lo]}/" class="wl">${m[0]}</a>`;
      } else {
        result += m[0];
      }
      last = m.index + m[0].length;
    }
    result += part.slice(last);
    return result;
  }).join('');
}
