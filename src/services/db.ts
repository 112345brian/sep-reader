import * as SQLite from 'expo-sqlite';
import type { EntryRow, EntrySummary, ReadRow, ReadNode, Session, Annotation } from '../types';

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
      pub_date     TEXT,
      content_hash TEXT,
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

    CREATE TABLE IF NOT EXISTS bookmarks (
      slug      TEXT PRIMARY KEY,
      title     TEXT NOT NULL,
      saved_at  INTEGER NOT NULL,
      notes     TEXT
    );

    CREATE TABLE IF NOT EXISTS links (
      from_slug TEXT NOT NULL,
      to_slug   TEXT NOT NULL,
      PRIMARY KEY (from_slug, to_slug)
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      slug          TEXT NOT NULL,
      selected_text TEXT NOT NULL,
      context       TEXT,
      note          TEXT,
      color         TEXT NOT NULL DEFAULT '#FFE566',
      content_hash  TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      slug UNINDEXED,
      title,
      content='entries',
      tokenize='porter ascii'
    );
  `);

  // Column migrations — no-op if columns already exist
  await Promise.all([
    db.runAsync('ALTER TABLE entries ADD COLUMN pub_date TEXT').catch(() => {}),
    db.runAsync('ALTER TABLE entries ADD COLUMN content_hash TEXT').catch(() => {}),
    db.runAsync('ALTER TABLE bookmarks ADD COLUMN notes TEXT').catch(() => {}),
    db.runAsync('ALTER TABLE annotations ADD COLUMN content_hash TEXT').catch(() => {}),
  ]);
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
  data: Pick<EntryRow, 'author' | 'pub_date' | 'toc_html' | 'preamble_html' | 'content_html'>
): Promise<void> {
  const db = await getDb();
  const wordCount = countWords(data.content_html ?? '');
  const hash = contentHash(data.content_html ?? '');
  const now = Date.now();
  await db.runAsync(
    `UPDATE entries SET
       author = ?, pub_date = ?, content_hash = ?,
       toc_html = ?, preamble_html = ?,
       content_html = ?, word_count = ?, cached_at = ?
     WHERE slug = ?`,
    [data.author ?? null, data.pub_date ?? null, hash,
     data.toc_html ?? null, data.preamble_html ?? null,
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

export interface Prefs {
  homeMode: 'search' | 'continue';
  downloadAll: boolean;
}

export async function getPrefs(): Promise<Prefs> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM meta WHERE key IN ('pref_home', 'pref_download_all')"
  );
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    homeMode: (map['pref_home'] as Prefs['homeMode']) ?? 'search',
    downloadAll: map['pref_download_all'] === 'true',
  };
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("INSERT OR REPLACE INTO meta VALUES ('pref_home', ?)", [prefs.homeMode]);
    await db.runAsync("INSERT OR REPLACE INTO meta VALUES ('pref_download_all', ?)", [String(prefs.downloadAll)]);
    await db.runAsync("INSERT OR REPLACE INTO meta VALUES ('onboarding_done', 'true')");
  });
}

export async function toggleBookmark(slug: string, title: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ slug: string }>(
    'SELECT slug FROM bookmarks WHERE slug = ?', [slug]
  );
  if (existing) {
    await db.runAsync('DELETE FROM bookmarks WHERE slug = ?', [slug]);
    return false;
  }
  await db.runAsync(
    'INSERT INTO bookmarks (slug, title, saved_at) VALUES (?, ?, ?)',
    [slug, title, Date.now()]
  );
  return true;
}

export async function isBookmarked(slug: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ slug: string }>(
    'SELECT slug FROM bookmarks WHERE slug = ?', [slug]
  );
  return !!row;
}

export async function getBookmarks(): Promise<EntrySummary[]> {
  const db = await getDb();
  return db.getAllAsync<EntrySummary>(
    `SELECT b.slug, b.title, e.author, e.cached_at
     FROM bookmarks b
     LEFT JOIN entries e USING (slug)
     ORDER BY b.saved_at DESC`
  );
}

export async function clearArticleCache(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE entries SET content_html = NULL, toc_html = NULL, preamble_html = NULL, cached_at = NULL'
  );
}

export async function getAllUncachedSlugs(): Promise<{ slug: string; title: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ slug: string; title: string }>(
    'SELECT slug, title FROM entries WHERE cached_at IS NULL ORDER BY title ASC'
  );
}

// ── Citation ─────────────────────────────────────────────────────────────────

export function formatCitation(entry: Pick<EntryRow, 'slug' | 'title' | 'author' | 'pub_date'>): string {
  const author = entry.author ?? 'Unknown';
  const date = entry.pub_date ? formatPubDate(entry.pub_date) : '';
  const url = `https://plato.stanford.edu/entries/${entry.slug}/`;
  const dateStr = date ? ` (${date})` : '';
  return `${author}. "${entry.title}". The Stanford Encyclopedia of Philosophy${dateStr}. Edward N. Zalta and Uri Nodelman (eds.). <${url}>`;
}

