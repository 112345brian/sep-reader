# Nous

A native Android reader for the [Stanford Encyclopedia of Philosophy](https://plato.stanford.edu) and [The OWL](https://www.inphoproject.org). Built with React Native 0.81.

## Features

- **Native renderer** — articles render as native React Native components, not a WebView. Fast scroll, real text selection, annotation highlights painted directly on matched spans.
- **Full-text search** across all ~1,800 SEP articles and OWL ontology entries
- **Offline library** — bulk-download the full library at first launch, or fetch articles on demand and cache them. Progress shown in-app and in the notification shade.
- **Semantic graph** — related articles, influence timelines, and a zoomable graph view powered by [InPhO](https://www.inphoproject.org) data fetched per-client at runtime.
- **Annotations** — highlight and note any passage; color-coded, searchable, exportable.
- **Reading history** — sessions visualized as collapsible branching trees showing how you got from article to article.
- **Inline math** — TeX equations rendered via MathJax to SVG, cached in SQLite.
- **Table of contents** — inline TOC with section jump, sticky header.
- **Bookmarks** and reading list.
- **Library scope** — target SEP only, OWL only, or both.

## Stack

| Layer | Choice |
|---|---|
| Framework | React Native 0.81.6 |
| Build | EAS Build (cloud — no Android Studio needed) |
| Storage | expo-sqlite v16, FTS5, WAL |
| Navigation | React Navigation v7 native stack |
| Renderer | Custom native HTML→AST parser + RN component tree |
| Math | MathJax 3 (server-side SVG, cached in SQLite) |
| Gestures | react-native-gesture-handler |

## Building

### Android (via EAS cloud)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

### Local development

```bash
npm install
npx react-native start
# in another terminal:
npx react-native run-android
```

## Architecture

**Index:** Fetched from `plato.stanford.edu/contents.html` on first launch, refreshed weekly. Stored in SQLite with an FTS5 virtual table for full-text search.

**Articles:** Fetched on demand from `plato.stanford.edu/entries/<slug>/`. HTML is parsed into a typed AST (`src/utils/sepHtml/`), stored in SQLite, and rendered natively. Inline TeX is extracted at parse time and rendered to SVG via MathJax.

**InPhO graph:** Related-article edges, influence timelines, and node metadata are fetched per-client from Indiana University's InPhO API at runtime. Never bundled.

**Annotations:** Stored locally in SQLite, keyed by slug + text span. Highlights are painted on the matched inline span within the native renderer.

**Journey:** Every article open is recorded with a `from_slug` pointer. Reads are grouped into sessions by a 30-minute gap threshold. The History screen renders sessions as collapsible branching trees.

## Attribution & support

Nous is an independent reader. It is **not** affiliated with, endorsed by, or sponsored by Stanford University, the Metaphysics Research Lab, Indiana University, or the SEP's editors.

**Please support the sources this app depends on:**

- **[Donate to the Stanford Encyclopedia of Philosophy](https://plato.stanford.edu/support/)** — the SEP is a freely available public good run by volunteer editors and funded by reader donations and library subscriptions. If you use this app to read the SEP, please give back.
- **[InPhO Project, Indiana University](https://www.inphoproject.org)** — the semantic graph data (related articles, influence timelines) comes from InPhO. Their work makes the graph view possible.

## Licensing & content

This project's source code is licensed under **GPL-3.0** (see [`LICENSE`](LICENSE)).
Full details are in [`NOTICE.md`](NOTICE.md).

**Hard design constraint — fetch, don't bundle.** SEP article content is © the Metaphysics Research Lab, Stanford University, and is not openly licensed. InPhO data is CC BY-NC-SA. Neither is bundled in the app or served by us. The app fetches content the same way a browser does — on demand, on the user's behalf, onto the user's own device.

No release artifact may contain SEP article text or InPhO data. Only app code, our own CSS/JS, the entry title/link index (slugs + titles — facts), and an empty SQLite schema may ship. A CI guard ([`.github/workflows/no-bundled-content.yml`](.github/workflows/no-bundled-content.yml)) fails the build if a forbidden content artifact is detected.
