import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  getEntryCount, getEntry, cacheArticle, searchEntries,
  saveAnnotation, getAnnotationsForSlug, deleteAnnotation,
  toggleBookmark, isBookmarked, getAllAnnotations,
  recordRead, getRecentSlugs, getMeta, setMeta,
  contentHash,
} from '../services/db';
import { fetchAndCacheArticle } from '../services/catalog';
import { buildArticleHtml } from '../utils/articleTemplate';

export interface TestResult {
  name: string;
  group: string;
  status: 'pending' | 'running' | 'pass' | 'fail';
  durationMs: number;
  error?: string;
}

export interface TestReport {
  timestamp: string;
  platform: string;
  summary: { passed: number; failed: number; total: number; durationMs: number };
  results: TestResult[];
  db_snapshot: {
    entry_count: number;
    annotation_count: number;
    recent_reads: { slug: string; title: string }[];
  };
}

type AssertFn = (condition: boolean, message: string) => void;

function makeAssert(errors: string[]): AssertFn {
  return (condition, message) => {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
  };
}

// ── Test definitions ──────────────────────────────────────────────────────────

const TEST_SLUG = '_nous_test_article_';

async function testDbInit(assert: AssertFn) {
  const count = await getEntryCount();
  assert(typeof count === 'number' && count >= 0, 'getEntryCount returns non-negative number');
}

async function testMeta(assert: AssertFn) {
  await setMeta('_test_key_', 'hello_nous');
  const val = await getMeta('_test_key_');
  assert(val === 'hello_nous', 'Meta read/write round-trips correctly');
  await setMeta('_test_key_', '');
}

async function testContentHash(assert: AssertFn) {
  const h1 = contentHash('hello nous');
  const h2 = contentHash('hello nous');
  const h3 = contentHash('different content');
  assert(h1 === h2, 'Hash is deterministic for same input');
  assert(h1 !== h3, 'Different content produces different hash');
  assert(typeof h1 === 'string' && h1.length > 0, 'Hash is a non-empty string');
  assert(h1.length === 8, `Hash is 8 hex chars (got ${h1.length})`);
}

async function testArticleCache(assert: AssertFn) {
  await cacheArticle(TEST_SLUG, {
    content_html: '<p>Test content for Nous.</p><h2 id="s1">Section 1</h2><p>More text.</p>',
    author: 'Test Author',
    pub_date: '2024',
    preamble_html: '<p>Published: 2024</p>',
    toc_html: '<li><a href="#s1">Section 1</a></li>',
    content_ast: null,
    has_math: 0,
  });
  const entry = await getEntry(TEST_SLUG);
  assert(entry !== null, 'Cached article is retrievable');
  assert(entry?.slug === TEST_SLUG, 'Slug matches');
  assert(entry?.title === 'Nous Test Article', 'Title matches');
  assert(entry?.content_html?.includes('Test content for Nous') ?? false, 'Content stored correctly');
  assert(entry?.preamble_html?.includes('Published') ?? false, 'Preamble stored');
  assert(entry?.toc_html?.includes('Section 1') ?? false, 'TOC stored');
}

async function testAnnotations(assert: AssertFn) {
  const hash = contentHash('<p>Test content for Nous.</p>');
  const ann1 = await saveAnnotation(TEST_SLUG, 'Test content for Nous', null, '#fbbf24', null, hash);
  assert(ann1.id > 0, `Annotation saved with ID ${ann1.id}`);
  assert(ann1.color === '#fbbf24', 'Annotation color stored');
  assert(ann1.content_hash === hash, 'Content hash stored with annotation');

  const ann2 = await saveAnnotation(TEST_SLUG, 'More text', 'context snippet', '#60a5fa', 'A test note', hash);
  assert(ann2.id > 0, 'Second annotation saved');
  assert(ann2.note === 'A test note', 'Note stored correctly');

  const anns = await getAnnotationsForSlug(TEST_SLUG);
  assert(anns.length >= 2, `getAnnotationsForSlug returns at least 2 (got ${anns.length})`);
  assert(anns.some(a => a.id === ann1.id), 'First annotation found by slug');
  assert(anns.some(a => a.id === ann2.id), 'Second annotation found by slug');

  const all = await getAllAnnotations();
  assert(all.some(a => a.id === ann1.id), 'getAllAnnotations includes test annotation');
  const withTitle = all.find(a => a.id === ann1.id);
  assert(withTitle?.article_title === 'Nous Test Article', 'getAllAnnotations joins article title');

  // Cleanup
  await deleteAnnotation(ann1.id);
  await deleteAnnotation(ann2.id);
  const after = await getAnnotationsForSlug(TEST_SLUG);
  assert(!after.some(a => a.id === ann1.id), 'Annotation deleted successfully');
}

async function testBookmarks(assert: AssertFn) {
  const before = await isBookmarked(TEST_SLUG);
  assert(!before, 'Test article not bookmarked initially');

  await toggleBookmark(TEST_SLUG, 'Nous Test Article');
  const after = await isBookmarked(TEST_SLUG);
  assert(after, 'Article bookmarked after toggle');

  await toggleBookmark(TEST_SLUG, 'Nous Test Article');
  const again = await isBookmarked(TEST_SLUG);
  assert(!again, 'Bookmark removed after second toggle');
}

