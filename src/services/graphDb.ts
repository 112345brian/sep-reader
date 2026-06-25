// Graph data layer — link graph + InPhO semantic graph.
//
// Decoupled from services/db.ts: this module owns the InPhO tables and creates
// them lazily the first time the graph feature is used, so the core reader DB
// stays unaware of the (optional) graph feature. It shares the single app DB
// connection via db.getDb(). The orchestration/fetch layer is services/inpho.ts.
//
// LICENSING: InPhO data is fetched per-client at runtime from inphoproject.org
// and cached locally — never bundled. See services/inpho.ts / NOTICE.md.

import type * as SQLite from 'expo-sqlite';
import { getDb } from './db';
import { getInfluenceWeight } from '../data/influenceWeights';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GraphNode {
  slug: string; title: string; read: boolean;
  readProgress?: number; // 0–1; ≥ 0.9 = fully read, > 0 = in progress, 0/absent = unvisited
  // 'entry' = the centred article; 'idea'/'thinker' = InPhO nodes;
  // 'linked' = a neighbouring entry in the SEP hyperlink graph.
  kind?: 'entry' | 'idea' | 'thinker' | 'linked';
  birthYear?: number | null; deathYear?: number | null; // Timeline view
}
export interface GraphEdge { from_slug: string; to_slug: string; weight?: number; }
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; }

export interface InphoNodeRow {
  id: number; kind: 'idea' | 'thinker'; label: string; sep_dir: string | null;
  birth_year?: number | null; death_year?: number | null;
}
export interface InphoInfluence { teachers: number[]; students: number[]; influenced: number[]; influenced_by: number[]; }
export interface InphoRelations { ideas: number[]; thinkers: number[]; influence?: InphoInfluence; }

// InPhO semantic-graph modes, served by services/inpho.ts getGraph().
export type GraphMode = 'related' | 'timeline' | 'influence';

// The full set of views the graph screen toggles between: the SEP hyperlink graph
// (getArticleLinkGraph, grounded in our own link index) plus the InPhO modes.
export type GraphView = 'links' | GraphMode;

// ── Schema (owned here, created on first use) ────────────────────────────────

let _schema: Promise<void> | null = null;

