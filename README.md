# SEP Reader

A native mobile + macOS reader for the [Stanford Encyclopedia of Philosophy](https://plato.stanford.edu). Built with React Native 0.81 and react-native-macos.

## What it does

- Full-text search across all ~1,800 SEP articles
- Articles download on demand and cache for offline reading (Wikipedia model)
- Our own reading CSS + companion JS injected for a faithful reading experience
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
| Renderer | react-native-webview with injected reading CSS/JS (ours) |

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

**Articles:** Fetched on demand from `plato.stanford.edu/entries/<slug>/`. HTML is parsed (title, TOC, preamble, body) and stored in SQLite. Our own reading CSS and companion JS are injected into a local WebView at render time.

**Journey:** Every article open is recorded with a `from_slug` pointer. Reads are grouped into sessions by a 30-minute gap threshold. The History screen renders sessions as collapsible branching trees.

## Licensing & content

This project's source code is licensed under **GPL-3.0** (see [`LICENSE`](LICENSE)).
Full details are in [`NOTICE.md`](NOTICE.md).

**An independent reader, built with respect for the SEP.** This is an
independent client made by readers who admire the
[Stanford Encyclopedia of Philosophy](https://plato.stanford.edu) and want to
read it well on their own devices. It is **not** affiliated with, endorsed by, or
sponsored by Stanford University, the Metaphysics Research Lab, or the SEP's
editors — "independent" here means *unaffiliated*, not adversarial. We use the
names "Stanford" and "Stanford Encyclopedia of Philosophy" only to describe what
this app reads (nominative fair use), and the app's name does not incorporate the
Stanford mark.

The SEP is a freely available public good, sustained by its editors, authors, and
[the Friends of the SEP / SEPIA](https://plato.stanford.edu). If you value it,
please **support and cite the SEP directly** — this reader exists to send people
*to* that work, not to substitute for it.

**Hard design constraint — fetch, don't bundle.** SEP article content is
© the Metaphysics Research Lab, Stanford University, and is not openly licensed.
We have no right to redistribute it, and we don't. The app fetches articles the
same way a browser does — on demand, on the user's behalf, onto the user's own
device — and caches them locally (which also *reduces* repeat load on SEP's
servers). The *tool* is what we distribute; the *content* is never bundled in or
served by us.

No release artifact may contain SEP article text. Only the app code, our own
CSS/JS, the entry title/link index (slugs + titles), and an **empty** SQLite
schema may ship. This applies to anything we host as well — serving a prebuilt
content database from our own server would be the same redistribution and is
equally prohibited. Contributors must not break this rule; a CI guard
([`.github/workflows/no-bundled-content.yml`](.github/workflows/no-bundled-content.yml))
fails the build if a forbidden content artifact could ship. Please also respect
SEP's [terms of use](https://plato.stanford.edu) and access their servers
considerately (reasonable request rates, honoring `robots.txt`).
