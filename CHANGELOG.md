# Changelog

## [0.6.8]

### Added
- **Tap a graph node to preview it** — tapping any node now opens a peek card with the entry's title, author, the sentence that links to it, and a generous excerpt; "Open article →" navigates. Taps previously did nothing because the `GestureDetector` swallowed the SVG `onPress`; the tap is now mapped back into graph space and resolved to the nearest node.
- **Link previews in the reader** — tapping an in-text cross-reference to another entry shows the same peek card (author + scrollable excerpt) before navigating, rather than jumping straight there. Toggleable via **Settings → Reading → "Preview links before opening"** (default on); turning it off restores instant navigation.
- **Fit-to-view** — the graph frames every node on open (and after rotation) so nothing starts off-screen; double-tap resets to that framing.

### Changed
- **All node labels are shown** — every node is labelled at any zoom above the minimum, not just visited/center nodes.
- **Legible labels** — node labels get a dark halo (a stroked copy drawn underneath, since react-native-svg ignores `paint-order`) so they stay readable over edges and neighbouring labels.
- **Richer preview content** — the preview excerpt is pulled on-the-fly from the cached article body (much longer than the stored teaser) and the card body scrolls. Newly cached excerpts are also longer (320 vs 160 chars).
- **Zoom-out is capped at the fit view** — the graph can't be shrunk below "everything visible"; at the fit scale it is centred and locked, and once zoomed in any node can be panned all the way to mid-screen so edge nodes and their labels stay reachable.
- **The legend fades out as you zoom in** so it stops covering nodes, and it no longer intercepts node taps (`pointerEvents="none"`).

### Fixed
- **Pinch-zoom flung the graph off-screen** — React Native scales about the view centre by default, but the pinch focal math assumed a top-left origin, so zooming away from 1× drifted the content; this was compounded by the gesture being rebuilt mid-pinch whenever a label-visibility re-render fired. Fixed by setting `transformOrigin: 'left top'` (matching the focal math and the tap hit-test), memoising the gesture so a re-render can't disrupt it mid-pinch, and clamping pan/zoom so the graph can never leave the viewport.
- **Footnote markers showed brackets** — SEP wraps footnote refs as `<sup>[<a href="notes.html#note-1">1</a>]</sup>`, with the `[` `]` as sibling text nodes and an anchor whose href doesn't start with `#`. The parser's footnote detection only matched `^#`, so these fell through to generic `<sup>` rendering and kept the literal brackets. Detection now matches `notes.html#note-N` / `#note-N` (wrapped or bare), drops the bracket siblings, and renders just the number — wired to the footnote sheet.

## [0.6.7]

### Changed
- **Graph blocks until layout is ready** — on a cache miss the graph no longer shows intermediate settling frames. Instead it holds the loading screen (spinner + "Computing layout… Graph is still loading — keep reading for now") until the layout finishes and is written to cache. Cache hits (most opens after the first) are still instant.
- **MathJax moved out of the JS bundle** — the 2.9 MB MathJax engine is now a Metro asset (`src/assets/mathjax-full.b64`) instead of a parsed JavaScript module, eliminating its parse overhead from every cold start. In full-library mode (`downloadAll`) it is preloaded at boot; otherwise it loads lazily on first math render request.

## [0.6.6]

### Added
- **Graph layout cache** — settled force-layout positions are stored in a new `graph_layout_cache` SQLite table (keyed by article + mode + FNV-1a hash of the node-slug set). On second open the graph is instant; positions are stored as relative (xRel, yRel) fractions so they survive screen rotation and device changes.
- **Background graph precomputation** — `primeGraphLayouts(slugs)` runs fire-and-forget from `ArticleScreen` (alongside `primeBackfillForSlugs`) after the navigation animation completes. Precomputes and caches layouts for the current article and recent history using only already-cached InPhO data (no new network requests). Includes timeline when all thinker birth/death dates are already in the DB. Session-level dedup via an in-memory Set prevents re-queuing already-processed slugs.
- **Visited node filter** — in all graph views, nodes you haven't opened yet render smaller (r = 4 vs. 6–7) and grey. A "Visited" toggle in the graph header switches to a visited-only layout that hides unvisited nodes entirely. Preference persists across sessions via `getMeta`/`setMeta`.
- **Influence edge weights** — `GraphEdge` now carries an optional `weight` that scales the force-layout spring. `buildInfluenceGraph` assigns base weights by InPhO category (teachers/students = 3.0, influenced/influenced\_by = 1.5) multiplied by Wikidata-derived pair weights. `scripts/build-influence-weights.js` queries the Wikidata SPARQL endpoint (P737 influenced\_by, P1066 student\_of, P802 has\_student, resolved via P4223 SEP identifier) and writes `src/data/influenceWeights.ts`; run it once to populate.

