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

export interface ReadRow {
  id: number;
  slug: string;
  title: string;
  visited_at: number;
  from_slug: string | null;
  session_id: string;
}

export interface ReadNode extends ReadRow {
  depth: number;
  children: ReadNode[];
}

export interface Session {
  session_id: string;
  started_at: number;
  roots: ReadNode[];
  total: number;
}
