export interface EntryRow {
  slug: string;
  title: string;
  author: string | null;
  toc_html: string | null;
  preamble_html: string | null;
  content_html: string | null;
  word_count: number;
  cached_at: number | null;
}

export interface EntrySummary {
  slug: string;
  title: string;
  author: string | null;
  cached_at: number | null;
}