### Changed
- **Graph node colors reflect read status** — visited nodes are now colored by how far you've read rather than by InPhO kind. Green (≥ 90% read) / blue (opened, in progress) / grey (never opened). The center node stays bright blue. Legend updated to match; timeline labels for unvisited thinkers are still shown.
- **`forceLayout` is now a progressive generator** — yields the initial random scatter immediately (all nodes appear on screen at once), then yields a frame every 8 iterations via `setTimeout(0)` between chunks. The JS thread is never blocked; the layout visibly settles rather than freezing for minutes on large influence graphs.
- **Force layout O(n²) repulsion hot path** — replaced `Math.sqrt` + two divisions with `k²/dist²` (mathematically equivalent, avoids the sqrt entirely on the pair loop). Iteration count now scales as `max(25, min(80, 900/√n))` so total work stays roughly constant regardless of graph size.
- **`forceLayout` extracted to `src/utils/forceLayout.ts`** — shared between `GraphScreen` and the background precompute path.

### Fixed
- **Graph spinner hangs on mode/article switch** — when switching graph mode or navigating to a new article, `displayData` momentarily becomes empty while `rawData` resets. The layout effect now guards on `displayData.nodes.length > 0` so it doesn't fire (and leave the loading spinner stuck) against an empty node set.
- **Timeline labels hidden for unvisited thinkers** — the "unvisited nodes are never labelled" guard fired before the timeline-mode exemption, silently suppressing labels for thinkers you haven't yet opened in Timeline view.
- **Settings back chevron unresponsive** — the entire screen including the header was wrapped in a `GestureDetector`. On Android New Architecture (Fabric), the Pan gesture stays in "waiting" state during quick taps and blocks `TouchableOpacity.onPress`. Moved the header outside the `GestureDetector`.
- **Settings slow to load** — `loadCounts()` was calling `getAllUncachedSlugs()`, fetching all 1838 rows with slug + title just to count them. Replaced with `getEntryCounts()`: a single `SELECT COUNT(*) AS total, COUNT(cached_at) AS cached FROM entries` query.

## [0.6.5]

### Fixed
- **App crashed immediately on first launch (release build)** — the loading screen's FlatList used `Animated.event` with `useNativeDriver: true` on its `onScroll` prop but was a plain `FlatList`, not `Animated.FlatList`. The New Architecture enforces this as a hard crash in release builds; debug builds swallowed it as a warning. Changed to `Animated.FlatList`.

## [0.6.4]

### Fixed
- **Phase snapped from ready to error after boot** — if `getRecentSlugs` (continue mode) or the auto-sync `getMeta` calls threw after `setPhase('ready')`, `boot().catch` would fire and revert the phase to `index_error` while the user was already looking at the home screen. Both operations now run fire-and-forget after the phase transition.
- **Onboarding stuck on indexing spinner** — if `initialize()` threw during the onboarding flow (network down after seed import, DB error), the unhandled rejection left the app stuck on the indexing spinner with no way to recover. `handleOnboardingDone` now wraps `initialize()` in try/catch and transitions to `index_error` on failure.
- **Raw TeX after library clear and re-download** — `clearArticleCache` didn't remove the `math_inline_v2` meta key, so `backfillMathInline` was a no-op on the next launch's re-download (it sees the flag and returns). Articles cached with `skipMath:true` would store raw TeX permanently. The cache clear now deletes the backfill flags so they re-run against the fresh downloads.
- **backfillAst ran up to three times concurrently on cold upgrade boot** — `backfillMathInline` and `backfillMathHashFormat` each fired an unsupervised `backfillAst()` tail-call on completion, racing with the direct `await backfillAst()` in App.tsx. Removed the internal tail-calls; App.tsx's await is now the single entry point.
- **Priority article pre-fetch ignored library scope** — if the user switched to SEP-only mode but their most-recently-read article was OWL content, the priority fetch would network-fetch and display that OWL article on the loading screen. Now checks `entries.source` and falls back to the default article when the scope doesn't match.
- **Block items re-rendered on every download progress tick** — `renderItem` closed over `downloadProgress` and `phase`, so FlatList replaced the callback on every progress event and re-rendered all visible article blocks. Phase/progress/article are now held in refs; `renderItem` deps are reduced to the stable `h` object; `BlockItem` is wrapped in `React.memo` with stable props; `extraData` drives bar updates.

## [0.6.3]

