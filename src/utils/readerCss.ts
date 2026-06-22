// Clean, purpose-built reading CSS for the SEP native app.
// We control the full HTML, so no !important spam or browser-injection hacks needed.
// The injected SEP_JS handles its own UI chrome (progress bar, TOC drawer, etc.).

export const READER_CSS = `
  :root {
    --bg:          #121212;
    --bg-raised:   #1a1a1a;
    --bg-hover:    #222;
    --border:      #2a2a2a;
    --border-mid:  #333;
    --text:        #d0d0d0;
    --text-bright: #e8e8e8;
    --text-muted:  #888;
    --accent:      #7ba4ff;
    --accent-hi:   #a3c1ff;
    --serif:       Georgia, 'Times New Roman', serif;
    --sans:        -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    --toc-width:   260px;
    --side-pad:    18px;
    --max-width:   680px;
    --font-size:   20px;
  }

  /* ── Reset ─────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; }

  html {
    background: var(--bg);
    color: var(--text);
    font-size: var(--font-size);
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    scroll-behavior: smooth;
  }

  body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--serif);
    line-height: 1.75;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Layout ─────────────────────────────────────────── */
  #header-wrapper, #header, #branding, #site-title, #search { display: none; }

  #container, #content { width: 100%; }

  #toc {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: var(--toc-width);
    overflow-y: auto;
    background: var(--bg-raised);
    border-right: 1px solid var(--border);
    padding: 1.25rem 0;
    z-index: 100;
  }

  #article {
    margin-left: var(--toc-width);
    min-height: 100vh;
  }

  #article-content {
    max-width: var(--max-width);
    margin: 0 auto;
    padding: 2rem var(--side-pad) 4rem;
  }

  /* When there's no TOC, article is full-width */
  body:not(:has(#toc)) #article { margin-left: 0; }

  /* ── TOC styles ─────────────────────────────────────── */
  #toc ul {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0;
  }

  #toc ul ul { padding-left: 1rem; }

  #toc li { margin: 0; }

  #toc a {
    display: block;
    padding: 0.3rem 1.25rem;
    color: var(--text-muted);
    text-decoration: none;
    font-family: var(--sans);
    font-size: 0.82rem;
    line-height: 1.45;
    border-left: 2px solid transparent;
    transition: color 0.12s, border-color 0.12s;
  }

  #toc > ul > li > a {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text);
  }

  #toc a:hover { color: var(--accent); }

  #toc a.toc-active {
    color: var(--accent-hi);
    border-left-color: var(--accent);
    font-weight: 500;
  }

  /* Hide SEP's own TOC heading */
  #toc h2:first-child, #toc .toctitle { display: none; }

  /* ── Typography ─────────────────────────────────────── */
  h1, h2, h3, h4, h5, h6 {
    color: var(--text-bright);
    line-height: 1.3;
    margin: 0;
  }

  h1, .pagetitle {
    font-family: var(--serif);
    font-size: 1.85rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 0.5rem;
  }

  h2 {
    font-family: var(--serif);
    font-size: 1.35rem;
    font-weight: 600;
    border-bottom: 1px solid var(--border);
    padding: 2.25rem 0 0.5rem;
    margin-bottom: 1rem;
  }

  h3 {
    font-family: var(--sans);
    font-size: 1rem;
    font-weight: 600;
    padding-top: 1.5rem;
    margin-bottom: 0.5rem;
  }

  h4, h5, h6 {
    font-family: var(--sans);
    font-size: 0.95rem;
    font-weight: 600;
    padding-top: 1rem;
    margin-bottom: 0.35rem;
  }

  p {
    margin: 0 0 1.1em;
    color: var(--text);
  }

  b, strong { font-weight: 700; color: var(--text-bright); }
  em, i { color: var(--text); }

  /* ── Links ──────────────────────────────────────────── */
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; text-decoration-color: var(--accent); }
  a:visited { color: var(--accent); }

  /* External links */
  a[href^="http"]:not([href*="plato.stanford.edu"]) {
    color: var(--accent);
    opacity: 0.85;
  }

  /* ── Lists ──────────────────────────────────────────── */
  ul, ol {
    margin: 0 0 1.1em;
    padding-left: 1.75rem;
  }

  li { margin: 0.2em 0; }
  li > ul, li > ol { margin-bottom: 0; }

  /* ── Bibliography ────────────────────────────────────── */
  #bibliography-section ol,
  ol.bibliography,
  #bibliography ~ ul,
  #bibliography ~ ol,
  .bib,
  div.bibliography {
    list-style: none;
    padding: 0;
  }

  #bibliography-section li,
  ol.bibliography li,
  .bib li {
    margin-bottom: 0.9em;
    padding-left: 1.5rem;
    text-indent: -1.5rem;
    font-size: 0.94rem;
    color: var(--text-muted);
    line-height: 1.6;
  }

  /* ── Blockquotes ─────────────────────────────────────── */
  blockquote {
    margin: 1.25rem 0;
    padding: 0.75rem 1rem 0.75rem 1.25rem;
    border-left: 3px solid var(--border-mid);
    background: var(--bg-raised);
    border-radius: 0 6px 6px 0;
    color: var(--text-muted);
    font-size: 0.97rem;
  }

  blockquote p:last-child { margin-bottom: 0; }

  /* ── Tables ──────────────────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.25rem 0;
    font-size: 0.92rem;
    font-family: var(--sans);
    overflow-x: auto;
    display: block;
  }

  th {
    background: var(--bg-raised);
    color: var(--text-bright);
    font-weight: 600;
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 2px solid var(--border-mid);
  }

  td {
    padding: 0.45rem 0.75rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  tr:hover td { background: var(--bg-hover); }

  /* ── Footnotes ──────────────────────────────────────── */
  .footnotes, div[id^="fn"], #bibliography-notes {
    margin-top: 2rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--border);
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.65;
  }

  sup a, a[href^="#fn"], a[href^="#footnote"] {
    color: var(--accent);
    font-size: 0.75em;
    vertical-align: super;
    text-decoration: none;
    margin-left: 1px;
  }

  /* ── Preamble (author, publication date) ────────────── */
  #preamble {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    font-family: var(--sans);
    font-size: 0.88rem;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.5rem;
  }

  #preamble p { margin: 0.25em 0; }

  /* ── Code / preformatted ─────────────────────────────── */
  code, kbd {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.85em;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.1em 0.35em;
    color: var(--text-bright);
  }

  pre {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    overflow-x: auto;
    font-size: 0.875rem;
    line-height: 1.55;
    margin: 1.25rem 0;
  }

  pre code { background: none; border: none; padding: 0; }

  /* ── Images & figures ────────────────────────────────── */
  img { max-width: 100%; height: auto; border-radius: 4px; }

  figure {
    margin: 1.5rem 0;
    text-align: center;
  }

  figcaption {
    font-family: var(--sans);
    font-size: 0.83rem;
    color: var(--text-muted);
    margin-top: 0.5rem;
  }

  /* ── Utility / SEP-specific elements ─────────────────── */
  /* Hide SEP site chrome that's not relevant in-app */
  #related-entries, #academic-tools, #other-internet-resources,
  #sep-man-links, #nav, .main-nav, #footerwrap { display: none; }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 2rem 0;
  }

  /* Small top buffer so anchor targets aren't flush against the WebView edge */
  [id] { scroll-margin-top: 1rem; }

  /* Title and preamble are rendered natively above the WebView */
  h1.pagetitle, .pagetitle { display: none; }
  #preamble { display: none; }

  /* ── Mobile ─────────────────────────────────────────── */
  @media (max-width: 768px) {
    :root {
      --font-size: 20px;
      --side-pad: 16px;
    }

    /* TOC becomes a fixed left drawer — JS adds .toc-open to slide it in */
    #toc {
      width: min(82vw, 320px);
      transform: translateX(-110%);
      transition: transform 0.26s cubic-bezier(0.4, 0, 0.2, 1);
      border-right: none;
      box-shadow: 4px 0 24px rgba(0,0,0,0.6);
      z-index: 1004;
    }

    #toc.toc-open { transform: translateX(0); }

    #article {
      margin-left: 0;
      padding-top: 0.75rem;
    }

    #article-content {
      max-width: 100%;
      padding-left: var(--side-pad);
      padding-right: var(--side-pad);
    }

    h1, .pagetitle {
      font-size: 1.45rem;
      letter-spacing: -0.01em;
    }

    h2 {
      font-size: 1.2rem;
      padding-top: 1.75rem;
    }

    table { font-size: 0.85rem; }

    blockquote { margin: 1rem 0; }
  }
`;
