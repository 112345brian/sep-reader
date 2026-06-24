import { parseDocument, DomUtils } from 'htmlparser2';
import type { Block, Inline, ParsedArticle, TableRow, DefRow } from './types';

// Minimal structural view of the htmlparser2 / domhandler node shape. We avoid
// importing domhandler's own types so we aren't coupled to its internals.
interface DomNode {
  type: string; // 'tag' | 'text' | 'comment' | 'script' | 'style' | ...
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'dl', 'table', 'hr', 'img', 'div', 'section',
]);

// Container divs we descend into rather than render. SEP wraps the real article
// in <div id="main-text"> and nests #preamble / #toc / #pubinfo as siblings.
const TRANSPARENT_IDS = new Set(['main-text', 'aueditable', 'article-content']);
// Sibling sections inside the body we skip — they're rendered as native chrome
// elsewhere (the screen renders preamble/toc/title itself).
const SKIP_IDS = new Set(['preamble', 'toc', 'pubinfo']);

function isTag(n: DomNode): boolean {
  return n.type === 'tag';
}

function getId(n: DomNode): string | undefined {
  return n.attribs?.id;
}

function outerHtml(n: DomNode): string {
  // DomUtils.getOuterHTML accepts the loose node shape at runtime.
  return DomUtils.getOuterHTML(n as never, { decodeEntities: false });
}

// ── Inline parsing ───────────────────────────────────────────────────────────

// Trim leading and trailing pure-whitespace text nodes from an inline array,
// mirroring the browser rule: whitespace-only text between block elements is
// invisible. Also strips any leading/trailing space character left by the
// \s+→' ' collapse (e.g. "\n  Hello" → " Hello" → "Hello").
function trimInlineEdges(inlines: Inline[]): Inline[] {
  let s = 0;
  while (s < inlines.length) {
    const n = inlines[s];
    if (n.t !== 'text') break;
    const trimmed = n.v.trimStart();
    if (trimmed === '') { s++; continue; }
    if (trimmed !== n.v) inlines[s] = { ...n, v: trimmed };
    break;
  }
  let e = inlines.length - 1;
  while (e >= s) {
    const n = inlines[e];
    if (n.t !== 'text') break;
    const trimmed = n.v.trimEnd();
    if (trimmed === '') { e--; continue; }
    if (trimmed !== n.v) inlines[e] = { ...n, v: trimmed };
    break;
  }
  return inlines.slice(s, e + 1);
}

