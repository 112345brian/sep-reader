// Pure TOC parser — no React/RN imports so it is unit-testable in isolation.
// Backs spec items TOC-11/12/13 and DATA-05.

export interface TocItem {
  num: string;   // leading section number, e.g. "2.1" (may be empty)
  text: string;  // section label without the number
  href: string;  // target id (without leading '#')
  level: number; // 0 = top level, 1 = sub-section, ...
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&lsquo;/g, '‘').replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&hellip;/g, '…').replace(/&bull;/g, '•')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

export function parseToc(html: string): TocItem[] {
  const items: TocItem[] = [];
  const re = /<a[^>]+href="(#[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].slice(1);
    const raw = decodeHtml(m[2].replace(/<[^>]+>/g, '').trim());
    if (!raw) continue;
    // Match a dotted section number ("1", "2.1") WITHOUT swallowing the trailing
    // separator dot, then an optional trailing dot and whitespace.
    const numMatch = raw.match(/^(\d+(?:\.\d+)*)\.?\s+/);
    const num = numMatch ? numMatch[1] : '';
    const text = numMatch ? raw.slice(numMatch[0].length).trim() : raw;
    const level = num ? (num.match(/\./g) ?? []).length : 0;
    items.push({ href, num, text, level });
  }
  return items;
}
