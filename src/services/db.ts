import * as SQLite from 'expo-sqlite';
import type { EntryRow, EntrySummary, ReadRow, ReadNode, Session, Annotation } from '../types';
import { makeExcerpt } from '../utils/excerpt';

let _db: SQLite.SQLiteDatabase | null = null;

// Exported so feature modules that own their own tables (e.g. services/graphDb.ts)
// can share the single app DB connection rather than opening their own.
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
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
      parent_label TEXT,
      source       TEXT NOT NULL DEFAULT 'sep',
      author       TEXT,
      pub_date     TEXT,
      content_hash TEXT,
      toc_html     TEXT,
      preamble_html TEXT,
      content_html TEXT,
      word_count   INTEGER DEFAULT 0,
      read_progress REAL DEFAULT 0,
      excerpt      TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_links_to_slug ON links(to_slug);

    CREATE TABLE IF NOT EXISTS article_versions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slug         TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      cached_at    INTEGER NOT NULL,
      UNIQUE(slug, content_hash)
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

    -- NOTE: the InPhO semantic-graph tables (inpho_nodes, inpho_relations) are
    -- owned by services/graphDb.ts, which lazily creates them the first time the
    -- graph feature is used. Keeping that schema out of the core reader DB keeps
    -- the graph an optional, self-contained module.

    -- Client-rendered math cache. Each row is a TeX equation rendered to SVG
    -- ON THIS DEVICE (mathStore.ts / texToSvg.ts) from article TeX the user
    -- fetched. This is a runtime artifact and is NEVER bundled or shipped — see
    -- NOTICE.md. hash = mathStore.mathHash(tex, display); d = display flag.
    CREATE TABLE IF NOT EXISTS math (
      hash TEXT PRIMARY KEY,
      svg  TEXT NOT NULL,
      w    REAL,
      h    REAL,
      d    INTEGER NOT NULL DEFAULT 0
    );

  `);

  // Column migrations — no-op if columns already exist
  await Promise.all([
    db.runAsync('ALTER TABLE entries ADD COLUMN pub_date TEXT').catch(() => {}),
    db.runAsync('ALTER TABLE entries ADD COLUMN content_hash TEXT').catch(() => {}),
    db.runAsync('ALTER TABLE bookmarks ADD COLUMN notes TEXT').catch(() => {}),
    db.runAsync('ALTER TABLE annotations ADD COLUMN content_hash TEXT').catch(() => {}),
    db.runAsync('ALTER TABLE entries ADD COLUMN read_progress REAL DEFAULT 0').catch(() => {}),
    db.runAsync('ALTER TABLE entries ADD COLUMN excerpt TEXT').catch(() => {}),
    db.runAsync('ALTER TABLE entries ADD COLUMN parent_label TEXT').catch(() => {}),
    db.runAsync("ALTER TABLE entries ADD COLUMN source TEXT NOT NULL DEFAULT 'sep'").catch(() => {}),
    db.runAsync('ALTER TABLE entries ADD COLUMN has_math INTEGER DEFAULT 0').catch(() => {}),
  ]);

  // One-time migration: clear articles cached before preamble_html column existed
  // so they re-fetch with the corrected parser (title/preamble no longer embedded in content_html).
  const didClear = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'migrated_clear_cache_v2'`
  );
  if (!didClear) {
    await db.runAsync(
      `UPDATE entries SET content_html = NULL, preamble_html = NULL, toc_html = NULL,
       excerpt = NULL, cached_at = NULL WHERE cached_at IS NOT NULL`
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO meta (key, value) VALUES ('migrated_clear_cache_v2', '1')`
    );
  }

  // Migrate FTS from content-table to standalone if needed, then ensure it exists
  const ftsInfo = await db.getFirstAsync<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='entries_fts'`
  );
  const needsCreate = !ftsInfo || ftsInfo.sql?.includes("content='entries'");
  if (needsCreate) {
    await db.runAsync('DROP TABLE IF EXISTS entries_fts');
    await db.runAsync(`
      CREATE VIRTUAL TABLE entries_fts USING fts5(
        slug UNINDEXED,
        title,
        tokenize='porter ascii'
      )
    `);
    // Populate from existing entries
    await db.runAsync(`INSERT INTO entries_fts(slug, title) SELECT slug, title FROM entries`);
  }
}