### Added
- **Readable article during initialization** — on first launch with bulk download enabled, the Neoplatonism article is fetched in the background as soon as initialization begins. Once ready, a bouncing arrow and the article title appear at the bottom of the loading screen; swiping up reveals the article below a sticky loading bar so you can read while the library downloads.
- **Download progress notification** — during bulk library download, a system notification shows the current count ("847 / 1800 articles") in the notification shade, visible from other apps. Throttled to update at most once every 4 seconds or 25 articles. Auto-dismisses 8 seconds after the download completes. Requires notification permission (requested once at download start).
- **Credits and Support in Settings** — a Credits section lists the Stanford Encyclopedia of Philosophy and InPhO (Indiana University) as suggested sources with links to their homepages. A Support section links to the SEP donation page and Ko-fi.

### Changed
- **Renamed to Nous** — repo, Android package (`com.nous.app`), and README updated. App name in `app.json` and `package.json` was already Nous.

### Fixed
- **Bulk download showed "0 / N" on resume** — if the app was killed mid-download and relaunched, the progress counter reset to zero even though already-cached articles were correctly skipped. The counter now starts at the cached count ("900 / 1800") so it's clear work wasn't lost.
- **Download complete notification stacked on iOS** — after bulk download finished, the "Library ready" notification appeared alongside the last progress notification instead of replacing it. Now dismisses the progress notification first, matching the update behavior.
- **"0 articles downloaded" on fully-cached launches** — the download-complete notification showed "0 articles downloaded" if the library was already fully cached (nothing left to fetch). Now always reports the true library size.
- **Priority article re-fetched on every launch** — the Neoplatonism article was hitting the network unconditionally at startup even if already cached. Now checks the local cache first and only fetches if the content is absent. Also skipped entirely for OWL-only libraries.
- **Loading screen re-rendered all cells on every progress tick** — `renderItem` and `listHeader` were recreated on each render, causing FlatList to remount the header and re-render all visible blocks whenever the download counter ticked up.

## [0.6.2]

### Fixed
- **Alphabet scrubber jump didn't scroll for most letters** — on the Browse tab, tapping or dragging the A–Z scrubber only jumped for letters near the top; everything below silently stayed put. Two causes: (1) the drag expanded every letter it passed over, ballooning the target section's row index out of reach, and (2) `SectionList` has no `getItemLayout`, so `scrollToLocation` to an unmeasured section failed — and failure doesn't advance the list, so retrying alone was futile. The scrubber no longer expands sections while jumping, and `onScrollToIndexFailed` now seeks approximately via `averageItemLength × index` before retrying `scrollToLocation` to land precisely (bounded to 12 tries). Verified on device.

## [0.6.1]

### Added
- **Lazy-loaded browse sections** — each letter group in Browse now renders only its first 15 entries up front, expanding to the full list when you scroll its last visible row into view. Cuts the initial Browse mount from ~1,800 rows to a few hundred.

### Changed
- **Alphabet scrubber migrated to RNGH** — the A–Z scrubber now uses `react-native-gesture-handler`'s `Gesture.Pan` instead of the legacy `PanResponder`, fixing dropped touches and aligning it with the rest of the app's gesture handling.

### Fixed
- **TOC sheet close-animation race** — `closeToc`'s spring callback now checks `finished` before hiding the sheet, so starting a new swipe-up while the close animation is running (which calls `stopAnimation()`) no longer collapses the sheet mid-open.
- **Duplicated sheet-height constant** — `TOC_SHEET_H` is now exported from `TocSheet` and imported by `ArticleScreen` instead of being redefined as a bare `350` in two places.

## [0.6.0]

### Changed
- **Bookmark icon tap/long-press** — tapping the icon on a home-screen row immediately toggles the bookmark with no confirmation modal. Long-pressing opens a modal to mark the article as read or unread.
- **TOC sheet follows finger on swipe-up** — the bottom sheet now tracks your finger in real time as you swipe up from the handle, instead of snapping open on release. The backdrop fades in proportionally during the drag. Releasing past 80 pt (or with a fast flick) springs the sheet fully open; releasing earlier springs it back closed.

### Added
- **Inline table of contents** — a compact, tappable TOC appears between the preamble and the first article section, replacing the dead space left by the skipped `#toc` div. Top-level sections are full brightness; subsections are indented and muted. Tapping any entry scrolls directly to that section.
- **App icon** — 7-ray sun on a dark rounded-square background, replaces the default RN icon.