// Legacy fallback: articles not yet backfilled still have raw \(…\) / \[…\]
// in their content_html. Wrap them in a code node (monospace) rather than
// showing the \( \) punctuation as plain text. New articles have these
// replaced with <math-i> tags at fetch time and never hit this path.
const MATH_LEGACY_RE = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
function splitTextLegacy(text: string): Inline[] {
  if (text.indexOf('\\(') === -1 && text.indexOf('\\[') === -1) {
    return [{ t: 'text', v: text }];
  }
  const out: Inline[] = [];
  let last = 0;
  MATH_LEGACY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_LEGACY_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    out.push({ t: 'code', v: (m[1] ?? m[2]).trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

function parseInlines(nodes: DomNode[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    if (n.type === 'text') {
      // Collapse whitespace the way browsers do: runs of \n/\t/spaces → single space.
      if (n.data) out.push(...splitTextLegacy(n.data.replace(/\s+/g, ' ')));
      continue;
    }
    if (!isTag(n) || !n.name) continue;
    const name = n.name.toLowerCase();
    const kids = n.children ?? [];
    switch (name) {
      case 'em':
      case 'i':
        out.push({ t: 'em', kind: 'em', children: parseInlines(kids) });
        break;
      case 'strong':
      case 'b':
        out.push({ t: 'em', kind: 'strong', children: parseInlines(kids) });
        break;
      case 'cite':
        // Bibliographic cite → italic, same as <em>.
        out.push({ t: 'em', kind: 'em', children: parseInlines(kids) });
        break;
      case 'u':
        out.push({ t: 'styled', style: 'underline', children: parseInlines(kids) });
        break;
      case 's':
      case 'strike':
      case 'del':
        out.push({ t: 'styled', style: 'strike', children: parseInlines(kids) });
        break;
      case 'small':
        out.push({ t: 'styled', style: 'small', children: parseInlines(kids) });
        break;
      case 'q':
        out.push({ t: 'styled', style: 'quote', children: parseInlines(kids) });
        break;
      case 'a': {
        const href = n.attribs?.href ?? '';
        const cls = n.attribs?.class ?? '';
        out.push({
          t: 'link',
          href,
          wl: /\bwl\b/.test(cls),
          children: parseInlines(kids),
        });
        break;
      }
      case 'sup': {
        // A <sup> wrapping a single anchor to a note/footnote is a footnote ref.
        const anchor = kids.find(
          k => isTag(k) && k.name?.toLowerCase() === 'a' && /^#/.test(k.attribs?.href ?? '')
        );
        const href = anchor?.attribs?.href ?? '';
        if (anchor && /#(note|fn)/i.test(href)) {
          out.push({ t: 'fnref', href, label: textOf(anchor).replace(/[[\]]/g, '') });
        } else {
          out.push({ t: 'sup', children: parseInlines(kids) });
        }
        break;
      }
      case 'sub':
        out.push({ t: 'sub', children: parseInlines(kids) });
        break;
      case 'code':
      case 'tt':
        out.push({ t: 'code', v: textOf(n) });
        break;
      case 'br':
        out.push({ t: 'text', v: '\n' });
        break;
      case 'math-i': {
        const display = n.attribs?.d === '1';
        const w = parseFloat(n.attribs?.w ?? '1') || 1;
        const h = parseFloat(n.attribs?.h ?? '1') || 1;
        const hash = n.attribs?.hash;
        if (hash) {
          // New format: SVG stored in math table, referenced by hash.
          out.push({ t: 'mathref', hash, w, h, display });
        } else {
          // Legacy format: SVG inlined as base64 in text content.
          const b64 = textOf(n);
          if (!b64) break;
          const svg = atob(b64);
          out.push({ t: 'mathsvg', svg, w, h, display });
        }
        break;
      }
      case 'span':
        // Spans are presentational in SEP; flatten their children.
        out.push(...parseInlines(kids));
        break;
      default:
        // Unknown inline-ish tag: keep its text so we never lose words.
        out.push(...parseInlines(kids));
    }
  }
  return out;
}

function textOf(n: DomNode): string {
  if (n.type === 'text') return n.data ?? '';
  return (n.children ?? []).map(textOf).join('');
}

// ── Block parsing ────────────────────────────────────────────────────────────

function parseListItems(listNode: DomNode): Block[][] {
  const items: Block[][] = [];
  for (const li of listNode.children ?? []) {
    if (!isTag(li) || li.name?.toLowerCase() !== 'li') continue;
    items.push(parseBlocks(li.children ?? []));
  }
  return items;
}

function parseDefList(dlNode: DomNode): DefRow[] {
  const rows: DefRow[] = [];
  let pendingTerm: Inline[] | null = null;
  for (const child of dlNode.children ?? []) {
    if (!isTag(child)) continue;
    const name = child.name?.toLowerCase();
    if (name === 'dt') {
      pendingTerm = parseInlines(child.children ?? []);
    } else if (name === 'dd') {
      rows.push({ term: pendingTerm ?? [], def: parseBlocks(child.children ?? []) });
      pendingTerm = null;
    }
  }
  return rows;
}

function parseTable(tableNode: DomNode): Block {
  const rows: TableRow[] = [];
  // Caption (e.g. "The Four Causes") — rendered as a label above the table.
  const captionNode = (tableNode.children ?? []).find(
    c => isTag(c) && c.name?.toLowerCase() === 'caption'
  );
  const caption = captionNode ? parseInlines(captionNode.children ?? []) : undefined;
  // Flatten thead/tbody/tfoot; collect <tr>.
  const trs: DomNode[] = [];
  const collect = (n: DomNode) => {
    for (const c of n.children ?? []) {
      if (!isTag(c)) continue;
      const cn = c.name?.toLowerCase();
      if (cn === 'tr') trs.push(c);
      else if (cn === 'thead' || cn === 'tbody' || cn === 'tfoot') collect(c);
    }
  };
  collect(tableNode);
  for (const tr of trs) {
    const cells: Inline[][] = [];
    let header = false;
    for (const cell of tr.children ?? []) {
      if (!isTag(cell)) continue;
      const cn = cell.name?.toLowerCase();
      if (cn === 'th') header = true;
      if (cn === 'th' || cn === 'td') cells.push(parseInlines(cell.children ?? []));
    }
    if (cells.length) rows.push({ header, cells });
  }
  // Nested tables or tables with block content in cells are beyond the native
  // grid; flag for fallback if any cell itself contained a table.
  const hasNested = DomUtils.findOne(
    (e: never) => (e as DomNode).name?.toLowerCase() === 'table',
    tableNode.children as never,
    true
  );
  if (hasNested) {
    return { t: 'unsupported', reason: 'nested-table', html: outerHtml(tableNode) };
  }
  return { t: 'table', caption, rows };
}

function parseBlocks(nodes: DomNode[]): Block[] {
  const out: Block[] = [];
  // Accumulate loose inline content (text/links between block tags) into paras.
  let inlineBuffer: DomNode[] = [];
  const flush = () => {
    if (!inlineBuffer.length) return;
    const inlines = trimInlineEdges(parseInlines(inlineBuffer));
    inlineBuffer = [];
    if (inlines.some(i => i.t !== 'text' || i.v.trim() !== '')) {
      out.push({ t: 'para', children: inlines });
    }
  };

  for (const n of nodes) {
    if (n.type === 'text') {
      inlineBuffer.push(n);
      continue;
    }
    if (n.type === 'comment') continue;
    if (n.type === 'script' || n.type === 'style') {
      // MathJax/script: route the surrounding nothing — scripts alone carry no
      // visible text, so skip. (Equation <img> is handled as a block below.)
      continue;
    }
    if (!isTag(n) || !n.name) continue;
    const name = n.name.toLowerCase();

    if (!BLOCK_TAGS.has(name)) {
      // Inline-level tag at block scope (a, em, sup, …): buffer it.
      inlineBuffer.push(n);
      continue;
    }

    flush();
    const kids = n.children ?? [];

    switch (name) {
      case 'div':
      case 'section': {
        const id = getId(n);
        if (id && SKIP_IDS.has(id)) break;
        // Descend into container divs; their block children join the flow.
        out.push(...parseBlocks(kids));
        break;
      }
      case 'p':
        out.push({ t: 'para', children: trimInlineEdges(parseInlines(kids)) });
        break;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = Math.max(2, Number(name[1])) as 2 | 3 | 4 | 5 | 6;
        // id may be on the heading or on a child <a name>/<a id>.
        let id = getId(n);
        if (!id) {
          const anchor = kids.find(k => isTag(k) && k.name?.toLowerCase() === 'a');
          id = anchor?.attribs?.name ?? anchor?.attribs?.id;
        }
        out.push({ t: 'heading', level, id, children: trimInlineEdges(parseInlines(kids)) });
        break;
      }
      case 'ul':
      case 'ol':
        out.push({ t: 'list', ordered: name === 'ol', items: parseListItems(n) });
        break;
      case 'li':
        // Stray <li> outside a list: treat as a paragraph.
        out.push({ t: 'para', children: trimInlineEdges(parseInlines(kids)) });
        break;
      case 'blockquote':
        out.push({ t: 'blockquote', children: parseBlocks(kids) });
        break;
      case 'dl':
        out.push({ t: 'deflist', rows: parseDefList(n) });
        break;
      case 'table':
        out.push(parseTable(n));
        break;
      case 'hr':
        out.push({ t: 'rule' });
        break;
      case 'img': {
        const src = n.attribs?.src ?? '';
        // Inline equation images (SEP names them with .png in /entries/.../) are
        // fine to show; keep as image block with absolute-ish src resolution
        // deferred to the renderer.
        out.push({ t: 'image', src, alt: n.attribs?.alt ?? '' });
        break;
      }
    }
  }
  flush();
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

function hasUnsupportedBlock(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.t === 'unsupported') return true;
    if (b.t === 'blockquote') return hasUnsupportedBlock(b.children);
    if (b.t === 'list') return b.items.some(item => hasUnsupportedBlock(item));
    if (b.t === 'deflist') return b.rows.some(row => hasUnsupportedBlock(row.def));
    return false;
  });
}