async function ensureGraphSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    -- InPhO semantic index (ideas + thinkers), synced per-client from
    -- inphoproject.org. sep_dir joins to entries.slug. See services/inpho.ts.
    CREATE TABLE IF NOT EXISTS inpho_nodes (
      id            INTEGER NOT NULL,
      kind          TEXT NOT NULL,        -- 'idea' | 'thinker'
      label         TEXT NOT NULL,
      sep_dir       TEXT,
      birth_year    INTEGER,              -- thinkers only; filled lazily (Timeline)
      death_year    INTEGER,
      dates_checked INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (kind, id)
    );
    CREATE INDEX IF NOT EXISTS idx_inpho_sep ON inpho_nodes(sep_dir);

    -- Per-entry resolved relations, cached after a one-off /idea|thinker/{id}
    -- fetch. payload = JSON { ideas, thinkers, influence? }.
    CREATE TABLE IF NOT EXISTS inpho_relations (
      slug       TEXT PRIMARY KEY,
      payload    TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    -- Settled force-layout positions, keyed by article+mode+node-set hash.
    -- positions = JSON [{slug, xRel, yRel}] where xRel/yRel are 0-1 fractions
    -- of canvas dimensions so the cache survives screen rotation / device changes.
    CREATE TABLE IF NOT EXISTS graph_layout_cache (
      center_slug  TEXT NOT NULL,
      mode         TEXT NOT NULL,
      layout_key   INTEGER NOT NULL,
      positions    TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      PRIMARY KEY (center_slug, mode)
    );
  `);
  // Upgrade indexes created before the date columns existed (idempotent).
  await Promise.all([
    db.runAsync('ALTER TABLE inpho_nodes ADD COLUMN birth_year INTEGER').catch(() => {}),
    db.runAsync('ALTER TABLE inpho_nodes ADD COLUMN death_year INTEGER').catch(() => {}),
    db.runAsync('ALTER TABLE inpho_nodes ADD COLUMN dates_checked INTEGER NOT NULL DEFAULT 0').catch(() => {}),
  ]);
}

// Shared DB handle with the InPhO schema guaranteed present.
async function gdb(): Promise<SQLite.SQLiteDatabase> {
  const db = await getDb();
  if (!_schema) _schema = ensureGraphSchema(db).catch(e => { _schema = null; throw e; });
  await _schema;
  return db;
}

// ── Link graph (from the core `links` table; no InPhO schema needed) ─────────

export async function getGraphData(): Promise<GraphData> {
  const db = await getDb();
  const edges = await db.getAllAsync<GraphEdge>(`
    SELECT DISTINCT l.from_slug, l.to_slug
    FROM links l
    WHERE EXISTS (SELECT 1 FROM reads r WHERE r.slug = l.from_slug)
    LIMIT 500
  `);
  if (edges.length === 0) return { nodes: [], edges: [] };

  const allSlugs = new Set<string>();
  for (const e of edges) { allSlugs.add(e.from_slug); allSlugs.add(e.to_slug); }

  const slugList = Array.from(allSlugs);
  const [readRows, entryRows] = await Promise.all([
    db.getAllAsync<{ slug: string }>('SELECT DISTINCT slug FROM reads'),
    db.getAllAsync<{ slug: string; title: string; read_progress: number }>(
      `SELECT slug, title, read_progress FROM entries WHERE slug IN (${slugList.map(() => '?').join(',')})`,
      slugList
    ),
  ]);
  const readSet = new Set(readRows.map(r => r.slug));
  const titleMap = new Map(entryRows.map(r => [r.slug, r.title]));
  const progressMap = new Map(entryRows.map(r => [r.slug, r.read_progress ?? 0]));

  return {
    nodes: slugList.map(slug => ({
      slug, title: titleMap.get(slug) ?? slug, read: readSet.has(slug),
      readProgress: progressMap.get(slug) ?? 0,
    })),
    edges,
  };
}

// Local link graph for a single article: center node + outgoing links + backlinks
export async function getArticleLinkGraph(centerSlug: string): Promise<GraphData> {
  const db = await getDb();

  const outgoing = await db.getAllAsync<GraphEdge>(
    `SELECT from_slug, to_slug FROM links WHERE from_slug = ? LIMIT 150`,
    [centerSlug]
  );
  const incoming = await db.getAllAsync<GraphEdge>(
    `SELECT from_slug, to_slug FROM links WHERE to_slug = ? LIMIT 50`,
    [centerSlug]
  );

  const edges = [...outgoing, ...incoming];
  if (edges.length === 0) return { nodes: [], edges: [] };

  const allSlugs = new Set<string>([centerSlug]);
  for (const e of edges) { allSlugs.add(e.from_slug); allSlugs.add(e.to_slug); }

  const slugList = Array.from(allSlugs);
  const [readRows, entryRows] = await Promise.all([
    db.getAllAsync<{ slug: string }>('SELECT DISTINCT slug FROM reads'),
    db.getAllAsync<{ slug: string; title: string; read_progress: number }>(
      `SELECT slug, title, read_progress FROM entries WHERE slug IN (${slugList.map(() => '?').join(',')})`,
      slugList
    ),
  ]);
  const readSet = new Set(readRows.map(r => r.slug));
  const titleMap = new Map(entryRows.map(r => [r.slug, r.title]));
  const progressMap = new Map(entryRows.map(r => [r.slug, r.read_progress ?? 0]));

  return {
    nodes: slugList.map(slug => ({
      slug, title: titleMap.get(slug) ?? slug, read: readSet.has(slug),
      readProgress: progressMap.get(slug) ?? 0,
      kind: (slug === centerSlug ? 'entry' : 'linked') as 'entry' | 'linked',
    })),
    edges,
  };
}

// ── InPhO index CRUD ─────────────────────────────────────────────────────────

export async function inphoIndexCount(): Promise<number> {
  const db = await gdb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM inpho_nodes');
  return row?.n ?? 0;
}

/** Backfill birth/death years for a thinker node once its detail is fetched.
 *  Sets dates_checked so a thinker with genuinely no recorded dates isn't refetched. */
export async function setInphoDates(id: number, birth: number | null, death: number | null): Promise<void> {
  const db = await gdb();
  await db.runAsync(
    "UPDATE inpho_nodes SET birth_year = ?, death_year = ?, dates_checked = 1 WHERE kind = 'thinker' AND id = ?",
    [birth, death, id]
  );
}

/** Thinker nodes (by id) whose dates haven't been fetched yet — drives lazy backfill.
 *  Result is sorted to match the caller's priority order (first id = highest priority). */
export async function getThinkersMissingDates(ids: number[]): Promise<InphoNodeRow[]> {
  if (ids.length === 0) return [];
  const db = await gdb();
  const rows = await db.getAllAsync<InphoNodeRow>(
    `SELECT id, kind, label, sep_dir, birth_year, death_year FROM inpho_nodes
     WHERE kind = 'thinker' AND dates_checked = 0 AND id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  // Preserve caller-supplied priority order (SQLite IN (...) returns in rowid order).
  const rank = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

/** Replace the whole InPhO index in one transaction.
 *  Lazily-backfilled birth/death years and dates_checked flags are preserved
 *  across resyncs so a quarterly refresh doesn't force a full date re-fetch. */
export async function replaceInphoIndex(nodes: InphoNodeRow[]): Promise<void> {
  const db = await gdb();
  await db.withTransactionAsync(async () => {
    // Snapshot dates already fetched so we can restore them after the wipe.
    const existing = await db.getAllAsync<{
      kind: string; id: number;
      birth_year: number | null; death_year: number | null; dates_checked: number;
    }>('SELECT kind, id, birth_year, death_year, dates_checked FROM inpho_nodes WHERE dates_checked = 1 OR birth_year IS NOT NULL OR death_year IS NOT NULL');
    const dateMap = new Map(existing.map(r => [`${r.kind}:${r.id}`, r]));

    await db.execAsync('DELETE FROM inpho_nodes');
    for (const n of nodes) {
      const prev = dateMap.get(`${n.kind}:${n.id}`);
      await db.runAsync(
        'INSERT INTO inpho_nodes (id, kind, label, sep_dir, birth_year, death_year, dates_checked) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [n.id, n.kind, n.label, n.sep_dir ?? null,
         prev?.birth_year ?? null, prev?.death_year ?? null, prev?.dates_checked ?? 0]
      );
    }
  });
}

