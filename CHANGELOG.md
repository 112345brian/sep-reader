# Changelog

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
