import { READER_CSS } from './readerCss';
import { SEP_JS } from './injectedAssets';
import { ANNOTATION_JS } from './annotationJs';

export interface ArticleData {
  slug: string;
  title: string;
  tocHtml: string;
  contentHtml: string;
  preambleHtml: string;
  customCss?: string;
  fontSize?: number; // px, overrides --font-size variable
}

export function buildArticleHtml(article: ArticleData): string {
  const fontOverride = article.fontSize
    ? `:root { --font-size: ${article.fontSize}px; }`
    : '';
  const customBlock = article.customCss?.trim()
    ? `<style id="user-css">${article.customCss}</style>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(article.title)}</title>
<style>${READER_CSS}${fontOverride}</style>
${customBlock}
</head>
<body>
<div id="container">
  <div id="content">
    ${article.tocHtml ? `<div id="toc">${article.tocHtml}</div>` : ''}
    <div id="article">
      <div id="article-content">
        <h1 class="pagetitle">${escapeHtml(article.title)}</h1>
        ${article.preambleHtml ? `<div id="preamble">${article.preambleHtml}</div>` : ''}
        <div id="aueditable">${article.contentHtml}</div>
      </div>
    </div>
  </div>
</div>
<script>${SEP_JS}</script>
<script>${ANNOTATION_JS}</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