### Changed
- **Article body virtualized** — `SepArticle` now uses `FlatList` instead of `ScrollView`. Only ~10 blocks are mounted at a time regardless of article length (previously all 300+ blocks were mounted on open), eliminating the JS-thread block that delayed initial paint and gesture callbacks.
- **Boot blocks until fully ready** — the splash screen now holds until the article index is fresh, all articles are downloaded (if `downloadAll` is set), and all one-time migrations (math backfill, AST pre-bake) are complete. Once the app unlocks, every article opens instantly with no fetch spinner.
- **MathRenderWebView mounted during boot** — the hidden MathJax WebView is now alive during the boot phase so the math backfill can use it immediately rather than racing against the UI.
- **Download progress shown on splash** — bulk download now displays a progress bar and count ("142 / 1838") on the boot screen instead of a thin overlay bar that appeared after the app was already shown.

### Fixed
- **Double divider at article start** — the two `<hr>` elements orphaned by the skipped `#toc` div are now stripped before rendering. The first article heading no longer shows its section-separator top border (redundant given the TOC above it).
- **Redundant preamble bottom border** — removed the hard border under the preamble; the TOC's top hairline now provides that visual break.
- **Per-render object allocation in inline styles** — `bold`, `italic`, `superscript`, `small`, `underline`, and `strikethrough` style objects in `Inline.tsx` are now hoisted to module-level constants instead of being recreated on every render.
- **Double `hasMath` traversal** — `paraMath` is now computed once in `BlockView` and passed as `precomputedHasMath` to `InlineContent`, eliminating a redundant full inline tree walk per paragraph.
- **Unstable handler object causing full re-renders** — `handlers` in `SepArticle` is now wrapped in `useMemo`, so unrelated state changes (overlay menu, footnote popup, TOC sheet) no longer cause every block to re-render.
- **O(n) `astKey`** — was serializing the full AST JSON on every render for comparison; now keyed by `slug:content_hash`.
- **`indexLinks` and backfill priming blocking navigation** — deferred to `InteractionManager.runAfterInteractions` so they no longer compete with the navigation animation.

## [0.5.0]