/** The InPhO node for an SEP slug, preferring an idea over a thinker. */
export async function getInphoNodeBySep(slug: string): Promise<InphoNodeRow | null> {
  const db = await gdb();
  const row = await db.getFirstAsync<InphoNodeRow>(
    `SELECT id, kind, label, sep_dir, birth_year, death_year FROM inpho_nodes WHERE sep_dir = ?
     ORDER BY CASE kind WHEN 'idea' THEN 0 ELSE 1 END LIMIT 1`,
    [slug]
  );
  return row ?? null;
}

// Relations cache TTL: re-fetch after 7 days (InPhO updates monthly).
const RELATIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Return thinker IDs from already-cached InPhO relations for a list of slugs,
 *  in priority order (first slug's thinkers first), deduped. Skips slugs with
 *  no cache entry or stale cache — does not trigger any network fetch. */
export async function getCachedThinkerIdsForSlugs(slugs: string[]): Promise<number[]> {
  if (slugs.length === 0) return [];
  const db = await gdb();
  const placeholders = slugs.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ slug: string; payload: string; fetched_at: number }>(
    `SELECT slug, payload, fetched_at FROM inpho_relations WHERE slug IN (${placeholders})`,
    slugs
  );
  // Index by slug so we can emit in caller-supplied priority order.
  const bySlug = new Map(rows.map(r => [r.slug, r]));
  const now = Date.now();
  const seen = new Set<number>();
  const result: number[] = [];
  for (const slug of slugs) {
    const row = bySlug.get(slug);
    if (!row || now - row.fetched_at > RELATIONS_TTL_MS) continue;
    let rel: InphoRelations;
    try { rel = JSON.parse(row.payload); } catch { continue; }
    for (const id of rel.thinkers) {
      if (!seen.has(id)) { seen.add(id); result.push(id); }
    }
  }
  return result;
}

export async function getCachedInphoRelations(slug: string): Promise<InphoRelations | null> {
  const db = await gdb();
  const row = await db.getFirstAsync<{ payload: string; fetched_at: number }>(
    'SELECT payload, fetched_at FROM inpho_relations WHERE slug = ?', [slug]
  );
  if (!row) return null;
  if (Date.now() - row.fetched_at > RELATIONS_TTL_MS) return null;
  try { return JSON.parse(row.payload); } catch { return null; }
}

export async function cacheInphoRelations(slug: string, rel: InphoRelations): Promise<void> {
  const db = await gdb();
  await db.runAsync(
    'INSERT OR REPLACE INTO inpho_relations (slug, payload, fetched_at) VALUES (?, ?, ?)',
    [slug, JSON.stringify(rel), Date.now()]
  );
}

// ── Graph builders ───────────────────────────────────────────────────────────

