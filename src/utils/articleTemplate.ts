import { READER_CSS } from './readerCss';
import { SEP_JS } from './injectedAssets';
import { ANNOTATION_JS } from './annotationJs';

export interface ArticleData {
  slug: string;
  title: string;
  parentLabel?: string | null;
  tocHtml: string;
  contentHtml: string;
  preambleHtml: string;
  customCss?: string;
  fontSize?: number; // px, overrides --font-size variable
  backlinkCount?: number; // ART-19: "N pages link here" row
}

export function buildArticleHtml(article: ArticleData): string {
  const fontOverride = article.fontSize
    ? `:root { --font-size: ${article.fontSize}px; }`
    : '';
  const customBlock = article.customCss?.trim()
    ? `<style id="user-css">${article.customCss}</style>`
    : '';

  // ART-19: backlinks row at the end of the article (taps post a message to RN).
  const n = article.backlinkCount ?? 0;
  const backlinksRow = n > 0
    ? `<div class="backlinks-row" onclick="window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'backlinks'}))">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
         <span>${n} page${n === 1 ? '' : 's'} link here</span>
         <span class="backlinks-badge">${n}</span>
       </div>`
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
        ${article.parentLabel ? `<span class="entry-breadcrumb">${escapeHtml(article.parentLabel)}</span>` : ''}
        <h1 class="pagetitle">${escapeHtml(article.title)}</h1>
        ${article.preambleHtml && !article.contentHtml.includes('id="preamble"') ? `<div id="preamble">${article.preambleHtml}</div>` : ''}
        <div id="aueditable">${article.contentHtml}</div>
      </div>
      ${backlinksRow}
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
