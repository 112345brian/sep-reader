import { annotationHighlights } from '../render/Blocks';
import type { BlockHandlers } from '../render/Blocks';
import type { Annotation } from '../../../types';

const ann = (partial: Partial<Annotation> & { selected_text: string }): Annotation => ({
  id: 1, slug: 'test', context: null, note: null, color: '#fbbf24',
  content_hash: null, created_at: 0, updated_at: 0,
  ...partial,
});

const handlers = (annotations: Annotation[]): BlockHandlers => ({
  annotations,
});

describe('annotationHighlights', () => {
  it('finds a simple match', () => {
    const h = handlers([ann({ selected_text: 'philosophy' })]);
    const result = annotationHighlights('This is philosophy in action.', h);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(8);
    expect(result[0].end).toBe(18);
  });

  it('skips annotations whose selected_text is not in the paragraph', () => {
    const h = handlers([ann({ selected_text: 'epistemology' })]);
    const result = annotationHighlights('This is about metaphysics.', h);
    expect(result).toHaveLength(0);
  });

  it('uses context to pick the second occurrence when first is wrong', () => {
    const para = 'The mind perceives. The mind thinks.';
    // Context window is centered on the second "mind"
    const ctx = 'The mind thinks';
    const h = handlers([ann({ selected_text: 'mind', context: ctx })]);
    const result = annotationHighlights(para, h);
    expect(result).toHaveLength(1);
    // "The mind perceives. The mind thinks." — second "mind" at index 24
    expect(result[0].start).toBe(24);
  });

  it('falls back to first indexOf when context is not found in para', () => {
    const para = 'The mind perceives.';
    const h = handlers([ann({ selected_text: 'mind', context: 'completely different context' })]);
    const result = annotationHighlights(para, h);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(4);
  });

  it('de-duplicates overlapping annotations, keeping the first by position', () => {
    const para = 'Philosophy of mind.';
    const h = handlers([
      ann({ id: 1, selected_text: 'Philosophy of mind' }),
      ann({ id: 2, selected_text: 'Philosophy' }),
    ]);
    const result = annotationHighlights(para, h);
    expect(result).toHaveLength(1);
  });

  it('supports multiple non-overlapping highlights in the same paragraph', () => {
    const para = 'Plato and Aristotle are both philosophers.';
    const h = handlers([
      ann({ id: 1, selected_text: 'Plato' }),
      ann({ id: 2, selected_text: 'Aristotle' }),
    ]);
    const result = annotationHighlights(para, h);
    expect(result).toHaveLength(2);
    expect(result[0].start).toBe(0);
    expect(result[1].start).toBe(10);
  });

  it('skips empty or whitespace-only selected_text', () => {
    const h = handlers([ann({ selected_text: '   ' })]);
    const result = annotationHighlights('Any paragraph.', h);
    expect(result).toHaveLength(0);
  });
});
