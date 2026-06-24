# Mockup Specification — Nous (SEP Reader)

Authoritative, enumerated spec extracted from `blind-design/mockup.html`. Every item
has a stable ID and is verified by `__tests__/mockup/mockupSpec.test.ts`.

Status legend used in the audit:
- ✅ **implemented** — present in the build and matches.
- ⚠️ **partial** — present but diverges from the mockup.
- ❌ **missing** — not in the build.
- 🚫 **deviation (by design)** — mockup uses placeholder data (a generic wiki with
  folders/categories) that the Stanford Encyclopedia does not have; intentionally not
  ported. Flagged for explicit product decision rather than faked.

---

## TOKEN — Design tokens (mockup `:root`)

| ID | Decision | Value |
|----|----------|-------|
| TOKEN-01 | bg | `#111111` |
| TOKEN-02 | bg-surface | `#1c1c1c` |
| TOKEN-03 | bg-elevated | `#252525` |
| TOKEN-04 | bg-input | `#2a2a2a` |
| TOKEN-05 | border | `#2e2e2e` |
| TOKEN-06 | border-subtle | `#222222` |
| TOKEN-07 | text | `#e4e4e4` |
| TOKEN-08 | text-sec | `#9a9a9a` |
| TOKEN-09 | text-hint | `#555555` |
| TOKEN-10 | accent | `#5b8ef5` |
| TOKEN-11 | accent-dim | `rgba(91,142,245,.14)` |
| TOKEN-12 | accent-border | `rgba(91,142,245,.35)` |
| TOKEN-13 | highlight yellow stroke | `#fbbf24` |
| TOKEN-14 | highlight green stroke | `#34d399` |
| TOKEN-15 | highlight blue stroke | `#60a5fa` |
| TOKEN-16 | highlight pink stroke | `#f472b6` |
| TOKEN-17 | font family | Roboto / system sans |
| TOKEN-18 | app bar height | `52px` |
| TOKEN-19 | SVG icon stroke | width `1.8`, round cap/join |

---

## NAV — Bottom navigation (mockup `.bn`)

| ID | Decision |
|----|----------|
| NAV-01 | Bottom nav height `56px`, top border `#2e2e2e`, bg `#111` |
| NAV-02 | Three items: **Home**, **Search**, **Notes** (in that order) |
| NAV-03 | Active item uses accent color; inactive uses text-hint `#555` |
| NAV-04 | Active item shows a pill behind the icon: `56×30`, radius `15`, `accent-dim` bg |
| NAV-05 | Item icon `22px`; label `10px`/`500` |
| NAV-06 | Home icon = house, Search icon = magnifier, Notes icon = chat bubble |

---

## HOME — Home screen (`#screen-home`)

| ID | Decision |
|----|----------|
| HOME-01 | App bar has **no** bottom border |
| HOME-02 | Wordmark title, `22px`/`700`, letter-spacing `-.02em` |
| HOME-03 | Overflow control = **horizontal three-dots** (⋯) icon button, `42px` circular |
| HOME-04 | Search pill: margin `14px`, height `46px`, bg-surface, radius `23px`, border `#2e2e2e` |
| HOME-05 | Search pill: magnifier icon `18px` hint color + placeholder text `14px` hint |
| HOME-06 | Search pill placeholder text = "Search pages…" |
| HOME-07 | Section label: `11px`/`600`, letter-spacing `.07em`, uppercase, hint color, padding `14/16/6` |
| HOME-08 | Section "Continue reading" exists |
| HOME-09 | Page row: flex, gap `14`, padding `13/16`, bottom border `border-subtle` |
| HOME-10 | Page-row icon: `38×38`, radius `8`, bg-surface, document glyph `17px` |
| HOME-11 | Page-row title: `14px`/`500`, text color |
| HOME-12 | Page-row meta line: `12px`, hint color (e.g. "67% read · 3 annotations") |
| HOME-13 | Reading progress bar on row: track `#2a2a2a` `2px` radius `1`, fill `accent` at opacity `.6`, width = % read |
| HOME-14 | Page-row chevron: `15px`, hint color, vertically centered |
| HOME-15 | "Browse" section of folder/category rows ("Systems · 14 pages") | 🚫 SEP has no folders |
| HOME-16 | Page-row excerpt/snippet preview text under title (our addition, agreed) |