### Added
- **Images in native renderer** — `case 'image'` blocks now render via RN `<Image>`, sized to each figure's intrinsic aspect ratio (`onLoad` → `aspectRatio`) instead of a fixed 180 px box, with relative srcs resolved against `https://plato.stanford.edu/entries/{slug}/`. Previously all article figures were silently dropped.
- **Annotation display in native renderer** — highlights are painted on the exact matched text span within a paragraph (no-math fast path), supporting multiple highlights per paragraph; math paragraphs fall back to a whole-paragraph left border. Tapping a highlight opens the edit modal; long-pressing a paragraph opens the creation modal with its text pre-filled.
- **Native footnote sheet from the AST** — the parser now collects footnote definitions into `ParsedArticle.footnotes` (keyed by id, return-link stripped); tapping a footnote ref resolves against that map and renders the note (rich inline, math/links intact) instead of re-scraping raw HTML per tap with a lossy entity decoder.
- **Native "Related by link" footer** — backlink count now renders as a tappable row at the end of the article in native mode (was a WebView-only DOM injection that silently no-op'd once the native renderer became the default).
- **`collectMathNodes`** (`mathStore.ts`) — walks a `ParsedArticle` block tree to collect all TeX nodes; used by `hydrateMath` to warm the SVG cache before render.

### Changed
- **Math warm-up gated on the parsed AST** — `hydrateMath` now runs whenever `collectMathNodes` finds math in the parsed article, rather than trusting the stored `has_math` flag (which defaults to 0 for articles cached before the column existed, so they'd wrongly skip warm-up forever). The `has_math` column is still detected at cache time as a hint.
- **Native renderer enabled** — `USE_NATIVE_RENDERER = true`; article bodies now render via the custom native parser/renderer instead of WebView. `recordRead` is fire-and-forget (removes 2 SQLite round-trips from the navigation critical path); `getMeta` results are cached in memory (custom CSS and font size no longer re-queried on every article open); `buildArticleHtml` skipped in native mode.
- **TOC jump wired for native** — `SepArticle` now exposes a `scrollToSection(id)` imperative handle via `forwardRef`; `handleTocJump` uses it instead of WebView JS injection.
- **`resolveMath` wired** — native renderer uses the real on-device TeX→SVG resolver (`mathStore.resolveMath`) with SQLite-backed session cache; previous stub returned `null` for all math.
- **Timeline view: oldest at bottom, newest at top** — corrected the y-axis direction so ancient philosophers (e.g. Pythagoras 580 BCE) appear at the bottom and later thinkers (e.g. Aquinas 1225 CE) at the top, matching the natural chronological reading of a vertical timeline.
- **Timeline horizontal jitter** — nodes whose birth years place them within 28dp of a neighbor now alternate left/right (±12% of canvas width) instead of stacking vertically, keeping the timeline's vertical axis legible while avoiding dot overlap.

### Fixed
- **In-app navigation for native links** — the native renderer's `onLinkPress` now mirrors the WebView's `handleNav`: in-page anchors (`#section`, bibliography refs) scroll within the article via `scrollToSection`, cross-article links (absolute `/entries/…` **and** relative `../slug/`) push a new Article screen, and only genuinely external links open the system browser. Previously in-page anchors and relative cross-article links were silently dropped in native mode.
- **Stale in-memory `meta` cache** — `getMeta`'s cache is now kept in sync by `savePrefs`, `saveZoteroPrefs`, and `importUserData`, which write the `meta` table directly. Without this, a restore/sync (or pref change via those paths) left `getMeta` serving the pre-write value for the rest of the session — e.g. restored `custom_css` / `font_size` silently ignored until app restart.
- **Swipe-right to go back** — removed the custom Pan gesture and `gestureEnabled: false` override; the native iOS stack back-swipe now handles this directly with no competing recognizer.
- **Cross-article links opening Safari** — the WebView `baseUrl` was set to `https://plato.stanford.edu` (root), so relative links in cached article HTML (e.g. `../other-article/`) resolved to `/other-article/` instead of `/entries/other-article/`. They missed the intercept regex and fell through to `Linking.openURL`. Fixed by setting `baseUrl` to `https://plato.stanford.edu/entries/<slug>/`, matching the original page location.

## [0.4.1]

### Fixed
- **Article loading spinner on cached articles** — article now renders immediately after the DB read; backlink count loads in the background and injects via JS.
- **10-second input lag** — `indexLinks` was issuing 100–200 sequential SQLite bridge calls per article open, flooding the JS event queue. Now a single batch INSERT.
- **Missing index on `links.to_slug`** — `getLinksTo` was doing a full table scan; added `idx_links_to_slug`.

## [0.4.0]

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

### Added — native renderer foundation
- **Custom SEP HTML parser** (`src/utils/sepHtml/`) — tokenizes stored article HTML into a typed AST (`parse.ts` + `types.ts`) via `htmlparser2`. Handles SEP's full tag set: headings (with section ids), paragraphs, lists, definition lists, blockquotes, captioned tables, `.wl` cross-reference links, footnote refs, and inline/deprecated formatting. Nested tables flagged `unsupported` for a scoped WebView fallback. 9 unit tests.
- **Inline TeX math tokenization** — splits `\(…\)` (inline) and `\[…\]` (display) out of text into `math` AST nodes. A full-corpus audit found 450 articles (~24%) use TeX (122,263 equations, zero MathML).
- **Corpus audit tooling** — `scripts/auditCorpus.cjs` validates the parser against all 1,838 articles: **0 parse exceptions**, 0 untokenized math delimiters.
- **Native block renderer** (`src/utils/sepHtml/render/`) — `SepArticle`/`Blocks`/`Inline`/`MathSvg` render the AST as native RN components matching the reader typography.

### Changed
- `htmlparser2` pinned to `^9.1.0` (dual CJS/ESM) for clean Metro/Jest resolution; v12 is ESM-only.

## [0.3.1]

### Added
- **GPL-3.0 license** (`LICENSE`) for the project's own source code.
- **`NOTICE.md`** — states non-affiliation with Stanford / the Metaphysics Research Lab, records that SEP article content is fetched on-device at runtime and never bundled or redistributed, and documents the "fetch, don't bundle" design constraint.
- **README "Licensing & content" section** — frames the app as an independent (unaffiliated, not adversarial) reader that points users back to the SEP, and pins the no-bundled-content rule.
- **CI guard** (`.github/workflows/no-bundled-content.yml` + `scripts/check-no-bundled-content.js`) — fails the build if a tracked `.db`/`.sqlite` file or an oversized non-allowlisted asset (potential SEP article content) could ship.

### Fixed
- Corrected README/feature copy that described the injected reading styles as "SEP CSS"; the reader CSS is our own purpose-built stylesheet, not Stanford's.

## [0.3.0]

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

## [0.2.0]

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

## [0.1.0]

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

## [0.0.1]

### Added
- React Native 0.81.6 bare project with react-native-macos 0.81.7
- Wikipedia-style article fetching and SQLite caching (expo-sqlite v16, FTS5, WAL)
- Home screen with search, recent reads, and cached-article indicator
- Article screen with WebView renderer, injected SEP CSS and companion JS
- Session-based reading history with tree structure
- EAS Build config for Android APK (preview + production profiles)
