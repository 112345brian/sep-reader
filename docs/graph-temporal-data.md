# Architectural finding — temporal/entity data for the graph view

Status: **Accepted, amended 2026-06-23** · Date: 2026-06-23

> **Amendment (2026-06-23).** Two decisions below are superseded by implementation:
> - **Decision #4 (build-time static asset) is REVERSED → per-client runtime fetch.**
>   Emitting a bundled asset *redistributes* the CC BY-NC-SA InPhO data inside the
>   APK, which imposes non-commercial + share-alike obligations on the app and
>   freezes the data until each app update. Instead the client fetches from
>   inphoproject.org at runtime and caches in SQLite (same model as SEP article
>   content) — no redistribution, license-clean, stays fresh. See
>   [`src/services/inpho.ts`](../src/services/inpho.ts) +
>   `inpho_nodes` / `inpho_relations` tables in [`db.ts`](../src/services/db.ts).
> - **Scope widened from temporal-only → three graph views**, all fed by the same
>   per-client InPhO fetch:
>   1. **Related** — related ideas + related thinkers (relatedness neighbourhood).
>   2. **Timeline** — thinkers ordered by `birth.year` (the original intent here).
>   3. **Influence** — directional `teachers`/`students`/`influenced`/`influenced_by` DAG.
>   Related + Influence come free from the one detail record already fetched per
>   entry; Timeline needs each neighbour thinker's detail (dates), fetched lazily
>   and cached.

## Question

Can the graph view ([`src/screens/GraphScreen.tsx`](../src/screens/GraphScreen.tsx)) be
ordered **temporally** — e.g. so a reader views Aristotle *after* Plato — and is the
underlying data (philosopher entities + their names + dates) available from "the OWL"
(the InPhO ontology)?

## What we have today

Two graph systems coexist:

**1. Article cross-link graph (live in the UI).**
[`GraphScreen.tsx`](../src/screens/GraphScreen.tsx) calls `getArticleLinkGraph()`, which
returns nodes/edges from the link index
([`scripts/buildLinkIndex.js`](../scripts/buildLinkIndex.js) →
[`src/assets/linkMapData.ts`](../src/assets/linkMapData.ts)). The seed
([`src/assets/entry-seed.json`](../src/assets/entry-seed.json), 1838 entries) is **only**
`{ slug, title }`. Philosophers appear solely as article titles — no entity type, no dates.

**2. InPhO semantic graph subsystem (built, NOT yet wired into the UI).**
[`src/services/inpho.ts`](../src/services/inpho.ts) + tables `inpho_nodes` /
`inpho_relations` in [`src/services/db.ts`](../src/services/db.ts) already implement:

- `syncInphoIndex()` — downloads `/idea.json` + `/thinker.json`, stores
  `{ id, kind, label, sep_dir }` per node (the name + slug join — **no dates**).
- `getSemanticGraph(slug)` → `fetchRelations()` → `buildSemanticGraph()` — resolves an
  entry's InPhO node, lazily fetches its detail record (cached in `inpho_relations`), and
  builds a center→neighbors star graph of related ideas/thinkers that exist in our corpus,
  kind-coded (`'entry' | 'idea' | 'thinker'`).

Two gaps that matter for the temporal goal:

- **`GraphScreen` does not call `getSemanticGraph` yet** — it still uses the cross-link
  graph. The semantic graph is reachable code but unsurfaced.
- **Dates are fetched and then discarded.** `fetchRelations()` already GETs
  `/thinker/{id}.json` (and `/idea/{id}.json`) — the exact payload that carries `birth` /
  `death` — but extracts only `related` / `related_ideas` / `related_thinkers`. The
  temporal data passes through our code and is thrown away. No schema column stores it.

## The OWL = InPhO (Internet Philosophy Ontology)

