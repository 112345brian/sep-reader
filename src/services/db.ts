import * as SQLite from 'expo-sqlite';
import type { EntryRow, EntrySummary } from '../types';

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

    CREATE TABLE IF NOT EXISTS history (
      slug       TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      visited_at INTEGER NOT NULL
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

export async function recordVisit(slug: string, title: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO history (slug, title, visited_at) VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET visited_at = excluded.visited_at`,
    [slug, title, Date.now()]
  );
}

export async function getHistory(limit = 20): Promise<EntrySummary[]> {
  const db = await getDb();
  return db.getAllAsync<EntrySummary>(
    `SELECT h.slug, h.title, e.author, e.cached_at
     FROM history h
     LEFT JOIN entries e USING (slug)
     ORDER BY h.visited_at DESC
     LIMIT ?`,
    [limit]
  );
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
