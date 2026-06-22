export interface ArticleRow {
  slug: string;
  title: string;
  author: string | null;
  toc_html: string | null;
  preamble_html: string | null;
  content_html: string | null;
  word_count: number;
  synced_at: number;
}

export interface ArticleSummary {
  slug: string;
  title: string;
  author: string | null;
  word_count: number;
}

export type SyncStatus =
  | { phase: 'idle' }
  | { phase: 'fetching-list' }
  | { phase: 'syncing'; done: number; total: number; current: string }
  | { phase: 'done'; count: number }
  | { phase: 'error'; message: string };