---

## ART — Article screen (`#screen-article`)

| ID | Decision |
|----|----------|
| ART-01 | App bar: back-arrow (left), spacer, magnifier, vertical-three-dots overflow |
| ART-02 | Left edge hint: `3px` gradient `accent-border → transparent`, full height, left edge |
| ART-03 | Swipe-up affordance pill at bottom: `40×4`, `#555`, over a bottom gradient fade |
| ART-04 | Article header padding `22/18/16`, bottom border `border-subtle` |
| ART-05 | Category eyebrow: `11px`/`600`, letter-spacing `.08em`, uppercase, **accent** color |
| ART-06 | Title: `26px`/`700`, line-height `1.2`, letter-spacing `-.02em`, text color |
| ART-07 | Meta row `12px` hint: updated/age · read-minutes |
| ART-08 | Annotation-count chip: accent-dim bg, accent-border, `11px`/`500` accent, message icon, "N notes" |
| ART-09 | Prose: padding `18`, font `16px`, line-height `1.78`, color `#d0d0d0` |
| ART-10 | Prose `h2`: `18px`/`600`, top border `border-subtle` |
| ART-11 | Prose `h3`: `15px`/`600` |
| ART-12 | Prose blockquote: left border `2px`, bg-surface, radius right side |
| ART-13 | Inline `code`: monospace, bg-elevated, color `#c4b5fd` |
| ART-14 | Wiki link (`.wl`): accent color, bottom border underline |
| ART-15 | Missing wiki link (`.wl-missing`): hint color, dashed underline |
| ART-16 | Highlight spans: yellow/green/blue/pink backgrounds |
| ART-17 | Note-dot indicator: `6px` yellow dot appended to an annotated highlight |
| ART-18 | Inline annotation card: bg-surface, left border `3px` yellow, note text |
| ART-19 | Backlinks row at end: top border, link icon, "N pages link here", count badge |

---

## ANNOT — Annotation / highlight mode (`#screen-annotate`)

| ID | Decision |
|----|----------|
| ANNOT-01 | Selecting text shows a highlight toolbar |
| ANNOT-02 | Toolbar has 4 color swatches: yellow, green, blue, pink |
| ANNOT-03 | Toolbar has a **Note** action (pencil icon) |
| ANNOT-04 | Toolbar has a **Copy** action (copy icon) |
| ANNOT-05 | Selected color swatch is ring-highlighted |
| ANNOT-06 | Note input sheet: drag handle, "Note on highlight" label, quoted text, textarea, Cancel/Save |
| ANNOT-07 | Tapping an existing highlight opens it for edit |

---

## TOC — Table-of-contents bottom sheet (`#screen-toc`)

| ID | Decision |
|----|----------|
| TOC-01 | Opened by swiping **up** from the article (and via the bottom pill tap) |
| TOC-02 | Scrim behind sheet: `rgba(0,0,0,.55)`, tap to dismiss |
| TOC-03 | Sheet: `66%` height, bg-surface, top radius `14px` |
| TOC-04 | Drag handle: `36×4`, color `border` `#2e2e2e`, centered, `margin 10 auto 0` |
| TOC-05 | Tab bar: bottom border `border-subtle` |
| TOC-06 | Two tabs: **Contents** and **Annotations** |
| TOC-07 | Active tab: accent text + `2px` accent bottom border (full tab width) |
| TOC-08 | Inactive tab: hint text, transparent border |
| TOC-09 | Annotations tab shows a count badge (accent-dim when active) |
| TOC-10 | toc-item: flex, gap `14`, padding `14/18`, bottom border `border-subtle` |
| TOC-11 | toc-num: `12px`, hint color, `min-width 20`, rendered as a **separate** element from text |
| TOC-12 | toc-text: `14px`, text color |
| TOC-13 | Sub-item (`h3`): indent `padding-left 36`, text `13px` sec color |
| TOC-14 | Annotations panel: section-group labels + cards (bg-elevated, radius `8`, colored left border, quote + note) |
| TOC-15 | Article dimmed behind the sheet (low opacity) |
| TOC-16 | **No** explicit × close button (dismiss via scrim / drag) |

---

## GRAPH — Knowledge graph (`#screen-graph`)

