# Changelog

## [Unreleased]

### Added
- **Images in native renderer** — `case 'image'` blocks now render via RN `<Image>` with relative srcs resolved against `https://plato.stanford.edu/entries/{slug}/`. Previously all article figures were silently dropped.
- **Annotation display in native renderer** — existing highlights appear as a colored left border on their paragraph; tapping opens the edit modal. Long-pressing any paragraph opens the annotation creation modal with the paragraph text pre-filled.
- **`collectMathNodes`** (`mathStore.ts`) — walks a `ParsedArticle` block tree to collect all TeX nodes; used by `hydrateMath` to warm the SVG cache before render.

### Changed
- **`has_math` flag on cached articles** — detected at cache time (string scan for `\(` / `\[`); ~76% of articles have no math and now skip the AST walk and SQLite warm-up on every open.
- **Native renderer enabled** — `USE_NATIVE_RENDERER = true`; article bodies now render via the custom native parser/renderer instead of WebView. `recordRead` is fire-and-forget (removes 2 SQLite round-trips from the navigation critical path); `getMeta` results are cached in memory (custom CSS and font size no longer re-queried on every article open); `buildArticleHtml` skipped in native mode.
- **TOC jump wired for native** — `SepArticle` now exposes a `scrollToSection(id)` imperative handle via `forwardRef`; `handleTocJump` uses it instead of WebView JS injection.
- **`resolveMath` wired** — native renderer uses the real on-device TeX→SVG resolver (`mathStore.resolveMath`) with SQLite-backed session cache; previous stub returned `null` for all math.

### Fixed
- **Swipe-right to go back** — gesture now reliably navigates back. Disabled the native stack's competing iOS back-swipe gesture (`gestureEnabled: false` on Article screen) and loosened the trigger condition so a moderate drag (60 px) or fast flick (300 px/s) commits, rather than requiring both simultaneously.
- **Cross-article links opening Safari** — the WebView `baseUrl` was set to `https://plato.stanford.edu` (root), so relative links in cached article HTML (e.g. `../other-article/`) resolved to `/other-article/` instead of `/entries/other-article/`. They missed the intercept regex and fell through to `Linking.openURL`. Fixed by setting `baseUrl` to `https://plato.stanford.edu/entries/<slug>/`, matching the original page location.

## [0.4.1] — 2026-06-23

### Fixed
- **Article loading spinner on cached articles** — article now renders immediately after the DB read; backlink count loads in the background and injects via JS.
- **10-second input lag** — `indexLinks` was issuing 100–200 sequential SQLite bridge calls per article open, flooding the JS event queue. Now a single batch INSERT.
- **Missing index on `links.to_slug`** — `getLinksTo` was doing a full table scan; added `idx_links_to_slug`.

## [0.4.0] — 2026-06-23

### Added
- **Sub-entry parent breadcrumb** — entries that belong to a parent group (e.g. "Nietzsche's Aesthetics" under "aesthetics") now show the parent label as a small blue tag above the article title and in list rows (search results, history, bookmarks, links). The tag uses the same pill style as the article breadcrumb. Standalone entries (e.g. "Anarchism") are unaffected.
- `parent_label` column in the `entries` table — stored explicitly at index-sync time so the parent relationship is a first-class field, not inferred from colon-splitting titles. Browse grouping and article display both use it; a colon-parse fallback handles entries cached before the migration.
- `cleanDenormalizedTitles()` — runs after every index sync to strip the legacy `"Parent: "` prefix from any `reads` and `bookmarks` rows whose titles were written in the old format.
- **Library scope selector** — onboarding and Settings › Library now offer an "All / Stanford Encyclopedia / The OWL" chip toggle so users can target which encyclopedias to include. Persisted as `pref_library_scope` in SQLite meta. Scope is respected by both the initial bulk download and the "Download all articles" button in Settings.
- **`source` column on `entries`** — DB migration adds `source TEXT NOT NULL DEFAULT 'sep'`; `getAllUncachedSlugs` and `getCachedSlugs` accept an optional scope filter so download queries can be narrowed by source without full-table scans.