/** Resolve a set of idea/thinker ids → nodes that map to an entry in our corpus. */
async function resolveCorpusNodes(
  ideaIds: number[], thinkerIds: number[], centerSlug: string,
): Promise<{ row: InphoNodeRow; title: string }[]> {
  const db = await gdb();
  if (ideaIds.length === 0 && thinkerIds.length === 0) return [];
  const ideaPlace = ideaIds.map(() => '?').join(',') || 'NULL';
  const thinkerPlace = thinkerIds.map(() => '?').join(',') || 'NULL';
  const rows = await db.getAllAsync<InphoNodeRow>(
    `SELECT id, kind, label, sep_dir, birth_year, death_year FROM inpho_nodes
     WHERE (kind = 'idea' AND id IN (${ideaPlace})) OR (kind = 'thinker' AND id IN (${thinkerPlace}))`,
    [...ideaIds, ...thinkerIds]
  );
  const related = rows.filter(r => r.sep_dir && r.sep_dir !== centerSlug);
  const slugs = [...new Set(related.map(r => r.sep_dir as string))];
  if (slugs.length === 0) return [];
  const inCorpus = await db.getAllAsync<{ slug: string; title: string }>(
    `SELECT slug, title FROM entries WHERE slug IN (${slugs.map(() => '?').join(',')})`,
    slugs
  );
  const titleMap = new Map(inCorpus.map(r => [r.slug, r.title]));
  // Dedupe by slug, preferring idea over thinker.
  const bySlug = new Map<string, InphoNodeRow>();
  for (const r of related) {
    const slug = r.sep_dir as string;
    if (!titleMap.has(slug)) continue;
    const existing = bySlug.get(slug);
    if (!existing || (existing.kind === 'thinker' && r.kind === 'idea')) bySlug.set(slug, r);
  }
  return [...bySlug.values()].map(r => ({ row: r, title: titleMap.get(r.sep_dir as string) as string }));
}

async function readSetAndTitle(centerSlug: string): Promise<{
  readSet: Set<string>; progressMap: Map<string, number>; centerTitle: string;
}> {
  const db = await gdb();
  const [readRows, progressRows, t] = await Promise.all([
    db.getAllAsync<{ slug: string }>('SELECT DISTINCT slug FROM reads'),
    db.getAllAsync<{ slug: string; read_progress: number }>(
      'SELECT slug, read_progress FROM entries WHERE read_progress > 0'
    ),
    db.getFirstAsync<{ title: string }>('SELECT title FROM entries WHERE slug = ?', [centerSlug]),
  ]);
  return {
    readSet: new Set(readRows.map(r => r.slug)),
    progressMap: new Map(progressRows.map(r => [r.slug, r.read_progress])),
    centerTitle: t?.title ?? centerSlug,
  };
}

/** Influence DAG: directional teacher/student/influence edges among thinkers. */
export async function buildInfluenceGraph(centerSlug: string, infl: InphoInfluence): Promise<GraphData> {
  const ids = [...new Set([...infl.teachers, ...infl.students, ...infl.influenced, ...infl.influenced_by])];
  const resolved = await resolveCorpusNodes([], ids, centerSlug);
  if (resolved.length === 0) return { nodes: [], edges: [] };
  const { readSet, progressMap, centerTitle } = await readSetAndTitle(centerSlug);
  const idToSlug = new Map(resolved.map(r => [r.row.id, r.row.sep_dir as string]));

  const nodes: GraphNode[] = [
    { slug: centerSlug, title: centerTitle, read: readSet.has(centerSlug), readProgress: progressMap.get(centerSlug) ?? 0, kind: 'entry' },
    ...resolved.map(r => {
      const s = r.row.sep_dir as string;
      return { slug: s, title: r.title, read: readSet.has(s), readProgress: progressMap.get(s) ?? 0, kind: 'thinker' as const };
    }),
  ];

  // Edge direction = influence flow (earlier → later). Teachers/influenced_by point INTO center.
  // Base weights: direct pedagogical links (teacher/student) outweigh general influence.
  // Wikidata weights multiply on top when available.
  const edges: GraphEdge[] = [];
  const teacherSet = new Set(infl.teachers);
  const studentSet = new Set(infl.students);
  const add = (from: string, to: string, base: number) => {
    if (!from || !to || from === to) return;
    const w = base * getInfluenceWeight(from, to);
    edges.push({ from_slug: from, to_slug: to, weight: w });
  };
  for (const id of [...infl.teachers, ...infl.influenced_by]) {
    const s = idToSlug.get(id);
    if (s) add(s, centerSlug, teacherSet.has(id) ? 3.0 : 1.5);
  }
  for (const id of [...infl.students, ...infl.influenced]) {
    const s = idToSlug.get(id);
    if (s) add(centerSlug, s, studentSet.has(id) ? 3.0 : 1.5);
  }
  return { nodes, edges };
}

