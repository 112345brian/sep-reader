# SEP Reader

A native mobile + macOS reader for the [Stanford Encyclopedia of Philosophy](https://plato.stanford.edu). Built with React Native 0.81 and react-native-macos.

## What it does

- Full-text search across all ~1,800 SEP articles
- Articles download on demand and cache for offline reading (Wikipedia model)
- Injected SEP CSS + companion JS for a faithful reading experience
- Journey tracker — visualizes reading sessions as branching trees
- Bookmarks, share, and refresh per article
- First-launch onboarding: lazy-load vs. download-everything, and home screen preference

## Stack

| Layer | Choice |
|---|---|
| Framework | React Native 0.81.6 |
| macOS | react-native-macos 0.81.7 |
| Android build | EAS Build (cloud, no Android Studio needed) |
| Storage | expo-sqlite v16 with FTS5 + WAL |
| Navigation | React Navigation v7 native stack |
| Renderer | react-native-webview with injected SEP CSS/JS |

## Building

### Android (via EAS cloud — no Android Studio needed)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

### macOS (requires Xcode)

```bash
cd macos && pod install && cd ..
npx react-native run-macos
```

## Development

```bash
npm install
npx react-native start
```

## Architecture

**Index:** Fetched from `plato.stanford.edu/contents.html` on first launch, refreshed weekly. Stored in SQLite with an FTS5 virtual table for fast search.

**Articles:** Fetched on demand from `plato.stanford.edu/entries/<slug>/`. HTML is parsed (title, TOC, preamble, body) and stored in SQLite. SEP CSS and companion JS are injected into a local WebView at render time.

**Journey:** Every article open is recorded with a `from_slug` pointer. Reads are grouped into sessions by a 30-minute gap threshold. The History screen renders sessions as collapsible branching trees.