export async function getEntryCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM entries'
  );
  return row?.count ?? 0;
}

// ── Client-rendered math cache (see src/utils/sepHtml/render/mathStore.ts) ──

export interface MathRow {
  hash: string;
  svg: string;
  w: number;
  h: number;
  d: boolean;
}

// Bulk-load cached equations by hash to warm the in-memory render cache.
export async function getMathByHashes(hashes: string[]): Promise<MathRow[]> {
  if (hashes.length === 0) return [];
  const db = await getDb();
  const placeholders = hashes.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ hash: string; svg: string; w: number; h: number; d: number }>(
    `SELECT hash, svg, w, h, d FROM math WHERE hash IN (${placeholders})`,
    hashes
  );
  return rows.map(r => ({ hash: r.hash, svg: r.svg, w: r.w, h: r.h, d: r.d === 1 }));
}

// Persist one device-rendered equation. Idempotent on hash.
export async function putMath(
  hash: string,
  svg: string,
  w: number,
  h: number,
  display: boolean
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO math (hash, svg, w, h, d) VALUES (?, ?, ?, ?, ?)',
    [hash, svg, w, h, display ? 1 : 0]
  );
}

export async function upsertIndexEntries(
  entries: { slug: string; title: string; parent_label?: string | null }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const e of entries) {
      await db.runAsync(
        `INSERT INTO entries (slug, title, parent_label)
         VALUES (?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET title = excluded.title, parent_label = excluded.parent_label`,
        [e.slug, e.title, e.parent_label ?? null]
      );
      await db.runAsync(`DELETE FROM entries_fts WHERE slug = ?`, [e.slug]);
      await db.runAsync(`INSERT INTO entries_fts (slug, title) VALUES (?, ?)`, [e.slug, e.title]);
    }
  });
}

export async function cacheArticle(
  slug: string,
  data: Pick<EntryRow, 'author' | 'pub_date' | 'toc_html' | 'preamble_html' | 'content_html' | 'has_math'>
): Promise<void> {
  const db = await getDb();
  const wordCount = countWords(data.content_html ?? '');
  const hash = contentHash(data.content_html ?? '');
  const excerpt = makeExcerpt(data.preamble_html || data.content_html || '');
  const now = Date.now();

  // Preserve the old version record before overwriting
  const prev = await db.getFirstAsync<{ content_hash: string | null; cached_at: number | null }>(
    'SELECT content_hash, cached_at FROM entries WHERE slug = ?', [slug]
  );
  if (prev?.content_hash && prev?.cached_at) {
    await db.runAsync(
      'INSERT OR IGNORE INTO article_versions (slug, content_hash, cached_at) VALUES (?, ?, ?)',
      [slug, prev.content_hash, prev.cached_at]
    );
  }

  await db.runAsync(
    `UPDATE entries SET
       author = ?, pub_date = ?, content_hash = ?,
       toc_html = ?, preamble_html = ?,
       content_html = ?, has_math = ?, word_count = ?, excerpt = ?, cached_at = ?
     WHERE slug = ?`,
    [data.author ?? null, data.pub_date ?? null, hash,
     data.toc_html ?? null, data.preamble_html ?? null,
     data.content_html ?? null, data.has_math ? 1 : 0, wordCount, excerpt, now, slug]
  );

  // Record the new version
  await db.runAsync(
    'INSERT OR IGNORE INTO article_versions (slug, content_hash, cached_at) VALUES (?, ?, ?)',
    [slug, hash, now]
  );
}

export async function getArticleVersionDate(slug: string, hash: string): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cached_at: number }>(
    'SELECT cached_at FROM article_versions WHERE slug = ? AND content_hash = ?',
    [slug, hash]
  );
  return row?.cached_at ?? null;
}