### Changed
- **Onboarding default flipped** — "Download everything now" is now the pre-selected option (was "As I read") and carries the "Recommended" badge. Download description updates dynamically to reflect the selected scope (e.g. "~1,800 Stanford Encyclopedia articles (~400 MB)" vs. "SEP + OWL ontology").
- Welcome screen copy updated from "Stanford Encyclopedia of Philosophy" to "Philosophy Reference" ahead of multi-source support.

### Fixed
- `expo-file-system` `documentDirectory` import — the property was removed from the top-level export in the current SDK version; import now comes from `expo-file-system/legacy`. Resolved the lone TypeScript error in `inpho.ts`.

### Added — native renderer foundation (not yet wired into the UI)
- **Custom SEP HTML parser** (`src/utils/sepHtml/`) — tokenizes stored article HTML into a typed AST (`parse.ts` + `types.ts`) via `htmlparser2`, ahead of replacing the WebView with native React Native rendering. Handles SEP's full tag set: headings (with section ids), paragraphs, lists, definition lists, blockquotes, captioned tables, `.wl` cross-reference links, footnote refs, and inline/deprecated formatting. Nested tables flagged `unsupported` for a scoped WebView fallback. 9 unit tests.
- **Inline TeX math tokenization** — splits `\(…\)` (inline) and `\[…\]` (display) out of text into `math` AST nodes. A full-corpus audit found 450 articles (~24%) use TeX (122,263 equations, zero MathML) — something a tag census alone would miss.
- **Build-time math pre-render pipeline** — `scripts/renderMath.cjs` (MathJax-in-Node, `mathjax-full`) renders each unique equation to a self-contained SVG (`fill="currentColor"`, drawn natively by the existing `react-native-svg`); `scripts/buildMathSvg.cjs` dedups by content hash (3.1×). Whole-encyclopedia math = **21.3 MB gzipped**, built in ~32 s, so no math engine ships on device.
- **Corpus audit tooling** — `scripts/auditCorpus.cjs` (sharded fetch + cache-only parse modes) validates the parser against all 1,838 articles: **0 parse exceptions**, 0 untokenized math delimiters.
- **Native block renderer** (`src/utils/sepHtml/render/`) — `SepArticle`/`Blocks`/`Inline`/`MathSvg` render the AST as native RN components matching the reader typography: scroll-progress + scroll-spy via `onScroll`/`onLayout`, a fast single-`<Text>` path for non-math paragraphs and a word-tokenized flex-wrap path for inline math, display math as centered SVG blocks, and `react-native-svg` drawing the build-time equations. Typecheck-clean; not yet wired into `ArticleScreen` (pending on-device verification).

### Changed
- `htmlparser2` pinned to `^9.1.0` (dual CJS/ESM) for clean Metro/Jest resolution; v12 is ESM-only.

## [0.3.1] — 2026-06-23

### Added
- **GPL-3.0 license** (`LICENSE`) for the project's own source code.
- **`NOTICE.md`** — states non-affiliation with Stanford / the Metaphysics Research Lab, records that SEP article content is fetched on-device at runtime and never bundled or redistributed, and documents the "fetch, don't bundle" design constraint.
- **README "Licensing & content" section** — frames the app as an independent (unaffiliated, not adversarial) reader that points users back to the SEP, and pins the no-bundled-content rule.
- **CI guard** (`.github/workflows/no-bundled-content.yml` + `scripts/check-no-bundled-content.js`) — fails the build if a tracked `.db`/`.sqlite` file or an oversized non-allowlisted asset (potential SEP article content) could ship.

### Fixed
- Corrected README/feature copy that described the injected reading styles as "SEP CSS"; the reader CSS is our own purpose-built stylesheet, not Stanford's.

## [0.3.0] — 2026-06-23

### Added
- **Footnote tap → native bottom sheet** — tapping a footnote superscript now shows the citation text in a native bottom-sheet overlay instead of navigating or doing nothing. The previous handler used `mouseover` + `canShowHoverPreview()`, which always returns false on touch devices.
- Footnote reference numbers stripped of `[]` brackets (`[1]` → `1`); tap target enlarged with minimum 20×22pt hit area
- **Browse: collapsible sub-entry groups** — entries with a parent label (e.g. "Descartes, René: epistemology") are now grouped under an expandable parent row with a chevron. Collapsed view shows 1,275 rows instead of 1,838 flat entries. 19 redirect entries ("Averroes — see Ibn Rushd") filtered out.
- `scripts/buildEntrySeed.js` — permanent seed generator with full HTML entity decoding; replaces the previous one-off script that was dropping accented characters (`Descartes, Ren` → `Descartes, René`, `Gdel` → `Gödel`, etc.)

