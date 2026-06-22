import * as SQLite from 'expo-sqlite';
import type { ArticleRow, ArticleSummary } from '../types';

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
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS articles (
      slug         TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      author       TEXT,
      toc_html     TEXT,
      preamble_html TEXT,
      content_html TEXT,
      word_count   INTEGER DEFAULT 0,
      synced_at    INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      slug UNINDEXED,
      title,
      body,
      content=articles,
      tokenize='porter ascii'
    );
  `);
}

export async function getArticleCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM articles WHERE content_html IS NOT NULL'
  );
  return row?.count ?? 0;
}

export async function getAllArticleSlugs(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ slug: string }>('SELECT slug FROM articles');
  return rows.map(r => r.slug);
}

export async function saveArticle(article: Omit<ArticleRow, 'synced_at'>): Promise<void> {
  const db = await getDb();
  const wordCount = countWords(article.content_html ?? '');
  const now = Date.now();

  await db.runAsync(
    `INSERT OR REPLACE INTO articles
      (slug, title, author, toc_html, preamble_html, content_html, word_count, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      article.slug,
      article.title,
      article.author ?? null,
      article.toc_html ?? null,
      article.preamble_html ?? null,
      article.content_html ?? null,
      wordCount,
      now,
    ]
  );

  // Update FTS index
  const bodyText = stripHtml(article.content_html ?? '');
  await db.runAsync(
    `INSERT OR REPLACE INTO articles_fts (slug, title, body) VALUES (?, ?, ?)`,
    [article.slug, article.title, bodyText]
  );
}

export async function getArticle(slug: string): Promise<ArticleRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ArticleRow>(
    'SELECT * FROM articles WHERE slug = ?',
    [slug]
  );
}

export async function searchArticles(query: string, limit = 50): Promise<ArticleSummary[]> {
  const db = await getDb();

  if (!query.trim()) {
    return db.getAllAsync<ArticleSummary>(
      'SELECT slug, title, author, word_count FROM articles WHERE content_html IS NOT NULL ORDER BY title ASC LIMIT ?',
      [limit]
    );
  }

  const ftsQuery = query.trim().split(/\s+/).map(w => `"${w}"*`).join(' ');
  return db.getAllAsync<ArticleSummary>(
    `SELECT a.slug, a.title, a.author, a.word_count
     FROM articles_fts fts
     JOIN articles a ON a.slug = fts.slug
     WHERE articles_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [ftsQuery, limit]
  );
}

export async function getSyncMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    [key, value]
  );
}

function countWords(html: string): number {
  const text = stripHtml(html);
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
