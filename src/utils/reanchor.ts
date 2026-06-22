import type { Annotation } from '../types';

export interface ReanchorResult {
  id: number;
  newText: string;   // possibly normalized form of original
  found: boolean;
}

// Try to find an annotation's text in updated article content.
// Returns the matching text string (possibly normalized) or null.
export function tryReanchor(
  selectedText: string,
  context: string | null,
  newContent: string
): string | null {
  // 1. Exact match (shouldn't reach here if already found, but be safe)
  if (newContent.includes(selectedText)) return selectedText;

  // 2. Normalize typographic variants
  const norm = (s: string) =>
    s
      .replace(/[‘’ʼ]/g, "'")   // smart single quotes
      .replace(/[“”]/g, '"')           // smart double quotes
      .replace(/[–—]/g, '-')           // en/em dashes
      .replace(/ /g, ' ')                   // non-breaking space
      .replace(/\s+/g, ' ');

  const normText = norm(selectedText);
  const normContent = norm(newContent);

  if (normContent.includes(normText)) return normText;

  // 3. Context-aware search
  if (context) {
    const normContext = norm(context);
    const found = contextSearch(normText, normContext, normContent);
    if (found) return found;
  }

  // 4. Loose match: strip all punctuation and try
  const loose = (s: string) => s.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const looseText = loose(selectedText);
  if (looseText.length > 12) {
    const looseIdx = normContent.indexOf(looseText);
    if (looseIdx >= 0) {
      // Return the original text but trimmed — good enough for re-highlighting
      return normText;
    }
  }

  return null;
}

function contextSearch(
  normText: string,
  normContext: string,
  normContent: string
): string | null {
  // Try full context
  const idx = normContent.indexOf(normContext);
  if (idx >= 0) {
    const window = normContent.slice(
      Math.max(0, idx - 20),
      idx + normContext.length + 20
    );
    if (window.includes(normText)) return normText;
  }

  // Try progressively shorter context prefixes (40, 25, 15 chars)
  for (const prefixLen of [40, 25, 15]) {
    const prefix = normContext.slice(0, prefixLen);
    if (prefix.length < prefixLen) continue; // context too short
    const pIdx = normContent.indexOf(prefix);
    if (pIdx >= 0) {
      const window = normContent.slice(pIdx, pIdx + normContext.length + 100);
      if (window.includes(normText)) return normText;
    }
  }

  return null;
}

// Run re-anchoring for all orphaned annotations, return results
export function reanchorAll(
  orphaned: Annotation[],
  newContent: string
): ReanchorResult[] {
  return orphaned.map(ann => {
    const newText = tryReanchor(ann.selected_text, ann.context, newContent);
    return { id: ann.id, newText: newText ?? ann.selected_text, found: newText !== null };
  });
}