// Collect footnote definitions (elements whose id is "note-N" / "fn-N") into a
// map keyed by id, so the renderer can resolve a footnote ref against the parsed
// AST instead of re-scraping raw HTML on every tap. Trailing back-reference
// anchors (the "↩" return link SEP appends) are dropped so the note reads clean.
function inlineTextLen(inlines: Inline[]): number {
  let len = 0;
  for (const i of inlines) {
    if (i.t === 'text' || i.t === 'code') len += i.v.length;
    else if ('children' in i && Array.isArray(i.children)) len += inlineTextLen(i.children);
  }
  return len;
}

function collectFootnotes(nodes: DomNode[], out: Record<string, Inline[]>): void {
  for (const n of nodes) {
    if (!isTag(n)) continue;
    const id = n.attribs?.id;
    if (id && /^(note|fn|footnote)[-_]?\d/i.test(id) && !(id in out)) {
      const inlines = parseInlines(n.children ?? []);
      // Drop a trailing return-link (short anchor back to the ref point) and
      // any trailing whitespace so the note reads clean in the popup.
      while (inlines.length) {
        const last = inlines[inlines.length - 1];
        if (last.t === 'link' && inlineTextLen(last.children) <= 2) inlines.pop();
        else if (last.t === 'text' && last.v.trim() === '') inlines.pop();
        else break;
      }
      out[id] = inlines;
    }
    if (n.children) collectFootnotes(n.children, out);
  }
}

