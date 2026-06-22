# Changelog

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