function formatPubDate(raw: string): string {
  const [year, month] = raw.split('/');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = parseInt(month ?? '1') - 1;
  return `${months[m] ?? ''} ${year ?? ''}`.trim();
}

// ── Article links (graph view) ────────────────────────────────────────────────

export async function indexLinks(fromSlug: string, contentHtml: string): Promise<void> {
  const db = await getDb();
  const re = /href="\/entries\/([a-z0-9-]+)\//g;
  const targets = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(contentHtml)) !== null) {
    if (m[1] !== fromSlug) targets.add(m[1]);
  }
  if (targets.size === 0) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM links WHERE from_slug = ?', [fromSlug]);
    for (const to of targets) {
      await db.runAsync(
        'INSERT OR IGNORE INTO links (from_slug, to_slug) VALUES (?, ?)',
        [fromSlug, to]
      );
    }
  });
}

export async function getLinksFrom(slug: string): Promise<EntrySummary[]> {
  const db = await getDb();
  return db.getAllAsync<EntrySummary>(
    `SELECT e.slug, e.title, e.author, e.cached_at
     FROM links l
     JOIN entries e ON e.slug = l.to_slug
     WHERE l.from_slug = ?
     ORDER BY e.title ASC`,
    [slug]
  );
}

export async function getLinksTo(slug: string): Promise<EntrySummary[]> {
  const db = await getDb();
  return db.getAllAsync<EntrySummary>(
    `SELECT e.slug, e.title, e.author, e.cached_at
     FROM links l
     JOIN entries e ON e.slug = l.from_slug
     WHERE l.to_slug = ?
     ORDER BY e.title ASC`,
    [slug]
  );
}

// ── Reading list (bookmarks + notes) ─────────────────────────────────────────

export async function updateBookmarkNotes(slug: string, notes: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE bookmarks SET notes = ? WHERE slug = ?', [notes, slug]);
}

export interface BookmarkRow {
  slug: string;
  title: string;
  saved_at: number;
  notes: string | null;
  author: string | null;
  pub_date: string | null;
  cached_at: number | null;
}

export async function getBookmarksFull(): Promise<BookmarkRow[]> {
  const db = await getDb();
  return db.getAllAsync<BookmarkRow>(
    `SELECT b.slug, b.title, b.saved_at, b.notes,
            e.author, e.pub_date, e.cached_at
     FROM bookmarks b
     LEFT JOIN entries e USING (slug)
     ORDER BY b.saved_at DESC`
  );
}

// ── Zotero ───────────────────────────────────────────────────────────────────

export async function getZoteroPrefs(): Promise<{ apiKey: string; userId: string }> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM meta WHERE key IN ('zotero_api_key', 'zotero_user_id')"
  );
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { apiKey: m['zotero_api_key'] ?? '', userId: m['zotero_user_id'] ?? '' };
}

export async function saveZoteroPrefs(apiKey: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("INSERT OR REPLACE INTO meta VALUES ('zotero_api_key', ?)", [apiKey]);
    await db.runAsync("INSERT OR REPLACE INTO meta VALUES ('zotero_user_id', ?)", [userId]);
  });
}

// ── Annotations ──────────────────────────────────────────────────────────────

export async function saveAnnotation(
  slug: string,
  selectedText: string,
  context: string | null,
  color: string,
  note: string | null = null,
  currentHash: string | null = null
): Promise<Annotation> {
  const db = await getDb();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO annotations (slug, selected_text, context, note, color, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [slug, selectedText, context ?? null, note ?? null, color, currentHash ?? null, now, now]
  );
  return {
    id: result.lastInsertRowId,
    slug, selected_text: selectedText, context: context ?? null,
    note: note ?? null, color, content_hash: currentHash ?? null,
    created_at: now, updated_at: now,
  };
}