export async function getEntry(slug: string): Promise<EntryRow | null> {
  const db = await getDb();
  return db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE slug = ?', [slug]);
}

// Lightweight row for graph node previews (no heavy content_html)
export async function getEntryPreview(
  slug: string
): Promise<{ title: string; author: string | null; excerpt: string | null } | null> {
  const db = await getDb();
  return db.getFirstAsync<{ title: string; author: string | null; excerpt: string | null }>(
    'SELECT title, author, excerpt FROM entries WHERE slug = ?',
    [slug]
  );
}

export async function searchEntries(query: string, limit = 60): Promise<EntrySummary[]> {
  const db = await getDb();
  if (!query.trim()) {
    return db.getAllAsync<EntrySummary>(
      `SELECT slug, title, parent_label, author, cached_at FROM entries ORDER BY title ASC LIMIT ?`,
      [limit]
    );
  }
  const ftsQuery = query.trim().split(/\s+/).map(w => `"${w}"*`).join(' ');
  return db.getAllAsync<EntrySummary>(
    `SELECT e.slug, e.title, e.parent_label, e.author, e.cached_at
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

// Persist how far through an article the reader has scrolled (0..1).
// Only ratchets upward so re-opening near the top doesn't erase progress.
export async function setReadProgress(slug: string, progress: number): Promise<void> {
  const db = await getDb();
  const clamped = Math.max(0, Math.min(1, progress));
  await db.runAsync(
    'UPDATE entries SET read_progress = MAX(COALESCE(read_progress, 0), ?) WHERE slug = ?',
    [clamped, slug]
  );
}

export async function getRecentSlugs(limit = 20): Promise<EntrySummary[]> {
  const db = await getDb();
  // Most recently read unique slugs, with progress / annotation count / excerpt
  return db.getAllAsync<EntrySummary>(
    `SELECT r.slug, r.title, e.parent_label, e.author, e.cached_at,
            e.read_progress, e.excerpt,
            (SELECT COUNT(*) FROM annotations a WHERE a.slug = r.slug) AS annotation_count
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

const metaCache = new Map<string, string | null>();

export async function getMeta(key: string): Promise<string | null> {
  if (metaCache.has(key)) return metaCache.get(key)!;
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?', [key]
  );
  const val = row?.value ?? null;
  metaCache.set(key, val);
  return val;
}

export async function setMeta(key: string, value: string): Promise<void> {
  metaCache.set(key, value);
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]
  );
}

export interface Prefs {
  homeMode: 'search' | 'continue';
  downloadAll: boolean;
  libraryScope: 'all' | 'sep' | 'owl';
}

