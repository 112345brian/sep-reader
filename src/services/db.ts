import * as SQLite from 'expo-sqlite';
import type { EntryRow, EntrySummary, ReadRow, ReadNode, Session } from '../types';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('sep.db');
  await initSchema(_db);
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS entries (
      slug         TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      author       TEXT,
      toc_html     TEXT,
      preamble_html TEXT,
      content_html TEXT,
      word_count   INTEGER DEFAULT 0,
      cached_at    INTEGER
    );

    CREATE TABLE IF NOT EXISTS reads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      slug       TEXT NOT NULL,
      title      TEXT NOT NULL,
      visited_at INTEGER NOT NULL,
      from_slug  TEXT,
      session_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      slug UNINDEXED,
      title,
      content='entries',
      tokenize='porter ascii'
    );
  `);
}

export async function getEntryCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM entries'
  );
  return row?.count ?? 0;
}

export async function upsertIndexEntries(
  entries: { slug: string; title: string }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const e of entries) {
      await db.runAsync(
        `INSERT INTO entries (slug, title)
         VALUES (?, ?)
         ON CONFLICT(slug) DO UPDATE SET title = excluded.title`,
        [e.slug, e.title]
      );
      await db.runAsync(
        `INSERT INTO entries_fts (slug, title) VALUES (?, ?)
         ON CONFLICT DO UPDATE SET title = excluded.title`,
        [e.slug, e.title]
      );
    }
  });
}

export async function cacheArticle(
  slug: string,
  data: Pick<EntryRow, 'author' | 'toc_html' | 'preamble_html' | 'content_html'>
): Promise<void> {
  const db = await getDb();
  const wordCount = countWords(data.content_html ?? '');
  const now = Date.now();
  await db.runAsync(
    `UPDATE entries SET
       author = ?, toc_html = ?, preamble_html = ?,
       content_html = ?, word_count = ?, cached_at = ?
     WHERE slug = ?`,
    [data.author ?? null, data.toc_html ?? null, data.preamble_html ?? null,
     data.content_html ?? null, wordCount, now, slug]
  );
}

export async function getEntry(slug: string): Promise<EntryRow | null> {
  const db = await getDb();
  return db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE slug = ?', [slug]);
}

export async function searchEntries(query: string, limit = 60): Promise<EntrySummary[]> {
  const db = await getDb();
  if (!query.trim()) {
    return db.getAllAsync<EntrySummary>(
      `SELECT slug, title, author, cached_at FROM entries ORDER BY title ASC LIMIT ?`,
      [limit]
    );
  }
  const ftsQuery = query.trim().split(/\s+/).map(w => `"${w}"*`).join(' ');
  return db.getAllAsync<EntrySummary>(
    `SELECT e.slug, e.title, e.author, e.cached_at
     FROM entries_fts fts
     JOIN entries e USING (slug)
     WHERE entries_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [ftsQuery, limit]
  );
}

const SESSION_GAP_MS = 30 * 60 * 1000;

export async function recordRead(
  slug: string,
  title: string,
  fromSlug: string | null
): Promise<void> {
  const db = await getDb();
  const now = Date.now();

  // Find the most recent read to determine session
  const last = await db.getFirstAsync<{ visited_at: number; session_id: string }>(
    'SELECT visited_at, session_id FROM reads ORDER BY visited_at DESC LIMIT 1'
  );

  const sessionId =
    last && now - last.visited_at < SESSION_GAP_MS
      ? last.session_id
      : String(now);

  await db.runAsync(
    `INSERT INTO reads (slug, title, visited_at, from_slug, session_id)
     VALUES (?, ?, ?, ?, ?)`,
    [slug, title, now, fromSlug ?? null, sessionId]
  );
}

export async function getRecentSlugs(limit = 20): Promise<EntrySummary[]> {
  const db = await getDb();
  // Most recently read unique slugs
  return db.getAllAsync<EntrySummary>(
    `SELECT r.slug, r.title, e.author, e.cached_at
     FROM reads r
     LEFT JOIN entries e USING (slug)
     GROUP BY r.slug
     ORDER BY MAX(r.visited_at) DESC
     LIMIT ?`,
    [limit]
  );
}

export async function getSessions(limit = 30): Promise<Session[]> {
  const db = await getDb();

  const rows = await db.getAllAsync<ReadRow>(
    `SELECT id, slug, title, visited_at, from_slug, session_id
     FROM reads
     ORDER BY visited_at ASC`
  );

  // Group by session_id
  const sessionMap = new Map<string, ReadRow[]>();
  for (const row of rows) {
    const list = sessionMap.get(row.session_id) ?? [];
    list.push(row);
    sessionMap.set(row.session_id, list);
  }

  const sessions: Session[] = [];
  for (const [sessionId, reads] of sessionMap) {
    sessions.push({
      session_id: sessionId,
      started_at: reads[0].visited_at,
      roots: buildTree(reads),
      total: reads.length,
    });
  }

  // Newest first, limited
  return sessions.reverse().slice(0, limit);
}

function buildTree(reads: ReadRow[]): ReadNode[] {
  const bySlug = new Map<string, ReadNode>();

  // First pass: create nodes
  for (const r of reads) {
    // If same slug appears multiple times in a session, keep latest
    bySlug.set(r.slug, { ...r, depth: 0, children: [] });
  }

  const roots: ReadNode[] = [];

  // Second pass: wire parent → child
  for (const r of reads) {
    const node = bySlug.get(r.slug)!;
    if (r.from_slug && bySlug.has(r.from_slug)) {
      bySlug.get(r.from_slug)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Third pass: compute depths
  function setDepth(node: ReadNode, d: number) {
    node.depth = d;
    for (const child of node.children) setDepth(child, d + 1);
  }
  for (const root of roots) setDepth(root, 0);

  return roots;
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?', [key]
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]
  );
}

function countWords(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}