[InPhO](https://www.inphoproject.org/) is the only ontology covering the SEP. It models a
`thinker` entity type and publishes a monthly OWL archive **plus** a JSON REST API. We
pulled local dumps into [`.audit/inpho/`](../.audit/inpho/) (`thinker.json`, `idea.json`).

### Two endpoint shapes — this is the crucial distinction

| Source | Fields per thinker | Has dates? |
|---|---|---|
| **Bulk list dump** (`.audit/inpho/thinker.json`, `responseData.results`) | `wiki, url, sep_dir, label, type, ID` | **No** |
| **Per-thinker detail** (`/thinker/<id>.json`) | adds `birth`, `death`, `birth_strings`, `nationalities`, `professions`, `teachers`, `students`, `influenced`, `influenced_by`, `related_thinkers`, `related_ideas` | **Yes** |

Detail-endpoint dates are *structured and sortable* (BCE = negative year):

```json
"birth": [{"month": 5, "day": 21, "year": -427}],
"death": [{"month": 1, "day": 14, "year": -347}]
```

### The join key

Every thinker carries `sep_dir`, which **is our SEP slug** — a clean 1:1 join, no fuzzy
matching. Measured against our actual seed:

- 1816 thinkers in the bulk dump
- 465 carry a `sep_dir`
- **462 of those match a real `entry-seed.json` slug** (e.g. `Theodor Adorno → adorno`,
  `Albertus Magnus → albert-great`)

So ~462 of our articles can be enriched into dated, related thinker entities.

## Decision

1. **Use InPhO, not a hand-built dataset.** Names + relations + dates all exist and join
   on `sep_dir`.
2. **Source from the JSON API, not the OWL/RDF dump.** Same data without RDF parsing, and
   the dump we already have is sufficient for the name/slug join.
3. **Temporal ordering is a *data attribute*, not an ontology axiom.** Order by
   `birth.year` (with `influenced`/`teachers`/`students` available as a richer
   causal/influence DAG if pure dates prove too coarse).
4. **Dates require the detail endpoint.** The bulk dump has names only; fetching dates
   means ~462 per-thinker calls (one-time, at build time — mirror the
   `buildLinkIndex.js` pattern and emit a static asset).
5. **Plan a date fallback.** InPhO's biographical dates were originally seeded from
   Freebase (now defunct). Canonical figures (Plato, Aristotle) are clean; expect gaps for
   minor/contemporary thinkers. Fallback: Wikidata `P569`/`P570`, reachable via InPhO's
   existing Wikipedia/Wikidata cross-links.

## Why not the alternatives

- **Parse the OWL archive** — RDF tooling overhead for data the JSON API already exposes.
- **Hand-curate dates** — 462+ entries, unmaintainable, duplicates InPhO.
- **Wikidata as primary** — viable, but no SEP-slug join key; InPhO's `sep_dir` is the
  reason to make it primary and Wikidata the fallback.

## Recommended next steps

The infrastructure largely exists; the work is capturing dates and surfacing the semantic
graph. In dependency order:

1. **Wire `GraphScreen` to the semantic graph.** Switch (or add a toggle) from
   `getArticleLinkGraph` to `getSemanticGraph`. Until this happens, none of the InPhO work
   is visible. Cheapest, highest-visibility step.

2. **Stop discarding dates — capture them where they already flow.** In
   `fetchRelations()` ([`inpho.ts`](../src/services/inpho.ts)) the detail payload `d`
   already contains `birth` / `death`. Persist them when present. Add `birth_year` /
   `death_year` columns to `inpho_nodes` (nullable; BCE = negative) and write them through.
   *Near-zero marginal cost — no new network calls for the center node.*

3. **Backfill neighbor dates for ordering.** A center's neighbors are resolved from
   `inpho_nodes` (no dates), so step 2 alone only dates the focused node. To order/colour a
   whole graph you need neighbor dates. Two options:
   - **One-time enrichment (recommended):** a build-time
     `scripts/buildThinkerDates.js` that fetches `/thinker/{id}.json` for the ~462
     SEP-linked thinkers and bakes `{ id, birth_year, death_year }` into a static asset
     loaded at `syncInphoIndex()` time. Bounded, offline-friendly, no per-use latency.
   - **Lazy:** fetch neighbor detail on demand and cache. Simpler, but adds latency the
     first time each graph is opened.

4. **Temporal layout/affordance.** With dates available, add an ordered mode to
   `forceLayout` (e.g. map `birth_year` → x-axis, or sort siblings left→right by birth) so
   "view Aristotle after Plato" is literally how the graph reads.

5. **Date-coverage fallback.** InPhO dates trace to Freebase (defunct) — gaps expected for
   minor/contemporary thinkers. Fall back to Wikidata `P569`/`P570` via InPhO's existing
   Wikipedia/Wikidata cross-links, or degrade gracefully (undated nodes off-axis).
