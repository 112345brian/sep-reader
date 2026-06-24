# Wiki UX — Design Rationale

## Guiding principle

A wiki is a *graph of pages*, not a tree of documents. The UX should make that graph navigable without forcing the user to remember structure.

---

## Information architecture

```
┌─────────────────────────────────────────────────────────┐
│  [≡ Space]  Breadcrumb > Trail > Here     [⌘K] [Edit]  │  ← Top bar
├──────────┬──────────────────────────────┬───────────────┤
│          │                              │               │
│  Nav     │       Page Content           │  On this page │
│  tree    │                              │  TOC          │
│          │                              │               │
│  Starred │                              │  ──────────   │
│  Recent  │                              │  Backlinks    │
│          │                              │  (N pages)    │
└──────────┴──────────────────────────────┴───────────────┘
```

### Left sidebar — "Where am I?"
- Collapsible page tree rooted at the current space
- Starred / pinned pages at top
- Recent pages below
- Collapses to icon rail on narrow viewports

### Center — content is king
- Max-width ~720px prose column, centered
- Page title is an H1; subtitle / last-edited metadata below it
- Wikilinks `[[rendered as inline chips]]` so the graph is visible while reading
- No chrome inside the content area — no boxes, cards, or containers

### Right sidebar — "What else?"
- Sticky TOC generated from headings; active section highlighted
- Backlinks section: collapsed by default, expands to show excerpt + page title
- Hides on viewports < 1100px; accessible via a "Backlinks (N)" button at page bottom

---

## Key flows

### 1. Reading → following a thought
Click any `[[wikilink]]` chip inline. The link opens in the same tab; the browser Back button returns. No modals, no panels that slide in — the web's native nav model.

### 2. Searching
- `⌘K` opens a command palette overlay (also a search box in the top bar)
- Fuzzy title match ranked first, full-text match below
- Each result shows: title, breadcrumb path, first matching excerpt
- Arrow-key navigable; Enter opens; Escape closes
- Empty query shows recent pages + starred pages

### 3. Editing
- "Edit" button top-right switches the page to edit mode in place
- Editor is a markdown surface with a toolbar for non-markdown users
- Wikilinks are created with `[[` autocomplete — type `[[` and a dropdown appears with matching page titles
- Autosave every 30 s with an unobtrusive "Saved" indicator
- "Cancel" restores last saved state; no separate preview mode (rendered preview shown beside editor on wide screens)

### 4. Creating a new page
- Any `[[Page That Doesn't Exist Yet]]` renders as a dashed underline link
- Clicking it opens a blank edit surface with the title pre-filled
- Also: `⌘K` → type a page name that doesn't exist → "Create page: X" appears as last result

### 5. Page history
- Accessible from a "..." menu on the page
- Shows a list of dated revisions; clicking one shows a diff
- "Restore this version" button on each revision

---

## Visual design tokens

| Token | Value |
|---|---|
| Base font | System UI stack, 17px / 1.6 line-height |
| Content width | 720px |
| Sidebar width | 220px left, 200px right |
| Surface | White / #0f0f0f (dark) |
| Border | 1px #e5e5e5 / #2a2a2a |
| Accent (links, active) | #2563eb (blue-600) |
| Wikilink chip | Subtle blue tint background, no underline |
| Dashed wikilink (missing page) | Dashed underline, muted text |

---

## Anti-patterns explicitly avoided

- **No full-page loading spinners** — navigation is client-side or instant
- **No modal editors** — editing happens in context
- **No forced hierarchy** — pages exist flat; the tree view reflects *one* optional organization
- **No WYSIWYG that hides markdown** — the source is always accessible
- **No cluttered toolbars** — toolbar appears on selection, not always-on
- **No notifications for background saves** — silent autosave only; errors shown inline

---

## Mobile (< 768px)

- Left sidebar becomes a bottom sheet triggered by a hamburger
- Right sidebar TOC / backlinks become a floating "Contents" pill that anchors to bottom of screen
- Edit toolbar docks to the bottom of the keyboard
- `⌘K` becomes a full-screen search modal

---

## Accessibility

- All interactive elements keyboard-focusable with visible focus ring
- Page tree uses `role="tree"` + `aria-expanded`
- Command palette traps focus; `Escape` releases
- TOC links use `aria-current="true"` on active section
- Color never the sole indicator of state (dashed links use dashed *and* muted color)