export async function updateAnnotation(
  id: number, note: string | null, color: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE annotations SET note = ?, color = ?, updated_at = ? WHERE id = ?',
    [note ?? null, color, Date.now(), id]
  );
}

export async function deleteAnnotation(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM annotations WHERE id = ?', [id]);
}

export async function getAnnotationsForSlug(slug: string): Promise<Annotation[]> {
  const db = await getDb();
  return db.getAllAsync<Annotation>(
    'SELECT * FROM annotations WHERE slug = ? ORDER BY created_at ASC', [slug]
  );
}

export async function getAllAnnotations(): Promise<Annotation[]> {
  const db = await getDb();
  return db.getAllAsync<Annotation>('SELECT * FROM annotations ORDER BY created_at ASC');
}

// ── JSON user data export / import ───────────────────────────────────────────

export interface UserDataExport {
  version: number;
  exported_at: number;
  reads: ReadRow[];
  bookmarks: BookmarkRow[];
  annotations: Annotation[];
  prefs: Record<string, string>;
}

export async function exportUserData(): Promise<UserDataExport> {
  const db = await getDb();
  const [reads, bookmarks, annotations, metaRows] = await Promise.all([
    db.getAllAsync<ReadRow>('SELECT * FROM reads ORDER BY visited_at ASC'),
    db.getAllAsync<BookmarkRow>('SELECT * FROM bookmarks ORDER BY saved_at ASC'),
    db.getAllAsync<Annotation>('SELECT * FROM annotations ORDER BY created_at ASC'),
    db.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM meta WHERE key NOT IN ('onboarding_done')"
    ),
  ]);
  return {
    version: 1,
    exported_at: Date.now(),
    reads,
    bookmarks,
    annotations,
    prefs: Object.fromEntries(metaRows.map(r => [r.key, r.value])),
  };
}

export async function importUserData(data: UserDataExport): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // Reads: insert-or-ignore by (slug, visited_at) to avoid dupes
    for (const r of data.reads) {
      await db.runAsync(
        `INSERT OR IGNORE INTO reads (slug, title, visited_at, from_slug, session_id)
         VALUES (?, ?, ?, ?, ?)`,
        [r.slug, r.title, r.visited_at, r.from_slug ?? null, r.session_id]
      );
    }
    // Bookmarks: upsert by slug, keep newest saved_at
    for (const b of data.bookmarks) {
      await db.runAsync(
        `INSERT INTO bookmarks (slug, title, saved_at, notes)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title = excluded.title,
           saved_at = MAX(saved_at, excluded.saved_at),
           notes = COALESCE(excluded.notes, notes)`,
        [b.slug, b.title, b.saved_at, b.notes ?? null]
      );
    }
    // Annotations: upsert by id — incoming id wins on conflict
    for (const a of data.annotations) {
      await db.runAsync(
        `INSERT INTO annotations (id, slug, selected_text, context, note, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           note = COALESCE(excluded.note, note),
           color = excluded.color,
           updated_at = MAX(updated_at, excluded.updated_at)`,
        [a.id, a.slug, a.selected_text, a.context ?? null,
         a.note ?? null, a.color, a.created_at, a.updated_at]
      );
    }
    // Prefs: merge, remote wins
    for (const [key, value] of Object.entries(data.prefs ?? {})) {
      await db.runAsync(
        'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]
      );
    }
  });
}

// ── Sync folder ──────────────────────────────────────────────────────────────

export async function getSyncFolder(): Promise<string> {
  return (await getMeta('sync_folder')) ?? '';
}

export async function setSyncFolder(path: string): Promise<void> {
  await setMeta('sync_folder', path);
}

export async function updateAnnotationAnchor(
  id: number,
  newText: string,
  newHash: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE annotations SET selected_text = ?, content_hash = ?, updated_at = ? WHERE id = ?',
    [newText, newHash, Date.now(), id]
  );
}

export async function deleteAnnotations(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM annotations WHERE id IN (${placeholders})`, ids);
}

function countWords(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

// Fast djb2-style hash — enough to detect article version changes
export function contentHash(s: string): string {
  let h = 5381;
  const len = Math.min(s.length, 50000);
  for (let i = 0; i < len; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
