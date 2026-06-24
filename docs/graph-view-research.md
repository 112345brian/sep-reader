# Graph View: How Obsidian & Friends Do It

Research notes to make our graph view idiomatic. Sources at the bottom.

Our current implementation lives in [GraphScreen.tsx](../src/screens/GraphScreen.tsx):
a static one-shot Fruchterman–Reingold force layout (O(n²)/iteration, ~120 iterations
computed once), rendered to `react-native-svg`, with pan but no zoom, a tap-to-preview
card, and a fixed 3-state node legend (current / read / linked). This doc compares that
against the conventions established by Obsidian, Logseq, and Roam, and flags where we
diverge from what users expect.

---

## 1. The two graphs: Global vs. Local

Every mature tool ships **two distinct views**, and users treat them as different
features:

- **Global graph** — every node in the vault that passes the active filters. Used for
  "shape of my whole knowledge base" exploration. Node size scales with link count
  (degree).
- **Local graph** — only nodes connected to the *currently open note*, expanded out by a
  **depth** slider. Used for "what surrounds this idea right now." This is contextual and
  usually lives docked next to the note.

The pivotal control on the local graph is **depth (jumps)**: depth 1 = direct neighbors,
depth 2 = neighbors-of-neighbors, etc. (Obsidian goes 1–5+.) Most research-y browsing
happens at depth 1–2; higher depths are for serendipitous "what's distantly related"
discovery.

**Where we stand:** Our `getArticleLinkGraph(centerSlug)` is effectively a *fixed depth-1
local graph* (outgoing + incoming of one article). We have no global graph and no depth
control. This is the single biggest gap vs. the idiom — users coming from Obsidian will
expect a depth slider and a "see the whole corpus" mode.

### Local-graph link-direction toggles
Obsidian's local graph separately toggles:
- **Outgoing links** — articles this one references.
- **Incoming links** — articles that reference this one (backlinks).
- **Neighbor links** — show edges *among the neighbors themselves*, not just edges to the
  center. This is what turns a star/hub into an actual web and reveals whether the
  surrounding topics are interlinked. We currently draw all edges we fetch, so we get
  neighbor links for free — but we don't expose direction toggles.

---

## 2. The physics: what "force-directed" actually means here

All of these tools use a **continuously-running force simulation**, not a one-shot solve.
The canonical implementation is **d3-force** (Obsidian uses its own variant; the model is
the same). Forces, all idiomatically named and individually tunable in the UI:

| Force | Effect | d3-force analog |
|---|---|---|
| **Center force** | Pulls everything toward canvas center. Higher = tighter, rounder ball. | `forceCenter` / weak `forceX/Y` |
| **Repel force** | All nodes push each other apart (n-body charge). Higher = more spread. | `forceManyBody` (negative strength) |
| **Link force** | Edges act as springs pulling connected nodes together. Higher = stiffer. | `forceLink.strength` |
| **Link distance** | Target rest length of a spring (edge). | `forceLink.distance` |
| (implicit) **Collision** | Nodes treated as solid discs so they don't overlap. | `forceCollide` |

Two things make the real implementations feel good that our static solve does not:

1. **It runs live (the "tick" loop).** The simulation has an `alpha` (energy) that
   **decays** over time (`alphaDecay`) until it "cools" and settles, then *stops* to save
   CPU. Dragging a node or changing a filter **reheats** alpha so the graph re-settles.
   This is why Obsidian graphs visibly "breathe" into place and respond to interaction.
2. **Barnes–Hut quadtree** for the repel force → O(n log n) instead of O(n²). A `theta`
   parameter (~0.9) approximates a whole far-away cluster as a single point. This is the
   only way the global graph stays interactive at thousands of nodes.