// Mark lists that fall under a "Bibliography" (or "References") heading so the
// renderer can drop the bullets and use a hanging indent. SEP tags these with
// ids/classes we lose during parsing, so we recover the intent positionally:
// once a bibliography heading is seen, every following list — until the next
// same-or-higher-level heading — is bibliographic.
function markBibliographyLists(blocks: Block[]): void {
  let inBib = false;
  let bibLevel = 0;
  for (const b of blocks) {
    if (b.t === 'heading') {
      const text = inlinePlainText(b.children).trim().toLowerCase();
      if (/^(bibliography|references|further reading)\b/.test(text)) {
        inBib = true;
        bibLevel = b.level;
      } else if (inBib && b.level <= bibLevel) {
        inBib = false;
      }
    } else if (b.t === 'list' && inBib) {
      b.bib = true;
    }
  }
}

function inlinePlainText(inlines: Inline[]): string {
  let s = '';
  for (const i of inlines) {
    if (i.t === 'text' || i.t === 'code') s += i.v;
    else if ('children' in i && Array.isArray(i.children)) s += inlinePlainText(i.children);
  }
  return s;
}

export function parseSepHtml(html: string): ParsedArticle {
  const doc = parseDocument(html, { decodeEntities: true });
  const roots = (doc.children ?? []) as unknown as DomNode[];
  const blocks = parseBlocks(roots);
  markBibliographyLists(blocks);
  const footnotes: Record<string, Inline[]> = {};
  collectFootnotes(roots, footnotes);
  return {
    blocks,
    hasUnsupported: hasUnsupportedBlock(blocks),
    footnotes,
  };
}
