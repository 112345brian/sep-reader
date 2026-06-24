/*
 * InPhO (Internet Philosophy Ontology) client — semantic graph layer.
 *
 * Data is fetched per-client at runtime from inphoproject.org (not bundled), so
 * there's no redistribution of the CC BY-NC-SA dataset — same model as how SEP
 * article content is fetched and cached on device.
 *
 * Flow:
 *   1. ensureInphoIndex() — one-off (refreshable) download of the idea + thinker
 *      lists into the inpho_nodes table. ~0.5 MB. Gives slug↔id maps.
 *   2. getSemanticGraph(slug) — resolve the entry's InPhO node, fetch its
 *      relations once (cached), and build a navigable graph of related ideas +
 *      related thinkers that exist in our corpus.
 */
import { getMeta, setMeta } from './db';
import {
  inphoIndexCount, replaceInphoIndex, getInphoNodeBySep,
  getCachedInphoRelations, cacheInphoRelations, buildSemanticGraph,
  buildInfluenceGraph, buildTimelineGraph, getThinkersMissingDates, setInphoDates,
  type InphoNodeRow, type GraphData, type GraphMode, type InphoRelations,
} from './graphDb';

const INPHO_BASE = 'https://www.inphoproject.org';
const HEADERS = { 'User-Agent': 'Nous/0.3 (SEP reader; +https://github.com/112345brian/sep-reader)' };
const INDEX_TTL_MS = 90 * 24 * 60 * 60 * 1000; // refresh index quarterly
const INDEX_SYNCED_KEY = 'inpho_index_synced_at';

// InPhO wraps list/detail payloads inconsistently; unwrap to the useful shape.
function unwrap<T = any>(raw: any): T {
  return raw?.responseData?.results ?? raw?.responseData ?? raw?.results ?? raw;
}

async function getJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${INPHO_BASE}${path}`, { headers: HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Download the idea + thinker lists and replace the local index. */
export async function syncInphoIndex(): Promise<boolean> {
  const [ideaRaw, thinkerRaw] = await Promise.all([
    getJson('/idea.json'),
    getJson('/thinker.json'),
  ]);
  if (!ideaRaw || !thinkerRaw) return false;

  const ideas = unwrap<any[]>(ideaRaw);
  const thinkers = unwrap<any[]>(thinkerRaw);
  if (!Array.isArray(ideas) || !Array.isArray(thinkers)) return false;

  const nodes: InphoNodeRow[] = [];
  for (const i of ideas) {
    if (typeof i?.ID !== 'number') continue;
    nodes.push({ id: i.ID, kind: 'idea', label: String(i.label ?? ''), sep_dir: i.sep_dir || null });
  }
  for (const t of thinkers) {
    if (typeof t?.ID !== 'number') continue;
    nodes.push({ id: t.ID, kind: 'thinker', label: String(t.label ?? ''), sep_dir: t.sep_dir || null });
  }
  if (nodes.length === 0) return false;

  await replaceInphoIndex(nodes);
  await setMeta(INDEX_SYNCED_KEY, String(Date.now()));
  return true;
}

/** Ensure the index exists and isn't stale. Safe to call before every graph open. */
export async function ensureInphoIndex(force = false): Promise<boolean> {
  const count = await inphoIndexCount();
  if (count > 0 && !force) {
    const synced = Number((await getMeta(INDEX_SYNCED_KEY)) ?? 0);
    if (Date.now() - synced < INDEX_TTL_MS) return true;
  }
  const ok = await syncInphoIndex();
  // If a refresh failed but we still have a usable index, keep using it.
  return ok || count > 0;
}

const num = (a: any): number[] => (Array.isArray(a) ? a.filter((x): x is number => typeof x === 'number') : []);

// InPhO encodes a date as [{ year, month, day }] (BCE = negative year).
function yearOf(field: any): number | null {
  const e = Array.isArray(field) ? field[0] : field;
  const y = e?.year;
  return typeof y === 'number' ? y : null;
}

/** Fetch + cache the related ids (and influence) for an entry from its detail record. */
async function fetchRelations(node: InphoNodeRow): Promise<InphoRelations> {
  const path = node.kind === 'idea' ? `/idea/${node.id}.json` : `/thinker/${node.id}.json`;
  const raw = await getJson(path);
  const d = raw ? unwrap<any>(raw) : null;
  // Ideas expose `related` (ideas) + `related_thinkers`; thinkers expose
  // `related_ideas` + `related_thinkers` + an influence network + dates.
  const ideas = node.kind === 'idea' ? num(d?.related) : num(d?.related_ideas);
  const thinkers = num(d?.related_thinkers);
  const rel: InphoRelations = { ideas, thinkers };
  if (node.kind === 'thinker' && d) {
    rel.influence = {
      teachers: num(d.teachers), students: num(d.students),
      influenced: num(d.influenced), influenced_by: num(d.influenced_by),
    };
    // Record the center thinker's own dates while we have the detail in hand.
    await setInphoDates(node.id, yearOf(d.birth), yearOf(d.death));
  }
  return rel;
}

/** Lazily fetch birth/death years for thinker nodes missing them (Timeline view). */
async function backfillDates(thinkerIds: number[]): Promise<void> {
  const missing = await getThinkersMissingDates(thinkerIds);
  // Cap concurrency to be polite; these are one-off per thinker and then cached.
  for (const node of missing) {
    const raw = await getJson(`/thinker/${node.id}.json`);
    const d = raw ? unwrap<any>(raw) : null;
    await setInphoDates(node.id, yearOf(d?.birth), yearOf(d?.death));
  }
}

async function getRelations(centerSlug: string, node: InphoNodeRow): Promise<InphoRelations> {
  let rel = await getCachedInphoRelations(centerSlug);
  if (!rel) {
    rel = await fetchRelations(node);
    await cacheInphoRelations(centerSlug, rel); // cache even when empty
  }
  return rel;
}

/**
 * Build the graph for an entry in the requested mode. Returns empty data if the
 * entry has no InPhO mapping or InPhO is unreachable on first use.
 *   - 'related'   : related ideas + related thinkers (relatedness neighbourhood)
 *   - 'influence' : directional teacher/student/influence DAG (thinkers)
 *   - 'timeline'  : related thinkers carrying birth/death years for chrono layout
 */
export async function getGraph(centerSlug: string, mode: GraphMode = 'related'): Promise<GraphData> {
  await ensureInphoIndex();
  const node = await getInphoNodeBySep(centerSlug);
  if (!node) return { nodes: [], edges: [] };

  const rel = await getRelations(centerSlug, node);

  if (mode === 'influence') {
    if (!rel.influence) return { nodes: [], edges: [] }; // idea-centered entries have no influence DAG
    return buildInfluenceGraph(centerSlug, rel.influence);
  }
  if (mode === 'timeline') {
    await backfillDates(rel.thinkers);
    return buildTimelineGraph(centerSlug, rel.thinkers);
  }
  return buildSemanticGraph(centerSlug, rel.ideas, rel.thinkers);
}

/** @deprecated use getGraph(slug, 'related') */
export const getSemanticGraph = (slug: string) => getGraph(slug, 'related');
