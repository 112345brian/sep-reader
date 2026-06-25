export interface EntryRow {
  slug: string;
  title: string;
  parent_label: string | null;
  source: string;
  author: string | null;
  pub_date: string | null;
  content_hash: string | null;
  toc_html: string | null;
  preamble_html: string | null;
  content_html: string | null;
  content_ast: string | null;
  has_math: number | null;
  word_count: number;
  cached_at: number | null;
}

export interface EntrySummary {
  slug: string;
  title: string;
  parent_label?: string | null;
  author: string | null;
  cached_at: number | null;
  read_progress?: number | null;   // 0..1 fraction read
  annotation_count?: number;        // notes on this entry
  excerpt?: string | null;          // plain-text snippet for home rows
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

export interface Annotation {
  id: number;
  slug: string;
  selected_text: string;
  context: string | null;
  note: string | null;
  color: string;
  content_hash: string | null;
  created_at: number;
  updated_at: number;
}
