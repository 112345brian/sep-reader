import { parseSepHtml } from '../parse';
import type { Block, Inline } from '../types';

// Inline fixtures mirroring the real SEP structures the corpus audit found
// (#main-text wrapper, #toc/#preamble chrome, headings with ids, inline TeX,
// definition lists, captioned tables). No network / filesystem.

const flattenInlines = (inl: Inline[], acc: Inline[] = []): Inline[] => {
  for (const i of inl) {
    acc.push(i);
    if ('children' in i && Array.isArray(i.children)) flattenInlines(i.children, acc);
  }
  return acc;
};
const allInlines = (blocks: Block[]): Inline[] => {
  const out: Inline[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.t === 'para' || b.t === 'heading') flattenInlines(b.children, out);
      else if (b.t === 'blockquote') walk(b.children);
      else if (b.t === 'list') b.items.forEach(walk);
      else if (b.t === 'deflist') b.rows.forEach(r => { flattenInlines(r.term, out); walk(r.def); });
      else if (b.t === 'table') { if (b.caption) flattenInlines(b.caption, out); b.rows.forEach(r => r.cells.forEach(c => flattenInlines(c, out))); }
    }
  };
  walk(blocks);
  return out;
};

describe('parseSepHtml', () => {
  it('descends #main-text and skips #toc/#preamble chrome', () => {
    const html = `<div id="aueditable"><div id="preamble"><p>skip me</p></div>
      <div id="toc"><ul><li><a href="#s1">1. One</a></li></ul></div>
      <div id="main-text"><h2 id="s1">1. One</h2><p>Body text.</p></div></div>`;
    const { blocks } = parseSepHtml(html);
    const headings = blocks.filter(b => b.t === 'heading') as Extract<Block, { t: 'heading' }>[];
    expect(headings).toHaveLength(1);
    expect(headings[0].id).toBe('s1');
    expect(headings[0].level).toBe(2);
    const paras = blocks.filter(b => b.t === 'para');
    expect(paras).toHaveLength(1); // preamble paragraph skipped
  });

  it('marks .wl links distinctly from plain links', () => {
    const html = `<div id="main-text"><p>See <a class="wl" href="/entries/foo/">foo</a> and <a href="http://x">x</a>.</p></div>`;
    const links = allInlines(parseSepHtml(html).blocks).filter(i => i.t === 'link') as Extract<Inline, { t: 'link' }>[];
    expect(links).toHaveLength(2);
    expect(links.find(l => l.href === '/entries/foo/')!.wl).toBe(true);
    expect(links.find(l => l.href === 'http://x')!.wl).toBe(false);
  });

  it('parses <math-i> elements into mathsvg inline nodes', () => {
    // A minimal SVG encoded as base64 (atob/btoa are available in Node 16+)
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>';
    const b64 = btoa(svg);
    const html = `<div id="main-text"><p>Let <math-i d="0" w="1.5" h="1.0">${b64}</math-i> follow.</p></div>`;
    const mathNodes = allInlines(parseSepHtml(html).blocks).filter(i => i.t === 'mathsvg') as Extract<Inline, { t: 'mathsvg' }>[];
    expect(mathNodes).toHaveLength(1);
    expect(mathNodes[0]).toMatchObject({ display: false, w: 1.5, h: 1.0 });
    expect(mathNodes[0].svg).toBe(svg);
  });

  it('legacy: raw TeX delimiters in text become code nodes (legacy fallback)', () => {
    const html = `<div id="main-text"><p>Let \\(A \\subseteq B\\) hold.</p></div>`;
    const inl = allInlines(parseSepHtml(html).blocks);
    expect(inl.some(i => i.t === 'code' && i.v.includes('A \\subseteq B'))).toBe(true);
    expect(inl.some(i => i.t === 'mathsvg')).toBe(false);
  });

  it('leaves an unbalanced TeX delimiter as plain text', () => {
    const html = `<div id="main-text"><p>a price of \\(10 with no close</p></div>`;
    const inl = allInlines(parseSepHtml(html).blocks);
    expect(inl.some(i => i.t === 'mathsvg')).toBe(false);
    expect(inl.some(i => i.t === 'text' && i.v.includes('\\(10'))).toBe(true);
  });

  it('marks lists under a Bibliography heading as bib, leaves others plain', () => {
    const html = `<div id="main-text">
      <h2 id="bib">Bibliography</h2>
      <ul><li><p>Quine, W.V.O., 1960.</p></li></ul>
      <h2 id="other">Other Internet Resources</h2>
      <ul><li><p>Some link.</p></li></ul>
    </div>`;
    const lists = parseSepHtml(html).blocks.filter(b => b.t === 'list') as Extract<Block, { t: 'list' }>[];
    expect(lists).toHaveLength(2);
    expect(lists[0].bib).toBe(true);  // under Bibliography
    expect(lists[1].bib).toBeFalsy(); // sibling section, not bibliographic
  });

  it('captures definition lists', () => {
    const html = `<div id="main-text"><dl><dt>Term</dt><dd><p>Definition.</p></dd></dl></div>`;
    const dl = parseSepHtml(html).blocks.find(b => b.t === 'deflist') as Extract<Block, { t: 'deflist' }>;
    expect(dl.rows).toHaveLength(1);
    expect(dl.rows[0].term.some(i => i.t === 'text' && i.v.includes('Term'))).toBe(true);
  });

  it('captures table captions', () => {
    const html = `<div id="main-text"><table><caption>The Four Causes</caption><tr><th>A</th><td>1</td></tr></table></div>`;
    const table = parseSepHtml(html).blocks.find(b => b.t === 'table') as Extract<Block, { t: 'table' }>;
    expect(table.caption?.some(i => i.t === 'text' && i.v.includes('Four Causes'))).toBe(true);
    expect(table.rows[0].header).toBe(true);
  });

  it('maps deprecated inline tags to styled nodes', () => {
    const html = `<div id="main-text"><p><u>under</u> <s>strike</s> <small>small</small> <q>quote</q></p></div>`;
    const styles = (allInlines(parseSepHtml(html).blocks).filter(i => i.t === 'styled') as Extract<Inline, { t: 'styled' }>[]).map(s => s.style);
    expect(styles).toEqual(expect.arrayContaining(['underline', 'strike', 'small', 'quote']));
  });

  it('flags nested tables as unsupported (WebView fallback)', () => {
    const html = `<div id="main-text"><table><tr><td><table><tr><td>inner</td></tr></table></td></tr></table></div>`;
    const { blocks, hasUnsupported } = parseSepHtml(html);
    expect(hasUnsupported).toBe(true);
    expect(blocks.some(b => b.t === 'unsupported' && b.reason === 'nested-table')).toBe(true);
  });

  it('never throws on empty or junk input', () => {
    expect(() => parseSepHtml('')).not.toThrow();
    expect(() => parseSepHtml('<p>orphan</p>')).not.toThrow();
    expect(() => parseSepHtml('<<<malformed')).not.toThrow();
  });

  it('collects footnote definitions keyed by id, dropping the return link', () => {
    const html = `<div id="main-text"><p>Body<sup><a href="#note-1">1</a></sup>.</p>
      <div id="notes"><ol><li id="note-1"><p>The footnote text. <a href="#ref-1">↩</a></p></li></ol></div></div>`;
    const { footnotes } = parseSepHtml(html);
    expect(footnotes['note-1']).toBeDefined();
    const text = footnotes['note-1'].map(i => (i.t === 'text' ? i.v : '')).join('');
    expect(text).toContain('The footnote text.');
    // The trailing "↩" return anchor is stripped.
    expect(footnotes['note-1'].some(i => i.t === 'link')).toBe(false);
  });

  it('has no footnotes map entries for articles without notes', () => {
    const { footnotes } = parseSepHtml('<div id="main-text"><p>Plain.</p></div>');
    expect(Object.keys(footnotes)).toHaveLength(0);
  });
});
