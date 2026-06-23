// Shared source readers for the mockup-spec audit.
// These tests assert that the build's SOURCE encodes each documented UI decision
// from blind-design/MOCKUP_SPEC.md. They read files directly (no RN render), so
// they are deterministic and fast. A failing test = a spec item the build is
// missing or diverging from.

// Use require() + local declares so this helper needs no @types/node.
declare const __dirname: string;
declare function require(mod: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..');

export function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8') as string;
}

export const SRC = {
  home: () => src('src/screens/HomeScreen.tsx'),
  article: () => src('src/screens/ArticleScreen.tsx'),
  toc: () => src('src/components/TocSheet.tsx'),
  graph: () => src('src/screens/GraphScreen.tsx'),
  db: () => src('src/services/db.ts'),
  injected: () => src('src/utils/injectedAssets.ts'),
  annotationJs: () => src('src/utils/annotationJs.ts'),
  readerCss: () => src('src/utils/readerCss.ts'),
  app: () => src('App.tsx'),
  index: () => src('index.js'),
  gradle: () => src('android/gradle.properties'),
};

/** Collapse whitespace so assertions tolerate formatting differences. */
export function flat(s: string): string {
  return s.replace(/\s+/g, ' ');
}