### Fixed
- **TOC gesture took 10+ seconds to open** — `indexLinks` was the 4th item in a `Promise.all` inside `ArticleScreen.load()`, blocking `setState` until the full link-indexing DB transaction finished. Moved to fire-and-forget; article now renders as soon as CSS and backlinks resolve.
- Intro section (`#preamble`) rendered at `0.88rem` — smaller than body text. Now inherits body font size.
- `fetchEntryList` in `catalog.ts` still used the old simple regex; updated with two-pass parent-group parsing and full entity decoding to match the seed generator.

### Changed
- **Typography overhaul:**
  - Font size: 16px → 17px
  - Side padding: 18px desktop / 16px mobile → 20px unified
  - Paragraph spacing: `margin-bottom: 1.1em` → `1.6em` (nearly doubles the breathing room between paragraphs)
  - Line height: 1.78 → 1.80
  - `h2` font size: 1.125rem → 1.3rem; bottom margin increased
  - `h3` font size: 0.9375rem → 1.05rem (was smaller than body text — confusing hierarchy)
  - List item spacing: 0.2em → 0.35em; list bottom margin matches paragraph spacing
  - Blockquote margin increased proportionally

## [0.2.0] — 2026-06-22

### Changed
- **Blind-design UI overhaul** — new dark theme throughout:
  - Home: "Nous" wordmark, pill search bar, BOOKMARKS / CONTINUE READING sections, bottom nav (Home · Search · Notes)
  - Article: minimal 3-button app bar (back · search · overflow), native article header with "STANFORD ENCYCLOPEDIA" label, title, author/year, and annotation count chip
  - TOC: bottom-sheet triggered by a pill handle; Contents tab for section jumps, Annotations tab with color-coded cards
  - Annotation modal: color-picker dots, colored save button, delete button
  - Highlights screen: color-coded left-border cards
- Reading font size increased from 17 px to 20 px

### Fixed
- `catalog.ts` entry-list regex was matching nothing — SEP's `contents.html` uses relative hrefs (`entries/foo/`) and wraps titles in `<strong>`. Now correctly finds all 1,837 entries.
- Annotation tap-to-edit: switched from element-level touch events to `document.touchend` + `elementsFromPoint` for reliable `<mark>` detection on Android WebView
- FTS search: migrated content table to standalone FTS5 with backfill on startup
- WebView crash on Android New Architecture (Fabric)
- Companion JS reader bar removed via DOM at runtime so it doesn't conflict with the native header
- `LogBox.ignoreAllLogs()` suppresses the dev-mode warning banner that was covering the TOC handle

### Added
- `scripts/test-download.mjs` — standalone Node script to verify the SEP download pipeline without running the app

## [0.1.0] — 2026-06-22

### Added
- First-launch onboarding: library mode (lazy vs. download-all) and home screen preference (search vs. continue reading)
- Journey / History screen: reading sessions visualized as collapsible branching trees, with `from_slug` tracking to show how articles were reached
- Bookmarks: star any article; bookmarked articles appear at the top of the home screen
- Share button on articles (copies SEP URL via native share sheet)
- Refresh button on articles (force re-fetches from SEP)
- Settings screen: change home preference, view cache stats, clear article cache
- Error screen when SEP is unreachable on first launch
- External links in articles now open in the system browser instead of being silently blocked
- Background bulk-download with a 2px progress bar (for users who chose download-all in onboarding)

### Fixed
- `downloadAll` was using dynamic imports that would fail at runtime — converted to static imports
- Font fallback: Source Serif 4 now falls back to Georgia/Times New Roman if Google Fonts is unavailable
- App display name changed from "SepReader" to "SEP"

## [0.0.1] — 2026-06-21

### Added
- React Native 0.81.6 bare project with react-native-macos 0.81.7
- Wikipedia-style article fetching and SQLite caching (expo-sqlite v16, FTS5, WAL)
- Home screen with search, recent reads, and cached-article indicator
- Article screen with WebView renderer, injected SEP CSS and companion JS
- Session-based reading history with tree structure
- EAS Build config for Android APK (preview + production profiles)
