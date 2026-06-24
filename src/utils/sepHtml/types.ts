// AST for SEP article bodies, produced by parse.ts and consumed by the native
// renderer. Intentionally narrow: it models only the tags SEP actually emits.
// Anything outside this set becomes an `unsupported` block that the renderer
// routes to a WebView fallback, so we never silently drop content.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'em'; kind: 'em' | 'strong'; children: Inline[] }
  // Deprecated/secondary inline formatting SEP still emits (u, s, small, q).
  | { t: 'styled'; style: 'underline' | 'strike' | 'small' | 'quote'; children: Inline[] }
  | { t: 'link'; href: string; wl: boolean; children: Inline[] }
  // Footnote marker, e.g. <sup><a href="#note-1">1</a></sup>. Kept distinct
  // from `link` so the renderer can wire it to the native footnote sheet.
  | { t: 'fnref'; href: string; label: string }
  | { t: 'sup'; children: Inline[] }
  | { t: 'sub'; children: Inline[] }
  | { t: 'code'; v: string }
  // Pre-rendered math SVG, substituted into content_html at fetch time.
  // `display` marks block-style (centered, own line) vs inline.
  // `w` and `h` are MathJax ex-unit dimensions.
  | { t: 'mathsvg'; svg: string; w: number; h: number; display: boolean }
  // Hash-referenced math: SVG is stored in the `math` DB table by hash and
  // loaded lazily after the article text renders. Replaces `mathsvg` for newly
  // fetched articles so content_html stays compact (no inlined base64 SVGs).
  | { t: 'mathref'; hash: string; w: number; h: number; display: boolean };

export interface TableRow {
  header: boolean;
  cells: Inline[][];
}

export interface TableBlock {
  t: 'table';
  caption?: Inline[];
  rows: TableRow[];
}

export interface DefRow {
  term: Inline[];
  def: Block[];
}

export type Block =
  | { t: 'heading'; level: 2 | 3 | 4 | 5 | 6; id?: string; children: Inline[] }
  | { t: 'para'; children: Inline[] }
  // `bib` marks a bibliography list (follows a "Bibliography" heading): rendered
  // without bullets, with a hanging indent, muted and slightly smaller.
  | { t: 'list'; ordered: boolean; items: Block[][]; bib?: boolean }
  | { t: 'blockquote'; children: Block[] }
  | { t: 'deflist'; rows: DefRow[] }
  | TableBlock
  | { t: 'image'; src: string; alt: string }
  | { t: 'rule' }
  // Content the native renderer can't faithfully show (MathJax script blocks,
  // equation images embedded mid-flow, nested tables, unknown tags). Carries
  // the raw HTML so a scoped WebView can render just this fragment.
  | { t: 'unsupported'; reason: string; html: string };

export interface ParsedArticle {
  blocks: Block[];
  // True if any block is `unsupported` — lets the screen decide whether to
  // pre-warm a WebView fallback.
  hasUnsupported: boolean;
  // Footnote definitions keyed by their element id (e.g. "note-1"), parsed from
  // the article's notes list. The renderer resolves a tapped <sup> ref (href
  // "#note-1") against this map to show the note natively — no per-tap HTML
  // re-scrape. Empty when the article has no footnotes.
  footnotes: Record<string, Inline[]>;
}