/** Timeline: center + related thinkers, carrying birth/death years for chrono layout. */
export async function buildTimelineGraph(centerSlug: string, thinkerIds: number[]): Promise<GraphData> {
  const resolved = await resolveCorpusNodes([], thinkerIds, centerSlug);
  if (resolved.length === 0) return { nodes: [], edges: [] };
  const db = await gdb();
  const { readSet, progressMap, centerTitle } = await readSetAndTitle(centerSlug);
  // Look up the center entry's own dates — if it's a thinker, it belongs on the timeline too.
  const centerDates = await db.getFirstAsync<{ birth_year: number | null; death_year: number | null }>(
    `SELECT birth_year, death_year FROM inpho_nodes WHERE sep_dir = ? AND kind = 'thinker' LIMIT 1`,
    [centerSlug]
  );
  const nodes: GraphNode[] = [
    {
      slug: centerSlug, title: centerTitle, read: readSet.has(centerSlug),
      readProgress: progressMap.get(centerSlug) ?? 0, kind: 'entry',
      birthYear: centerDates?.birth_year ?? null, deathYear: centerDates?.death_year ?? null,
    },
    ...resolved.map(r => {
      const s = r.row.sep_dir as string;
      return {
        slug: s, title: r.title, read: readSet.has(s), readProgress: progressMap.get(s) ?? 0,
        kind: 'thinker' as const, birthYear: r.row.birth_year ?? null, deathYear: r.row.death_year ?? null,
      };
    }),
  ];
  const edges: GraphEdge[] = resolved.map(r => ({ from_slug: centerSlug, to_slug: r.row.sep_dir as string }));
  return { nodes, edges };
}

/**
 * Build a graph centered on `centerSlug` from resolved InPhO relation ids.
 * Only nodes whose sep_dir is a real entry in our corpus become graph nodes, so
 * every node is navigable. Idea/thinker kind is carried for colour-coding.
 */
export async function buildSemanticGraph(
  centerSlug: string,
  ideaIds: number[],
  thinkerIds: number[],
): Promise<GraphData> {
  const resolved = await resolveCorpusNodes(ideaIds, thinkerIds, centerSlug);
  if (resolved.length === 0) return { nodes: [], edges: [] };
  const { readSet, progressMap, centerTitle } = await readSetAndTitle(centerSlug);
  const nodes: GraphNode[] = [
    { slug: centerSlug, title: centerTitle, read: readSet.has(centerSlug), readProgress: progressMap.get(centerSlug) ?? 0, kind: 'entry' },
    ...resolved.map(r => {
      const s = r.row.sep_dir as string;
      return { slug: s, title: r.title, read: readSet.has(s), readProgress: progressMap.get(s) ?? 0, kind: r.row.kind };
    }),
  ];
  const edges: GraphEdge[] = resolved.map(r => ({ from_slug: centerSlug, to_slug: r.row.sep_dir as string }));
  return { nodes, edges };
}

// ── Layout cache ──────────────────────────────────────────────────────────────

export interface CachedPosition { slug: string; xRel: number; yRel: number; }

// FNV-1a over sorted node slugs — cheap, good enough for cache invalidation.
function layoutKey(nodeSlugs: string[]): number {
  const s = [...nodeSlugs].sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h;
}

export async function getLayoutCache(
  centerSlug: string, mode: string, nodeSlugs: string[],
): Promise<CachedPosition[] | null> {
  const db = await gdb();
  const key = layoutKey(nodeSlugs);
  const row = await db.getFirstAsync<{ layout_key: number; positions: string }>(
    'SELECT layout_key, positions FROM graph_layout_cache WHERE center_slug = ? AND mode = ?',
    [centerSlug, mode]
  );
  if (!row || row.layout_key !== key) return null;
  try { return JSON.parse(row.positions) as CachedPosition[]; } catch { return null; }
}

export async function setLayoutCache(
  centerSlug: string, mode: string, nodeSlugs: string[], positions: CachedPosition[],
): Promise<void> {
  const db = await gdb();
  const key = layoutKey(nodeSlugs);
  await db.runAsync(
    `INSERT OR REPLACE INTO graph_layout_cache (center_slug, mode, layout_key, positions, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [centerSlug, mode, key, JSON.stringify(positions), Date.now()]
  );
}
