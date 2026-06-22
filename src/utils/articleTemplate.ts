import { SEP_CSS, SEP_JS } from './injectedAssets';

export interface ArticleData {
  slug: string;
  title: string;
  tocHtml: string;
  contentHtml: string;
  preambleHtml: string;
}

export function buildArticleHtml(article: ArticleData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(article.title)}</title>
<style>
${SEP_CSS}
/* App-specific overrides */
body { margin: 0; padding: 0; font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif; }
#sep-floating-search form { action: none; }
.sep-anchor-link { display: none !important; }
</style>
</head>
<body>
<div id="header-wrapper">
  <div id="header">
    <div id="branding"><div id="site-title"><span class="pagetitle"></span></div></div>
    <div id="search"><form><input type="search" name="query" placeholder="Search SEP…"></form></div>
  </div>
</div>
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
<script>
// Intercept SEP search form submission — no-op in local context
document.querySelector('#search form')?.addEventListener('submit', e => e.preventDefault());
</script>
<script>${SEP_JS}</script>
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
