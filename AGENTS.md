# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev before writing any code.

# Licensing constraint — fetch, don't bundle

This app's own code is GPL-3.0. **Third-party content is not ours to redistribute.**
The release artifact ships the *tool*; it never ships the *content*. See `NOTICE.md`.

Before adding any bundled asset (anything under `src/assets/`, or any file baked into
the build), confirm it contains **none** of the following:

- **SEP article text** (© Metaphysics Research Lab, Stanford University; not openly
  licensed). Articles are fetched on-device at runtime — never bundled or hosted by us.
  This includes derivatives: e.g. SVGs/MathML pre-rendered from SEP equations are still
  SEP-derived and must not ship as bundled assets. Generate them on-device from
  fetched content instead.
- **InPhO data** (CC BY-NC-SA). Emitting it as a bundled asset *redistributes* it under
  a license that is non-commercial + share-alike (incompatible with shipping it freely);
  query/derive it at runtime instead. See `docs/graph-temporal-data.md`.

Allowed to ship: app code, our own CSS/JS, the entry **title/link index** (slugs +
titles — facts), and an **empty** SQLite schema.

CI enforces this: `scripts/check-no-bundled-content.js` (workflow
`.github/workflows/no-bundled-content.yml`) fails the build on a tracked `.db`/`.sqlite`
file or an oversized non-allowlisted asset. If you add a legitimate large index file,
add it to the allowlist there — don't widen it to wave content through.