export async function getPrefs(): Promise<Prefs> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM meta WHERE key IN ('pref_home', 'pref_download_all', 'pref_library_scope')"
  );
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    homeMode: (map['pref_home'] as Prefs['homeMode']) ?? 'search',
    downloadAll: map['pref_download_all'] !== 'false',
    libraryScope: (map['pref_library_scope'] as Prefs['libraryScope']) ?? 'all',
  };
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("INSERT OR REPLACE INTO meta VALUES ('pref_home', ?)", [prefs.homeMode]);
    await db.runAsync("INSERT OR REPLACE INTO meta VALUES ('pref_download_all', ?)", [String(prefs.downloadAll)]);
    await db.runAsync("INSERT OR REPLACE INTO meta VALUES ('pref_library_scope', ?)", [prefs.libraryScope]);
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
    `SELECT b.slug, b.title, e.parent_label, e.author, e.cached_at,
            e.read_progress, e.excerpt,
            (SELECT COUNT(*) FROM annotations a WHERE a.slug = b.slug) AS annotation_count
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

export async function getAllUncachedSlugs(scope: 'all' | 'sep' | 'owl' = 'all'): Promise<{ slug: string; title: string }[]> {
  const db = await getDb();
  const where = scope === 'all'
    ? 'cached_at IS NULL'
    : `cached_at IS NULL AND source = '${scope}'`;
  return db.getAllAsync<{ slug: string; title: string }>(
    `SELECT slug, title FROM entries WHERE ${where} ORDER BY title ASC`
  );
}

export async function getCachedSlugs(scope: 'all' | 'sep' | 'owl' = 'all'): Promise<{ slug: string; title: string }[]> {
  const db = await getDb();
  const where = scope === 'all'
    ? 'cached_at IS NOT NULL'
    : `cached_at IS NOT NULL AND source = '${scope}'`;
  return db.getAllAsync<{ slug: string; title: string }>(
    `SELECT slug, title FROM entries WHERE ${where} ORDER BY cached_at DESC`
  );
}

export async function getAllEntryTitles(): Promise<{ slug: string; title: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ slug: string; title: string }>(
    `SELECT slug, title FROM entries WHERE LENGTH(title) > 3 ORDER BY LENGTH(title) DESC`
  );
}

export async function getAllEntries(): Promise<{ slug: string; title: string; parent_label: string | null }[]> {
  const db = await getDb();
  return db.getAllAsync<{ slug: string; title: string; parent_label: string | null }>(
    `SELECT slug, title, parent_label FROM entries WHERE title IS NOT NULL ORDER BY title ASC`
  );
}

// Strip the old "Parent: " prefix from reads.title / bookmarks.title now that
// parent_label is a first-class column. Called after every index sync; the WHERE
// clause is a no-op once all titles are already clean.
export async function cleanDenormalizedTitles(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`
    UPDATE reads
    SET title = SUBSTR(title, (SELECT LENGTH(e.parent_label) + 3 FROM entries e WHERE e.slug = reads.slug))
    WHERE EXISTS (
      SELECT 1 FROM entries e
      WHERE e.slug = reads.slug
        AND e.parent_label IS NOT NULL
        AND reads.title LIKE (e.parent_label || ': %')
    )
  `);
  await db.runAsync(`
    UPDATE bookmarks
    SET title = SUBSTR(title, (SELECT LENGTH(e.parent_label) + 3 FROM entries e WHERE e.slug = bookmarks.slug))
    WHERE EXISTS (
      SELECT 1 FROM entries e
      WHERE e.slug = bookmarks.slug
        AND e.parent_label IS NOT NULL
        AND bookmarks.title LIKE (e.parent_label || ': %')
    )
  `);
}

// Link index: pre-built once at index-sync time, cached in meta.
// Module-level cache so we only hit the DB once per app session.
let _linkCache: string | null = null;

export async function getLinkPayload(): Promise<string> {
  if (_linkCache) return _linkCache;
  const stored = await getMeta('link_index_json');
  if (stored) { _linkCache = stored; return stored; }
  // Fall back to the bundled asset (available immediately on first launch, before any sync)
  const { LINK_MAP_JSON } = await import('../assets/linkMapData');
  _linkCache = LINK_MAP_JSON;
  return _linkCache;
}

export function invalidateLinkCache(): void {
  _linkCache = null;
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
  const slugs = [...targets];
  const placeholders = slugs.map(() => `(?, ?)`).join(', ');
  const params = slugs.flatMap(to => [fromSlug, to]);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM links WHERE from_slug = ?', [fromSlug]);
    await db.runAsync(
      `INSERT OR IGNORE INTO links (from_slug, to_slug) VALUES ${placeholders}`,
      params
    );
  });
}

export async function getLinksFrom(slug: string): Promise<EntrySummary[]> {
  const db = await getDb();
  return db.getAllAsync<EntrySummary>(
    `SELECT e.slug, e.title, e.parent_label, e.author, e.cached_at
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
    `SELECT e.slug, e.title, e.parent_label, e.author, e.cached_at
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

export interface AnnotationWithTitle extends Annotation {
  article_title: string | null;
}

export async function getAllAnnotations(): Promise<AnnotationWithTitle[]> {
  const db = await getDb();
  return db.getAllAsync<AnnotationWithTitle>(`
    SELECT a.*, e.title as article_title
    FROM annotations a
    LEFT JOIN entries e ON e.slug = a.slug
    ORDER BY a.created_at DESC
  `);
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