async function testReadHistory(assert: AssertFn) {
  await recordRead(TEST_SLUG, 'Nous Test Article', null);
  const recent = await getRecentSlugs(10);
  assert(recent.some(r => r.slug === TEST_SLUG), 'Read recorded in history');
}

async function testSearch(assert: AssertFn) {
  // Index must have entries for search to work
  const count = await getEntryCount();
  if (count === 0) {
    throw new Error('Index is empty — run app first to populate index');
  }
  const results = await searchEntries('aristotle', 5);
  assert(results.length > 0, `Search for "aristotle" returns results (got ${results.length})`);
  assert(results[0].slug.length > 0, 'Results have non-empty slugs');
  assert(results[0].title.length > 0, 'Results have non-empty titles');
}

async function testHtmlTemplate(assert: AssertFn) {
  const html = buildArticleHtml({
    slug: TEST_SLUG,
    title: 'Nous Test Article',
    tocHtml: '<ul><li><a href="#s1">Section 1</a></li></ul>',
    contentHtml: '<p>Hello from Nous test.</p>',
    preambleHtml: '<p>Published: 2024</p>',
  });
  assert(typeof html === 'string' && html.length > 500, 'Template produces substantial HTML');
  assert(html.includes('Hello from Nous test'), 'Content injected into template');
  assert(html.includes('Nous Test Article'), 'Title injected into template');
  assert(html.includes('Section 1'), 'TOC injected into template');
  assert(!html.includes('undefined'), 'No undefined values in output');
  assert(!html.includes('null'), 'No null values in output');
  assert(html.startsWith('<!DOCTYPE html>'), 'Output starts with DOCTYPE');
}

async function testNetwork(assert: AssertFn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const resp = await fetch('https://plato.stanford.edu/', {
    method: 'HEAD',
    signal: controller.signal,
  });
  clearTimeout(timer);
  assert(resp.ok || resp.status === 405, `SEP reachable (HTTP ${resp.status})`);
}

async function testArticleFetch(assert: AssertFn) {
  const ok = await fetchAndCacheArticle('aristotle');
  assert(ok, 'fetchAndCacheArticle returns true for "aristotle"');
  const entry = await getEntry('aristotle');
  assert(entry !== null, 'Fetched article stored in DB');
  assert((entry?.content_html?.length ?? 0) > 5000, `Content is substantial (${entry?.content_html?.length} chars)`);
  assert(entry?.title === 'Aristotle', `Title is correct (got "${entry?.title}")`);
  assert(entry?.content_html?.includes('Aristotle') ?? false, 'Content mentions subject');
}

// ── Runner ────────────────────────────────────────────────────────────────────

const TESTS: Array<{ group: string; name: string; fn: (assert: AssertFn) => Promise<void> }> = [
  { group: 'Database',  name: 'DB initialization',       fn: testDbInit },
  { group: 'Database',  name: 'Meta read/write',          fn: testMeta },
  { group: 'Database',  name: 'Content hash',             fn: testContentHash },
  { group: 'Database',  name: 'Article cache round-trip', fn: testArticleCache },
  { group: 'Database',  name: 'Annotations CRUD',         fn: testAnnotations },
  { group: 'Database',  name: 'Bookmarks toggle',         fn: testBookmarks },
  { group: 'Database',  name: 'Read history',             fn: testReadHistory },
  { group: 'Search',    name: 'Full-text search',         fn: testSearch },
  { group: 'Rendering', name: 'HTML template',            fn: testHtmlTemplate },
  { group: 'Network',   name: 'SEP reachability',         fn: testNetwork },
  { group: 'Network',   name: 'Article fetch + cache',    fn: testArticleFetch },
];

export function getTestList(): TestResult[] {
  return TESTS.map(t => ({
    name: t.name,
    group: t.group,
    status: 'pending',
    durationMs: 0,
  }));
}

export async function runTests(
  onUpdate: (results: TestResult[]) => void
): Promise<TestReport> {
  const results: TestResult[] = getTestList();
  const startAll = Date.now();

  for (let i = 0; i < TESTS.length; i++) {
    results[i] = { ...results[i], status: 'running' };
    onUpdate([...results]);

    const t0 = Date.now();
    const errors: string[] = [];
    const assert = makeAssert(errors);
    try {
      await TESTS[i].fn(assert);
      results[i] = { ...results[i], status: 'pass', durationMs: Date.now() - t0 };
    } catch (e: any) {
      results[i] = {
        ...results[i],
        status: 'fail',
        durationMs: Date.now() - t0,
        error: e?.message ?? String(e),
      };
    }
    onUpdate([...results]);
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  // Build DB snapshot
  const [entryCount, allAnns, recent] = await Promise.all([
    getEntryCount(),
    getAllAnnotations(),
    getRecentSlugs(5),
  ]);

  const report: TestReport = {
    timestamp: new Date().toISOString(),
    platform: `${Platform.OS} ${Platform.Version}`,
    summary: { passed, failed, total: TESTS.length, durationMs: Date.now() - startAll },
    results,
    db_snapshot: {
      entry_count: entryCount,
      annotation_count: allAnns.length,
      recent_reads: recent.map(r => ({ slug: r.slug, title: r.title })),
    },
  };

  // Write report to document directory
  try {
    const file = new File(Paths.document, 'nous_test_report.json');
    file.write(JSON.stringify(report, null, 2));
  } catch {}

  // Signal completion to logcat for build script to detect
  console.log('[NOUS_TEST_COMPLETE]', JSON.stringify(report.summary));

  return report;
}
