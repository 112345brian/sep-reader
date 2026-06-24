import type { Block, Inline } from './types';

export function collectMathHashes(blocks: Block[]): string[] {
  const out: string[] = [];
  walkBlocks(blocks, out);
  return out;
}

function walkBlocks(blocks: Block[], out: string[]) {
  for (const b of blocks) {
    if (b.t === 'para' || b.t === 'heading') walkInlines(b.children, out);
    else if (b.t === 'blockquote') walkBlocks(b.children, out);
    else if (b.t === 'list') b.items.forEach(item => walkBlocks(item, out));
    else if (b.t === 'deflist') b.rows.forEach(row => { walkInlines(row.term, out); walkBlocks(row.def, out); });
    else if (b.t === 'table') {
      if (b.caption) walkInlines(b.caption, out);
      b.rows.forEach(row => row.cells.forEach(cell => walkInlines(cell, out)));
    }
  }
}

function walkInlines(inlines: Inline[], out: string[]) {
  for (const n of inlines) {
    if (n.t === 'mathref') out.push(n.hash);
    if ('children' in n && Array.isArray(n.children)) walkInlines(n.children as Inline[], out);
  }
}