**Where we stand:** Our [forceLayout()](../src/screens/GraphScreen.tsx#L23) is the right
*model* (repulsion + edge attraction + center gravity + cooling "temperature") but:
- It's **O(n²) per iteration** — fine for a depth-1 neighborhood (tens of nodes),
  unusable for a global view. Would need Barnes–Hut to scale.
- It's **computed once, frozen.** No live tick, no drag-to-reposition, no reheat. Nodes
  can't be dragged; the layout you get is the layout you keep.
- Forces are **hardcoded constants** (`0.01` gravity, `k` from area). Obsidian exposes all
  of these as sliders because the "right" values depend on graph density.

**Recommendation:** For a 1838-article corpus, do **not** try to render the global graph
with this algorithm. Either (a) keep the graph local-only with a depth slider and add a
live tick loop + drag, or (b) if a global graph is wanted, adopt a quadtree/Barnes–Hut
charge force and run it on an animation loop with alpha decay. `d3-force` itself is
pure-JS and runs fine in RN (it only computes x/y; we keep rendering in SVG/Skia).

---

## 3. Interaction conventions (this is where it feels "right")

These are near-universal across Obsidian/Logseq/Roam and are what users reach for
reflexively:

- **Hover/tap a node → highlight its neighbors, dim everything else.** The connected
  subgraph lights up (full opacity, often a highlight color) while unrelated nodes fade to
  ~10–20% opacity. This is the #1 "graph feels alive" interaction. We don't do this — we
  pop a preview card instead.
- **Drag a node** to reposition it; the simulation reheats and flows around it. Optionally
  **pin** (fix) a node so it stays put (`fx/fy` in d3 terms).
- **Zoom + pan** as first-class. We have pan but **no zoom** — a hard requirement for any
  non-tiny graph. Pinch-to-zoom on mobile; scroll-wheel + `+/-` on desktop.
- **Click/double-click a node → open the note.** We do this (via the preview card's
  "Open" button), which is a reasonable mobile adaptation.
- **Labels appear on zoom / fade with distance** — see Display settings below.

---

## 4. Display settings (the standard panel)

Obsidian's "Display" group, which users expect to find:

- **Text fade threshold** — at what zoom level node labels appear/disappear. Showing all
  labels at once is unreadable; labels fade in as you zoom into a region. We currently show
  labels only for `read` + center nodes — a static heuristic that approximates this, but a
  zoom-based fade is the idiom.
- **Node size** — global multiplier; *and* per-node size scaled by **degree** (link
  count). Hubs look like hubs. We size by state (center 11 / read 7 / linked 4), not by
  degree. Degree-based sizing is more idiomatic and more informative.
- **Link thickness** — global line-width control.
- **Arrows** — toggle directional arrowheads on edges (pairs with incoming/outgoing). We
  draw undirected lines.
- **Animate** — replay node appearance over creation-time; a niche flourish, skip for v1.

---

## 5. Filters & Groups (color coding)

- **Filters:** search query, toggle tags, toggle attachments, "existing files only" (hide
  broken links), toggle **orphans** (unconnected nodes), exclude paths. The orphan toggle
  matters: a global graph is usually a big connected component plus a dust of orphans, and
  hiding them de-clutters.
- **Groups:** user-defined search queries each assigned a **color**. E.g. color all
  `#philosophy-of-mind` nodes purple. This is how Obsidian users make the global graph
  legible. For us, the natural analog is **coloring by SEP top-level category / discipline**
  rather than letting users write queries — we already have structured metadata they don't.

**Where we stand:** Our coloring encodes *read state* (current/read/linked), which is a
genuinely useful axis Obsidian *doesn't* have (we know reading history; they don't). Keep
it — but consider it one of several selectable "color by" modes (read-state vs. category vs.
degree), rather than the only one.

---

## 6. Rendering tech (for scale)

- Small graphs (tens–low hundreds of nodes): **SVG/Canvas is fine.** Our SVG approach is
  acceptable for the local view.
- Large graphs (thousands): the field moves to **WebGL** (Obsidian uses a WebGL canvas;
  libraries like Sigma.js, Cosmograph, force-graph do too) — roughly ~10× the throughput of
  Canvas, because per-node SVG nodes don't survive thousands of elements + per-frame
  updates.
- In React Native the idiomatic high-perf path is **`@shopify/react-native-skia`** (Canvas,
  GPU-backed) rather than `react-native-svg`. If we ever want a global graph or a live
  tick loop, SVG's per-element overhead and reconciliation cost will be the bottleneck;
  Skia draws the whole frame imperatively.

**Rule of thumb from the research:** keep SVG for a capped local neighborhood (say ≤150
nodes); switch to Skia + Barnes–Hut the moment we want global or continuous physics.

---

## 7. Gap summary & suggested priorities

What we already do well: read-state coloring (an axis Obsidian lacks), lazy preview cards,
a sensible static force model, pan.

Ordered by bang-for-buck toward feeling idiomatic:

1. **Zoom** (pinch / +-). Table stakes; pan-only feels broken.
2. **Hover/tap → highlight neighbors, dim the rest.** The signature "alive" interaction.
3. **Depth slider** on the local graph (1–3). Matches the core Obsidian mental model.
4. **Live tick loop + node drag** (reheat alpha on drag, cool and stop when settled).
   Turns the frozen layout into a responsive one.
5. **Degree-based node sizing** + zoom-based label fade. Cheap, very idiomatic.
6. **"Color by" modes** (read-state / SEP category / degree) instead of a single fixed
   scheme.
7. **Incoming/outgoing/neighbor toggles** + optional arrowheads.
8. **(Only if we want a global corpus graph)** Barnes–Hut charge force + migrate rendering
   to Skia. Don't attempt the global graph on the current O(n²) SVG path.

---

## 8. Recommendation (grounded in our actual code)

Two facts about our data layer decide the strategy:

- **Edges are lazily populated.** The `links` table is filled only when an article is
  opened and parsed ([db.ts:538](../src/services/db.ts#L538)). There is no precomputed
  corpus-wide edge set, and backlinks stay sparse until you've read widely.
  `getGraphData()` (the global query, capped at 500) exists but **isn't wired into
  GraphScreen** — only `getArticleLinkGraph` is.
- **We already have a richer graph than we render.** The InPhO tables
  ([db.ts:758+](../src/services/db.ts#L758)) carry idea/thinker nodes, influence edges
  (teachers/students/influenced), and lifespan dates, with a `GraphMode =
  'related' | 'timeline' | 'influence'` already typed. GraphScreen ignores all of it.

Conclusion: **don't chase a global Obsidian-style graph.** The data isn't there and
1838 SVG nodes on an O(n²) solve won't render. Our product is a great **local /
contextual graph** — and the InPhO modes are a *differentiator Obsidian can't match*
(real philosophical influence + chronology, not just "files that link to files").

### Recommended path — "idiomatic local graph," incremental, near-zero new deps

**Phase 1 — make it feel alive (no new dependencies; uses installed
reanimated + gesture-handler).**
1. **Pinch-to-zoom + pan** via `react-native-gesture-handler` `Pinch`/`Pan` driving a
   Reanimated transform on the SVG `<G>`. Replaces the current `PanResponder` (pan-only).
   This is table stakes and is the highest-value single change.
2. **Tap node → highlight neighbors, dim the rest.** Compute the neighbor slug-set, render
   non-neighbors at ~15% opacity. Keep the preview card, but as the *second* step (button /
   second tap), not the primary response.
3. **Degree-based node sizing + zoom-based label fade.** Size by link count instead of
   read/center state; reveal labels as zoom increases (`text fade threshold`). Cheap, very
   idiomatic.

**Phase 2 — match the mental model.**
4. **Depth slider (1–2–3)** on the local graph: expand `getArticleLinkGraph` to recurse N
   hops. Add **incoming / outgoing / neighbor-link** toggles. Optional edge arrowheads.
5. **Surface the InPhO modes** already in the DB (related / influence / timeline). The
   timeline mode (lay nodes out by birth/death year on an x-axis instead of force) is a
   standout feature and is mostly a layout function, not new data.
6. **"Color by" modes**: read-state (what we have) / SEP category / degree — selectable,
   not fixed.

**Phase 3 — only if live physics is wanted (and only then).**
7. Replace the hand-rolled `forceLayout` with **`d3-force`** (pure JS, ~small, runs fine in
   RN — it only computes x/y). Drive positions into **Reanimated shared values** so a node
   drag *reheats alpha* and the graph re-settles **without re-rendering the React tree**
   (per-tick `setState` on SVG is the thing that would tank FPS). Cap the local graph at
   ~150 nodes.

**Explicitly NOT recommended now:** a global corpus graph, a Skia rewrite, or Barnes–Hut.
All are premature — they only pay off for a global thousands-node view we have neither the
data nor the product need for. Revisit Skia + quadtree *only if* a global graph becomes a
real requirement (it would be a rewrite, not a tweak).

The smallest shippable win that closes most of the "feels idiomatic" gap is **Phase 1
alone**: zoom + neighbor-highlight + degree sizing, all on dependencies we already ship.

## Sources

- [Graph view — Obsidian Help](https://obsidian.md/help/plugins/graph)
- [Graph View — obsidianmd/obsidian-help (DeepWiki)](https://deepwiki.com/obsidianmd/obsidian-help/4.5-graph-view)
- [Local Graph: What are Neighbor Links — Obsidian Forum](https://forum.obsidian.md/t/local-graph-what-are-neighbor-links/6954)
- [5 features of Obsidian Graph View and how I use them](https://www.sivwuk.com/5-features-of-obsidian-graph-view-and-how-i-use-them/)
- [Graph view, physics, and force directed graphs — Obsidian Forum](https://forum.obsidian.md/t/graph-view-physics-and-force-directed-graphs/72586)
- [d3/d3-force (velocity Verlet, Barnes–Hut quadtree, alpha decay)](https://github.com/d3/d3-force)
- [D3 Force-Directed Layout — AntV G6 docs (link/center/collision/radial forces)](https://g6.antv.antgroup.com/en/manual/layout/d3-force-layout)
- [Comparing RoamResearch graph-view with Logseq and Obsidian](https://alvistor.com/comparing-roamresearch-graph-view-with-logseq-obsidian-and-others/)
- [Visualizing Graphs With WebGL and KeyLines — Cambridge Intelligence](https://cambridge-intelligence.com/visualizing-graphs-webgl/)
- [Very slow performance with large (local) graph — Logseq](https://discuss.logseq.com/t/very-slow-performance-with-large-local-graph/1484)
</content>
</invoke>