| ID | Decision |
|----|----------|
| GRAPH-01 | Opened by swiping **down** from the top of the article |
| GRAPH-02 | App bar: back control + "Graph" eyebrow + article title |
| GRAPH-03 | Center node is the current article, accent-filled, larger radius |
| GRAPH-04 | Linked (read) neighbor nodes styled distinctly from dim/unread nodes |
| GRAPH-05 | Missing-page nodes: dashed outline |
| GRAPH-06 | Edge styles: solid "linked", dashed "backlink only", dashed faint "missing" |
| GRAPH-07 | Legend explaining node/edge types |
| GRAPH-08 | Node labels rendered near nodes |
| GRAPH-09 | Tapping a node shows a **preview card** before opening (our agreed addition) |
| GRAPH-10 | Canvas is pan/drag-able |

---

## SEARCH — Search screen (`#screen-search`)

| ID | Decision |
|----|----------|
| SEARCH-01 | Search app bar: back arrow, inline text input, clear (×) button |
| SEARCH-02 | Input placeholder "Search…", `16px` text, accent caret |
| SEARCH-03 | Filter chips row (horizontal scroll): All / Pages / categories | 🚫 categories are placeholder data |
| SEARCH-04 | Active chip: accent-dim bg, accent-border, accent text |
| SEARCH-05 | Result row (`.sr`): doc icon, title, path line, optional excerpt |
| SEARCH-06 | Result title highlights the matched query with `<mark>` (yellow) |
| SEARCH-07 | Result path line "Systems / Architecture" | 🚫 SEP has no category path |
| SEARCH-08 | Result excerpt with matched term emphasized |

---

## GESTURE — Gesture navigation model

| ID | Decision |
|----|----------|
| GESTURE-01 | Article: swipe **up** → TOC sheet |
| GESTURE-02 | Article: swipe **down** → graph view |
| GESTURE-03 | Article: swipe **right** → back home |
| GESTURE-04 | TOC sheet dismiss: tap scrim |

---

## DATA — Data/behavior backing the UI (not visual, but required for the above)

| ID | Decision |
|----|----------|
| DATA-01 | Per-article reading progress persisted (`entries.read_progress`), backs HOME-13 |
| DATA-02 | Reading progress reported from the reader as the user scrolls |
| DATA-03 | Per-article annotation counts available to home rows, backs HOME-12 |
| DATA-04 | Plain-text excerpt stored per article (`entries.excerpt`), backs HOME-16 / GRAPH-09 |
| DATA-05 | TOC parsed from article HTML into number + text + level |

---

## Audit results (run `npm test`)

The suite lives in `__tests__/mockup/` — one assertion per spec ID, verified
against the build's source. Latest run: **94 tests passing, 9 suites**.

### Gaps the audit found and fixed
- **parseToc bug (DATA-05/TOC-11):** the section-number regex greedily swallowed
  the trailing dot, so a top-level item "1." was parsed as `num:"1."` / `level:1`
  instead of `num:"1"` / `level:0` — corrupting TOC indentation. Fixed.
- **ART-14 wiki-link color:** reader CSS used `--accent:#7ba4ff`; the mockup/app
  accent is `#5b8ef5`. Aligned.
- **Reader bg token:** reader used `#121212`; mockup/app bg is `#111111`. Aligned.
- **ART-09 prose line-height:** was `1.75`, mockup is `1.78`. Aligned.
- **ART-19 backlinks row:** was entirely missing. Added a "N pages link here" row
  at the end of the article (taps open the graph).

### Open deviations — need a product decision (NOT auto-changed)
- **HOME-15 / SEARCH-03 / SEARCH-07 — folders, category chips, category paths:**
  the mockup is a generic wiki with fictional folders ("Systems", "Engineering").
  SEP has no category taxonomy, so these are intentionally not ported. 🚫
- ~~**Reader typography:** mockup prose is sans-serif, 16px; app was serif/20px.~~
  ✅ **Resolved** — switched the reader to sans-serif (`--sans`) at 16px to match
  the mockup, locked by test ART-09.
- **Search screen** is implemented as a tab inside Home rather than a separate
  route; result rows reuse the home page-row rather than the mockup's `.sr` layout
  with inline `<mark>` match highlighting. ⚠️
