// Generated from sep_modern_companion.js — do not edit manually
export const SEP_JS = `
(() => {

    // Ensure mobile media queries fire correctly — SEP has no viewport meta tag
    if (!document.querySelector('meta[name="viewport"]')) {
        const vp = document.createElement('meta');
        vp.name = 'viewport';
        vp.content = 'width=device-width, initial-scale=1';
        document.head.appendChild(vp);
    }

    // =============================================
    // STYLES
    // =============================================
    const style = document.createElement('style');
    style.textContent = \`
        /* Reading time badge */
        #sep-reading-time {
            display: inline-block; font-size: 0.8em; color: #666;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin-top: 0.375em; padding: 0.25em 0.625em; background: #1a1a1a;
            border-radius: 0.25em; border: 1px solid #2a2a2a;
        }

        /* Footnote popup */
        #sep-footnote-popup {
            position: absolute; z-index: 9999; max-width: 26em;
            background: #1a1a1a; border: 1px solid #333; border-radius: 0.5em;
            padding: 0.875em 1em; box-shadow: 0 0.25em 1.25em rgba(0,0,0,0.5);
            font-size: 0.85em; line-height: 1.65; color: #c0c0c0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            pointer-events: none; opacity: 0; transition: opacity 0.15s ease;
        }
        #sep-footnote-popup.visible { opacity: 1; pointer-events: auto; }
        #sep-footnote-popup a { color: #7ba4ff !important; }

        /* Section anchor links (on hover) */
        .sep-anchor-link {
            opacity: 0; margin-left: 0.5em; color: #555 !important;
            text-decoration: none !important; font-size: 0.7em;
            transition: opacity 0.15s ease; cursor: pointer;
            font-weight: 400 !important; vertical-align: middle;
        }
        h2:hover .sep-anchor-link, h3:hover .sep-anchor-link { opacity: 1; }
        .sep-anchor-link:hover { color: #7ba4ff !important; }

        /* Smooth scroll globally */
        html { scroll-behavior: smooth; }

        /* Mobile layout reset + Wikipedia-matched typography */
        @media (max-width: 768px) {
            html {
                scroll-padding-top: 1rem !important;
            }
            [id],
            a[name],
            :target {
                scroll-margin-top: 1rem !important;
            }
            /* TOC drawer */
            #toc {
                top: 0 !important;
                bottom: 0 !important;
                left: 0 !important;
                right: auto !important;
                width: min(82vw, 320px) !important;
                max-width: min(82vw, 320px) !important;
                height: 100dvh !important;
                max-height: 100dvh !important;
                padding: 0 0 1.25rem !important;
                border-radius: 0 16px 16px 0 !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                overscroll-behavior: contain !important;
                touch-action: pan-y !important;
                transform: translateX(-105%) !important;
                transition: transform 0.26s cubic-bezier(0.4, 0, 0.2, 1) !important;
            }
            #toc.toc-open {
                transform: translateX(0) !important;
            }
            #toc > ul {
                flex: 1 1 auto !important;
                overflow-y: auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0.45rem 1rem 5rem !important;
                -webkit-overflow-scrolling: touch !important;
                overscroll-behavior: contain !important;
            }
            #toc li {
                padding: 0 !important;
            }
            #toc ul ul {
                margin: 0.38rem 0 !important;
                padding-left: 1.1rem !important;
            }
            #toc a:link,
            #toc a:visited {
                display: block !important;
                box-sizing: border-box !important;
                min-height: 1.8rem !important;
                padding: 0.28rem 0 !important;
            }
            #sep-toc-panel-header {
                position: relative;
                z-index: 2;
                flex: 0 0 3.25rem;
                display: flex !important;
                align-items: center;
                justify-content: space-between;
                height: 3.25rem;
                padding: 0 0.875rem 0 1rem;
                background: #121212;
                border-bottom: 1px solid #262626;
                backdrop-filter: none;
                -webkit-backdrop-filter: none;
            }
            #sep-toc-panel-title {
                color: #d6d6d6;
                font: 600 0.875rem/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                letter-spacing: 0;
            }
            #sep-toc-panel-close {
                width: 2.25rem;
                height: 2.25rem;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: #aaa;
                font-size: 1.25rem;
                line-height: 1;
                cursor: pointer;
            }
            #sep-toc-panel-close:hover,
            #sep-toc-panel-close:focus-visible {
                color: #d6d6d6;
                background: #242424;
            }
            /* TOC font hierarchy: level 1 > body text, decreasing per level */
            #toc > ul > li > a,
            #toc > ul > li > span {
                font-size: 0.9rem !important;
                font-weight: 500 !important;
                line-height: 1.38 !important;
            }
            #toc > ul > li > ul > li > a {
                font-size: 0.82rem !important;
                font-weight: 400 !important;
                line-height: 1.35 !important;
            }
            #toc > ul > li > ul > li > ul > li > a {
                font-size: 0.78rem !important;
                font-weight: 400 !important;
                line-height: 1.35 !important;
            }
        }

        /* Keyboard nav hint */
        #sep-kb-hint {
            position: fixed; bottom: 1.75em; left: 1.75em; z-index: 9998;
            font-size: 0.7em; color: #444; padding: 0.375em 0.625em;
            background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 0.375em;
            font-family: -apple-system, sans-serif; opacity: 0;
            transition: opacity 0.3s ease; pointer-events: none;
        }
        #sep-kb-hint.visible { opacity: 1; }
        #sep-kb-hint kbd {
            display: inline-block; padding: 0.1em 0.3em; background: #252525;
            border: 1px solid #333; border-radius: 0.2em; font-size: 0.9em;
            font-family: -apple-system, sans-serif; color: #888;
        }

        /* Citation links */
        a.sep-cite-link {
            color: #7ba4ff !important; text-decoration: none !important;
            border-bottom: 1px dotted #555; cursor: pointer;
            transition: border-color 0.15s ease;
        }
        a.sep-cite-link:hover {
            border-bottom-color: #7ba4ff; text-decoration: none !important;
        }

        /* TOC scroll spy */
        #toc a.toc-active {
            color: #8fb1ff !important; font-weight: 500 !important;
            box-shadow: inset 2px 0 #7ba4ff;
            padding-left: 0.6rem !important;
            margin-left: -0.6rem;
        }

        @media (min-width: 769px) {
            #sep-toc-panel-header {
                display: none !important;
            }
        }

        /* Mobile TOC: hamburger button */
        #sep-toc-hamburger {
            position: fixed; bottom: max(1rem, env(safe-area-inset-bottom)); right: 1rem; z-index: 1005;
            min-width: 2.75em; height: 2.5em; border-radius: 8px;
            background: #1a1a1a; border: 1px solid #333; color: #d6d6d6;
            font-size: 0.875em; cursor: pointer;
            display: none; align-items: center; justify-content: center;
            padding: 0 0.95em;
            box-shadow: none;
            transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
        }
        #sep-toc-hamburger:hover { color: #7ba4ff; border-color: #7ba4ff; background: #1e1e1e; }
        #sep-toc-edge-handle {
            display: none;
        }

        /* Mobile TOC: dark backdrop */
        #sep-mobile-backdrop {
            position: fixed; inset: 0; z-index: 1003;
            background: rgba(0,0,0,0.6); opacity: 0; pointer-events: none;
            transition: opacity 0.25s ease;
        }
        #sep-mobile-backdrop.visible { opacity: 1; pointer-events: auto; touch-action: none; }

        @media (max-width: 768px) {
            body > #sep-toc-hamburger { display: none !important; }
            #sep-toc-toggle { display: none !important; }
            #sep-desktop-toc-header { display: none !important; }
            #sep-top-btn { display: none !important; }
            #sep-reading-time { display: none !important; }
            #sep-toc-hamburger.toc-is-open { opacity: 0 !important; pointer-events: none !important; }
            /* Edge handle replaced by native TOC pill — hidden */
            #sep-toc-edge-handle { display: none !important; }
            /* In-WebView reader bar replaced by native app bar — hidden */
            #sep-reader-bar { display: none !important; }

            #toc::before { display: none !important; }
        }

        /* Reader app bar (appears on scroll-up) */
        #sep-reader-bar {
            position: fixed; top: 0; left: 0; right: 0; z-index: 1003;
            height: 48px;
            display: flex; align-items: center; gap: 0.75rem;
            box-sizing: border-box;
            padding: 0 1rem;
            background: #121212;
            border-bottom: 1px solid #2a2a2a;
            box-shadow: none;
            transform: translateY(-100%);
            transition: transform 0.16s ease;
            pointer-events: none;
        }
        #sep-reader-bar.visible {
            transform: translateY(0);
            pointer-events: auto;
        }
        #sep-reader-title {
            display: none;
        }
        #sep-reader-toc-btn {
            position: absolute;
            right: max(1rem, env(safe-area-inset-right));
            top: 8px;
            height: 32px;
            border: 0;
            border-radius: 4px;
            background: transparent;
            color: #9bb8ff;
            font: 600 0.78rem/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            padding: 0 0.35rem;
            cursor: pointer;
        }
        #sep-reader-toc-btn svg { display: none; }
        .sep-reader-btn-label { display: inline; }
        #sep-reader-toc-btn:hover,
        #sep-reader-toc-btn:focus-visible {
            color: #d6d6d6;
            background: #202020;
            outline: none;
        }
        #sep-floating-search {
            position: absolute;
            left: var(--sep-reader-content-left, 50%);
            top: 8px;
            width: var(--sep-reader-content-width, min(48rem, calc(100vw - 2rem)));
            height: 32px;
            box-sizing: border-box;
            display: flex; align-items: center; gap: 0.5em;
            background: #151515;
            border: 1px solid #2f2f2f;
            border-radius: 4px;
            padding: 0 0.65em;
            margin: 0 !important;
        }
        #sep-floating-search:focus-within { outline: none; border-color: #555; }
        #sep-floating-search .sep-fs-icon { color: #555; flex-shrink: 0; display: flex; align-items: center; }
        #sep-floating-search .sep-fs-icon svg { display: block; }
        #sep-floating-search input[type="search"] {
            flex: 1; background: transparent; border: none; outline: none;
            height: 100%; min-height: 0;
            color: #d6d6d6; font-size: 0.9em; line-height: normal;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            -webkit-appearance: none; align-self: center;
            padding: 0; margin: 0;
        }
        #sep-floating-search input[type="search"]::placeholder { color: #444; }
        #sep-floating-search input[type="search"]:focus::placeholder { color: transparent; }
        #sep-floating-search input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; }
        @media (max-width: 768px) {
            #sep-reader-bar {
                height: 48px;
                padding: 0 max(0.75rem, env(safe-area-inset-right)) 0 max(0.75rem, env(safe-area-inset-left));
                gap: 0.5rem;
                transform: translateY(0);
                pointer-events: auto;
            }
            #sep-reader-title {
                display: block;
                flex: 1 1 auto;
                min-width: 0;
                color: #e0e0e0;
                font: 600 1rem/1.2 Georgia, "Times New Roman", serif;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 1rem;
                text-align: left;
                order: 2;
            }
            #sep-reader-toc-btn {
                position: static;
                order: 1;
                flex: 0 0 2.25rem;
                width: 2.25rem;
                height: 2.25rem;
                padding: 0;
                color: #d6d6d6;
                letter-spacing: 0;
            }
            #sep-reader-toc-btn svg { display: block; }
            .sep-reader-btn-label { display: none; }
            #sep-floating-search {
                position: static;
                order: 3;
                flex: 0 0 2rem;
                width: 2rem;
                min-width: 2rem;
                height: 2rem;
                justify-content: center;
                padding: 0;
                border-color: transparent !important;
                background: transparent !important;
            }
            #sep-reader-bar.mobile-search-open #sep-reader-title {
                display: none;
            }
            #sep-reader-bar.mobile-search-open #sep-reader-toc-btn {
                display: none;
            }
            #sep-reader-bar.mobile-search-open #sep-floating-search {
                flex: 1 1 auto;
                width: auto;
                min-width: 0;
                justify-content: flex-start;
                padding: 0 0.65em;
                border-color: #333 !important;
                background: #151515 !important;
            }
            #sep-floating-search input[type="search"] {
                position: absolute;
                width: 1px;
                height: 1px;
                opacity: 0;
                pointer-events: none;
            }
            #sep-reader-bar.mobile-search-open #sep-floating-search input[type="search"] {
                position: static;
                width: auto;
                height: 100%;
                opacity: 1;
                pointer-events: auto;
            }
            #sep-reader-bar.mobile-toc-open {
                transform: translateY(-100%);
                pointer-events: none;
            }
        }

        /* Citation popup */
        #sep-cite-popup {
            position: absolute; z-index: 9999; max-width: 30em; min-width: 17.5em;
            background: #1a1a1a; border: 1px solid #333; border-radius: 0.5em;
            padding: 0.875em 1em; box-shadow: 0 0.25em 1.25em rgba(0,0,0,0.5);
            font-size: 0.85em; line-height: 1.65; color: #c0c0c0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            pointer-events: none; opacity: 0; transition: opacity 0.15s ease;
        }
        #sep-cite-popup.visible { opacity: 1; pointer-events: auto; }
        #sep-cite-popup a { color: #7ba4ff !important; }
        #sep-footnote-popup .sep-cite-label,
        #sep-cite-popup .sep-cite-label {
            font-size: 0.7em; color: #555; text-transform: uppercase;
            letter-spacing: 0.05em; margin-bottom: 0.375em; font-weight: 600;
        }
    \`;
    document.head.appendChild(style);


    // =============================================
    // 1. READING PROGRESS BAR / BACK-TO-TOP — not in the design mockup.
    // Elements are kept as detached (never appended) so downstream
    // references stay valid no-ops, but nothing renders.
    // =============================================
    const progressBar = document.createElement('div');
    const sectionProgressBar = document.createElement('div');
    const sectionTick = document.createElement('div');
    const topBtn = document.createElement('div');


    // =============================================
    // 3. SCROLL HANDLER (progress + back-to-top + toc spy)
    // =============================================
    // Additional scroll callbacks registered by later sections
    const scrollCallbacks = [];

    let ticking = false;
    let lastReportedProgress = -1;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
            progressBar.style.width = \`\${progress}%\`;
            topBtn.classList.toggle('visible', scrollTop > 600);
            for (const cb of scrollCallbacks) cb(scrollTop);

            // Report reading progress to the app (throttled to ~2% steps)
            if (window.ReactNativeWebView && Math.abs(progress - lastReportedProgress) >= 2) {
                lastReportedProgress = progress;
                window.ReactNativeWebView.postMessage(
                    JSON.stringify({ type: 'progress', value: progress / 100 })
                );
            }
            ticking = false;
        });
    });


    // =============================================
    // 4. READING TIME ESTIMATE
    // =============================================
    const article = document.getElementById('aueditable') || document.getElementById('article-content');
    if (article) {
        const text = article.innerText || article.textContent || '';
        const words = text.trim().split(/\s+/).length;
        const minutes = Math.ceil(words / 230);

        const badge = document.createElement('div');
        badge.id = 'sep-reading-time';
        badge.textContent = \`\${words.toLocaleString()} words · ~\${minutes} min read\`;

        const h1 = article.querySelector('h1') || document.querySelector('.pagetitle');
        const preamble = document.getElementById('preamble');
        const insertTarget = preamble || h1;
        if (insertTarget?.parentNode) {
            insertTarget.parentNode.insertBefore(badge, insertTarget.nextSibling);
        }
    }


    // =============================================
    // 5. FOOTNOTE HOVER PREVIEWS
    // =============================================
    const footnotePopup = document.createElement('div');
    footnotePopup.id = 'sep-footnote-popup';
    document.body.appendChild(footnotePopup);

    let hideFootnoteTimeout = null;
    let footnoteHoverToken = 0;
    const footnoteDocCache = new Map();
    const canShowHoverPreview = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const getFootnoteLink = target =>
        target.closest('a[href^="#note-"], a[href*="notes.html#note-"], sup a[href*="#note-"]');

    async function getFootnoteContent(link) {
        const href = link.getAttribute('href');
        if (!href) return null;

        const url = new URL(href, window.location.href);
        const id = url.hash?.slice(1);
        if (!id) return null;

        let targetEl = null;
        if (url.pathname === window.location.pathname) {
            targetEl = document.getElementById(id);
        } else if (url.origin === window.location.origin) {
            const docUrl = \`\${url.origin}\${url.pathname}\${url.search}\`;
            if (!footnoteDocCache.has(docUrl)) {
                footnoteDocCache.set(docUrl, fetch(docUrl)
                    .then(response => response.ok ? response.text() : null)
                    .then(html => html ? new DOMParser().parseFromString(html, 'text/html') : null)
                    .catch(() => null));
            }
            const noteDoc = await footnoteDocCache.get(docUrl);
            targetEl = noteDoc?.getElementById(id);
        }

        return targetEl?.innerHTML || null;
    }

    document.addEventListener('mouseover', async e => {
        if (!canShowHoverPreview()) return;

        const link = getFootnoteLink(e.target);
        if (!link) return;

        const token = ++footnoteHoverToken;
        clearTimeout(hideFootnoteTimeout);

        const content = await getFootnoteContent(link);
        if (token !== footnoteHoverToken) return;
        if (!content || content.length < 5) return;

        footnotePopup.innerHTML = \`<div class="sep-cite-label">Citation</div>\${content}\`;

        const rect = link.getBoundingClientRect();
        const popupWidth = 420;
        let left = rect.left + window.scrollX;
        if (left + popupWidth > window.innerWidth - 20) left = window.innerWidth - popupWidth - 20;
        if (left < 10) left = 10;

        footnotePopup.style.left = \`\${left}px\`;
        footnotePopup.style.top = \`\${rect.top + window.scrollY - 10}px\`;
        footnotePopup.classList.add('visible');

        // Adjust upward after render so it appears above
        requestAnimationFrame(() => {
            const popupHeight = footnotePopup.offsetHeight;
            footnotePopup.style.top = \`\${rect.top + window.scrollY - popupHeight - 8}px\`;
        });
    });

    document.addEventListener('mouseout', e => {
        const link = getFootnoteLink(e.target);
        if (!link) return;
        footnoteHoverToken++;
        hideFootnoteTimeout = setTimeout(() => footnotePopup.classList.remove('visible'), 200);
    });

    footnotePopup.addEventListener('mouseover', () => clearTimeout(hideFootnoteTimeout));
    footnotePopup.addEventListener('mouseout', () => {
        hideFootnoteTimeout = setTimeout(() => footnotePopup.classList.remove('visible'), 200);
    });


    // =============================================
    // 6. SECTION ANCHOR LINKS (click to copy)
    // =============================================
    // SEP headings use <h2><a name="..."> rather than <h2 id="...">
    const headings = [...document.querySelectorAll(
        '#aueditable h2, #aueditable h3, #article-content h2, #article-content h3'
    )].filter(h => h.id || h.querySelector('a[name]'));

    for (const h of headings) {
        const hId = h.id || h.querySelector('a[name]')?.name || '';
        const anchor = document.createElement('a');
        anchor.className = 'sep-anchor-link';
        anchor.href = \`#\${hId}\`;
        anchor.textContent = '¶';
        anchor.title = 'Copy link to section';
        anchor.addEventListener('click', e => {
            e.preventDefault();
            const url = \`\${location.origin}\${location.pathname}\${e.currentTarget.getAttribute('href')}\`;
            navigator.clipboard?.writeText(url);
            const orig = e.currentTarget.textContent;
            e.currentTarget.textContent = '✓';
            e.currentTarget.style.color = '#7ba4ff';
            setTimeout(() => {
                e.currentTarget.textContent = orig;
                e.currentTarget.style.color = '';
            }, 1200);
        });
        h.appendChild(anchor);
    }


    // =============================================
    // 7. CITATION LINKING & POPUPS
    // =============================================

    // Step 1: Index the bibliography entries
    const bibEntries = {};

    let bibSection = null;
    for (const h2 of document.querySelectorAll('h2')) {
        const txt = h2.textContent.trim().toLowerCase();
        if (txt === 'bibliography' || txt === 'references' ||
            txt.startsWith('bibliography') || txt.startsWith('references')) {
            bibSection = h2;
            break;
        }
    }

    const bibEls = [];
    if (bibSection) {
        // Collect all elements between bib heading and next h2
        let nxt = bibSection.nextElementSibling;
        while (nxt && nxt.tagName !== 'H2') {
            if (nxt.tagName === 'UL' || nxt.tagName === 'OL') {
                bibEls.push(...nxt.querySelectorAll('li'));
            } else if (nxt.tagName === 'P' || nxt.tagName === 'LI') {
                bibEls.push(nxt);
            } else if (nxt.tagName === 'DL') {
                bibEls.push(...nxt.querySelectorAll('dd, dt'));
            }
            nxt = nxt.nextElementSibling;
        }

        // Parse each bib entry to extract author-year keys
        // Track base-year keys that collide (e.g. both 2008a and 2008b map to "Clark 2008")
        // so we can delete them rather than silently resolve to the wrong entry.
        const ambiguousBaseKeys = new Set();

        for (const el of bibEls) {
            const elText = el.textContent || '';

            // Match patterns like "Clark, A., 2008a" or "van Gelder, T., 1995"
            const bibMatch = elText.match(/^([A-Z\u00C0-\u024F][a-z\u00C0-\u024F''\-]+(?:\s+(?:van|de|von|du|le|la|el|al|del|der|den|dos|das|di)\s+[A-Z][a-z''\-]+)?)[^0-9]*?((?:19|20)\d{2}[a-z]?)/);
            if (!bibMatch) continue;

            const authorLast = bibMatch[1].trim();
            const year = bibMatch[2].trim();
            const key = \`\${authorLast} \${year}\`;
            const entry = { element: el, html: el.innerHTML, text: elText.trim() };
            bibEntries[key] = entry;

            // Also store without the letter suffix for fuzzy matching, but mark as
            // ambiguous if two lettered entries share the same base year.
            const yearBase = year.replace(/[a-z]$/, '');
            if (yearBase !== year) {
                const baseKey = \`\${authorLast} \${yearBase}\`;
                if (bibEntries[baseKey]) {
                    ambiguousBaseKeys.add(baseKey);
                } else {
                    bibEntries[baseKey] = entry;
                }
            }

            // Index additional authors (e.g. "Clark, A. and Chalmers, D., 1998")
            const coAuthorRx = /\band\s+([A-Z\u00C0-\u024F][a-z\u00C0-\u024F''\-]+)/g;
            let coMatch;
            while ((coMatch = coAuthorRx.exec(elText)) !== null) {
                const coLast = coMatch[1].trim();
                const coKey = \`\${coLast} \${year}\`;
                bibEntries[coKey] ??= entry;
                if (yearBase !== year) {
                    const coBaseKey = \`\${coLast} \${yearBase}\`;
                    if (bibEntries[coBaseKey]) {
                        ambiguousBaseKeys.add(coBaseKey);
                    } else {
                        bibEntries[coBaseKey] = entry;
                    }
                }
            }
        }

        for (const k of ambiguousBaseKeys) delete bibEntries[k];
    }

    // Step 2: Find and linkify citations in the article body
    const articleBody = document.getElementById('aueditable') || document.getElementById('article-content');
    if (articleBody && Object.keys(bibEntries).length > 0) {

        const escRx = str => str.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');

        const uniqueAuthors = [...new Set(Object.keys(bibEntries).map(k => k.split(' ')[0]))];
        const authorPattern = uniqueAuthors.map(escRx).join('|');
        // Match: "Clark (2008a)" or "Clark 2008a" or "Clark, 2008a"
        const citeRegex = new RegExp(\`(\${authorPattern})\\s*(?:\\(\\s*)?((?:19|20)\\d{2}[a-z]?)(?:\\s*\\))?\`, 'g');

        const bibElSet = new Set(bibEls);

        function walkTextNodes(root, callback) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const p = node.parentElement;
                    if (!p) return NodeFilter.FILTER_REJECT;
                    // Skip if inside a link, heading, script, style, or the bib section itself
                    if (p.closest('a, h1, h2, h3, h4, h5, h6, script, style, #sep-reading-time')) return NodeFilter.FILTER_REJECT;
                    if (bibSection) {
                        let ancestor = node.parentElement;
                        while (ancestor) {
                            if (bibElSet.has(ancestor)) return NodeFilter.FILTER_REJECT;
                            ancestor = ancestor.parentElement;
                        }
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            });

            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            // Process in reverse to preserve indices
            for (let i = nodes.length - 1; i >= 0; i--) callback(nodes[i]);
        }

        walkTextNodes(articleBody, textNode => {
            const text = textNode.textContent;
            citeRegex.lastIndex = 0;
            const parts = [];
            let lastIdx = 0;
            let match;

            while ((match = citeRegex.exec(text)) !== null) {
                const key = \`\${match[1]} \${match[2]}\`;
                const entry = bibEntries[key] ?? bibEntries[\`\${match[1]} \${match[2].replace(/[a-z]$/, '')}\`];
                if (!entry) continue;

                if (match.index > lastIdx) {
                    parts.push(document.createTextNode(text.slice(lastIdx, match.index)));
                }

                const link = document.createElement('a');
                link.className = 'sep-cite-link';
                link.textContent = match[0];
                link.href = '#';
                link.setAttribute('data-cite-key', key);
                link.addEventListener('click', e => {
                    e.preventDefault();
                    entry.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Flash highlight
                    entry.element.style.transition = 'background-color 0.3s ease';
                    entry.element.style.backgroundColor = 'rgba(123,164,255,0.15)';
                    entry.element.style.borderRadius = '4px';
                    setTimeout(() => { entry.element.style.backgroundColor = ''; }, 2000);
                });

                parts.push(link);
                lastIdx = match.index + match[0].length;
            }

            if (parts.length > 0) {
                if (lastIdx < text.length) parts.push(document.createTextNode(text.slice(lastIdx)));
                const frag = document.createDocumentFragment();
                for (const part of parts) frag.appendChild(part);
                textNode.parentNode.replaceChild(frag, textNode);
            }
        });
    }

    // Citation popup on hover
    const citePopup = document.createElement('div');
    citePopup.id = 'sep-cite-popup';
    document.body.appendChild(citePopup);

    let hideCiteTimeout = null;

    document.addEventListener('mouseover', e => {
        if (!canShowHoverPreview()) return;

        const link = e.target.closest('a.sep-cite-link');
        if (!link) return;

        const key = link.getAttribute('data-cite-key');
        const entry = bibEntries[key] ?? bibEntries[key?.replace(/[a-z]$/, '')];
        if (!entry) return;

        clearTimeout(hideCiteTimeout);
        citePopup.innerHTML = \`<div class="sep-cite-label">Bibliography</div>\${entry.html}\`;

        const rect = link.getBoundingClientRect();
        const popupWidth = 480;
        let left = rect.left + window.scrollX;
        if (left + popupWidth > window.innerWidth - 20) left = window.innerWidth - popupWidth - 20;
        if (left < 10) left = 10;

        citePopup.style.left = \`\${left}px\`;
        citePopup.style.top = \`\${rect.top + window.scrollY - 10}px\`;
        citePopup.classList.add('visible');

        requestAnimationFrame(() => {
            const h = citePopup.offsetHeight;
            const proposedTop = rect.top + window.scrollY - h - 8;
            // If it would go above viewport, show below instead
            citePopup.style.top = proposedTop < window.scrollY + 10
                ? \`\${rect.bottom + window.scrollY + 8}px\`
                : \`\${proposedTop}px\`;
        });
    });

    document.addEventListener('mouseout', e => {
        if (!e.target.closest('a.sep-cite-link')) return;
        hideCiteTimeout = setTimeout(() => citePopup.classList.remove('visible'), 200);
    });

    citePopup.addEventListener('mouseover', () => clearTimeout(hideCiteTimeout));
    citePopup.addEventListener('mouseout', () => {
        hideCiteTimeout = setTimeout(() => citePopup.classList.remove('visible'), 200);
    });


    // =============================================
    // 8. KEYBOARD NAVIGATION
    // =============================================
    const allSections = [...document.querySelectorAll(
        '#aueditable h2, #aueditable h3, #article-content h2, #article-content h3'
    )].filter(h => h.id || h.querySelector('a[name]'));

    const kbHint = document.createElement('div');
    kbHint.id = 'sep-kb-hint';
    kbHint.innerHTML = '<kbd>k</kbd> next &nbsp; <kbd>j</kbd> prev &nbsp; <kbd>h</kbd> top &nbsp; <kbd>l</kbd> bottom';
    document.body.appendChild(kbHint);

    // Show hint briefly on first visit — desktop only
    if (!window.matchMedia('(max-width: 768px)').matches) {
        setTimeout(() => kbHint.classList.add('visible'), 2000);
        setTimeout(() => kbHint.classList.remove('visible'), 7000);
    }

    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.key === 'k' || e.key === 'j') {
            e.preventDefault();
            const scrollY = window.scrollY + 100;
            let currentIdx = -1;

            for (let i = allSections.length - 1; i >= 0; i--) {
                if (allSections[i].getBoundingClientRect().top + window.scrollY <= scrollY) {
                    currentIdx = i;
                    break;
                }
            }

            const nextIdx = e.key === 'k'
                ? Math.min(currentIdx + 1, allSections.length - 1)
                : Math.max(currentIdx - 1, 0);

            allSections[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        if (e.key === 'h') {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (e.key === 'l') {
            e.preventDefault();
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        }
    });


    // =============================================
    // 9. ENHANCE BIBLIOGRAPHY — collapsible
    // =============================================
    let bibH2 = null;
    for (const h2 of document.querySelectorAll('h2')) {
        const txt = h2.textContent.trim().toLowerCase();
        if (txt === 'bibliography' || txt === 'references') {
            bibH2 = h2;
            break;
        }
    }

    if (bibH2) {
        const toggleBtn = document.createElement('span');
        toggleBtn.textContent = ' [collapse]';
        toggleBtn.style.cssText = 'font-size: 12px; color: #666; cursor: pointer; font-weight: 400; font-family: -apple-system, sans-serif; margin-left: 8px;';
        bibH2.appendChild(toggleBtn);

        const bibSiblings = [];
        let next = bibH2.nextElementSibling;
        while (next && next.tagName !== 'H2') {
            bibSiblings.push(next);
            next = next.nextElementSibling;
        }

        let bibCollapsed = false;
        toggleBtn.addEventListener('click', e => {
            e.stopPropagation();
            bibCollapsed = !bibCollapsed;
            for (const el of bibSiblings) el.style.display = bibCollapsed ? 'none' : '';
            toggleBtn.textContent = bibCollapsed ? ' [expand]' : ' [collapse]';
        });
    }

    // =============================================
    // 10. TOC SCROLL SPY + TOGGLE
    // =============================================
    const articleTitleEl = document.querySelector('#aueditable h1, #article-content h1, .pagetitle');
    const originalHeader = document.getElementById('header-wrapper');
    const articlePreamble = document.getElementById('preamble');
    const articleTitle = articleTitleEl
        ?.textContent?.trim()
        || document.title.replace(/\s*\(Stanford.*\)$/, '').trim();
    const normalizeReaderTitlePart = text => text?.replace(/\s+/g, ' ').trim() || '';
    const formatReaderTitle = heading => {
        const sectionTitle = normalizeReaderTitlePart(heading);
        return sectionTitle ? \`\${articleTitle} > \${sectionTitle}\` : articleTitle;
    };
    let pendingReaderHeading = '';
    let updateReaderTitle = heading => {
        pendingReaderHeading = normalizeReaderTitlePart(heading);
    };
    let mobileTocOpen = false;
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const isMobileViewport = () => window.innerWidth <= 768;
    const toc = document.getElementById('toc');
    let tocOpen = true;
    let openMobileToc = () => {};
    let closeMobileToc = () => {};
    let toggleDesktopToc = () => {};
    let updateTocPosition = () => {};
    let edgeHandle = null;
    if (toc) {
        const tocLinks = [...toc.querySelectorAll('a[href^="#"]')];
        // SEP uses <a name="..."> anchors, not id attributes on headings
        const tocSections = tocLinks
            .map(link => {
                const id = link.getAttribute('href').slice(1);
                const target = document.getElementById(id) ?? document.querySelector(\`a[name="\${CSS.escape(id)}"]\`);
                return { link, target };
            })
            .filter(s => s.target);
        let manualTocSection = null;
        let manualTocActiveUntil = 0;
        const setActiveTocLink = link => {
            for (const { link: tocLink } of tocSections) tocLink.classList.remove('toc-active');
            link?.classList.add('toc-active');
        };
        const getAnchorScrollOffset = () => {
            if (isMobileViewport()) return 72;
            const readerVisible = document.getElementById('sep-reader-bar')?.classList.contains('visible') ?? false;
            return readerVisible ? 72 : 56;
        };

        // Desktop sidebar toggle button (←/→)
        const tocToggleBtn = document.createElement('button');
        tocToggleBtn.id = 'sep-toc-toggle';
        tocToggleBtn.title = 'Hide table of contents';
        tocToggleBtn.textContent = 'hide';
        const desktopTocHeader = document.createElement('div');
        desktopTocHeader.id = 'sep-desktop-toc-header';
        const desktopTocTitle = document.createElement('div');
        desktopTocTitle.id = 'sep-desktop-toc-title';
        desktopTocTitle.textContent = 'Contents';
        desktopTocHeader.append(desktopTocTitle, tocToggleBtn);
        toc.prepend(desktopTocHeader);

        // Mobile hamburger button (☰)
        const hamburgerBtn = document.createElement('button');
        hamburgerBtn.id = 'sep-toc-hamburger';
        hamburgerBtn.type = 'button';
        hamburgerBtn.textContent = 'Contents';
        hamburgerBtn.title = 'Show table of contents';
        hamburgerBtn.setAttribute('aria-label', 'Show table of contents');
        hamburgerBtn.setAttribute('aria-controls', 'toc');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        document.body.appendChild(hamburgerBtn);

        edgeHandle = document.createElement('button');
        edgeHandle.id = 'sep-toc-edge-handle';
        edgeHandle.type = 'button';
        edgeHandle.title = 'Show table of contents';
        edgeHandle.setAttribute('aria-label', 'Show table of contents');
        edgeHandle.setAttribute('aria-controls', 'toc');
        edgeHandle.setAttribute('aria-expanded', 'false');
        document.body.appendChild(edgeHandle);

        const tocPanelHeader = document.createElement('div');
        tocPanelHeader.id = 'sep-toc-panel-header';
        const tocPanelTitle = document.createElement('div');
        tocPanelTitle.id = 'sep-toc-panel-title';
        tocPanelTitle.textContent = 'Contents';
        const tocPanelClose = document.createElement('button');
        tocPanelClose.id = 'sep-toc-panel-close';
        tocPanelClose.type = 'button';
        tocPanelClose.textContent = '×';
        tocPanelClose.title = 'Close table of contents';
        tocPanelClose.setAttribute('aria-label', 'Close table of contents');
        tocPanelHeader.append(tocPanelTitle, tocPanelClose);
        toc.prepend(tocPanelHeader);

        // Mobile backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'sep-mobile-backdrop';
        document.body.appendChild(backdrop);

        tocOpen = true;        // desktop: sidebar visible?
        const pageHeader = document.getElementById('header-wrapper');
        const pageArticle = document.getElementById('article');
        const headerWrapper = document.getElementById('header-wrapper');

        // Desktop: update TOC and button positions to track header
        updateTocPosition = () => {
            if (isMobileViewport()) return;
            const headerBottom = headerWrapper ? headerWrapper.getBoundingClientRect().bottom : 0;
            const readerVisible = document.getElementById('sep-reader-bar')?.classList.contains('visible') ?? false;
            const readerBottom = readerVisible ? 48 : 0;
            const top = Math.max(10, headerBottom > 0 ? headerBottom + 10 : 10, readerBottom + 10);
            toc.style.setProperty('top', \`\${top}px\`, 'important');
            toc.style.setProperty('max-height', \`calc(100vh - \${top + 10}px)\`, 'important');
            topBtn.style.top = \`\${top + 44}px\`;
        };

        // Mobile: open/close bottom sheet — layout controlled by Stylus @media rules
        // Scroll lock: overflow:hidden for Chrome/Safari; touch-action:none on the backdrop
        // handles Firefox Android (backdrop covers full viewport at z-index below TOC,
        // so the compositor blocks scroll on background touches while TOC stays scrollable).
        openMobileToc = () => {
            if (!isMobileViewport()) return;
            mobileTocOpen = true;
            readerBarWasVisible = fsVisible;
            requestAnimationFrame(() => toc.classList.add('toc-open'));
            backdrop.classList.add('visible');
            hamburgerBtn.classList.add('toc-is-open');
            edgeHandle?.classList.add('is-hidden');
            hamburgerBtn.title = 'Hide table of contents';
            hamburgerBtn.setAttribute('aria-label', 'Hide table of contents');
            hamburgerBtn.setAttribute('aria-expanded', 'true');
            edgeHandle?.setAttribute('aria-expanded', 'true');
            readerBar?.classList.remove('visible');
            readerBar?.classList.add('mobile-toc-open');
            fsVisible = false;
            document.body.style.setProperty('overflow', 'hidden', 'important');
            document.documentElement.style.setProperty('overflow', 'hidden', 'important');
        };
        closeMobileToc = () => {
            mobileTocOpen = false;
            toc.classList.remove('toc-open');
            toc.style.removeProperty('padding-top');
            backdrop.classList.remove('visible');
            readerBar?.classList.remove('mobile-toc-open');
            if (readerBarWasVisible) {
                readerBar?.classList.add('visible');
                fsVisible = true;
                readerBarWasVisible = false;
            }
            hamburgerBtn.classList.remove('toc-is-open');
            edgeHandle?.classList.remove('is-hidden');
            hamburgerBtn.textContent = 'Contents';
            hamburgerBtn.title = 'Show table of contents';
            hamburgerBtn.setAttribute('aria-label', 'Show table of contents');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
            edgeHandle?.setAttribute('aria-expanded', 'false');
            document.body.style.removeProperty('overflow');
            document.documentElement.style.removeProperty('overflow');
        };

        let tocSwipeStart = null;
        toc.addEventListener('touchstart', event => {
            if (!isMobileViewport() || !mobileTocOpen || event.touches.length !== 1) {
                tocSwipeStart = null;
                return;
            }
            const touch = event.touches[0];
            tocSwipeStart = { x: touch.clientX, y: touch.clientY };
        }, { passive: true });

        toc.addEventListener('touchend', event => {
            if (!tocSwipeStart || !isMobileViewport() || !mobileTocOpen) {
                tocSwipeStart = null;
                return;
            }
            const touch = event.changedTouches[0];
            const dx = touch.clientX - tocSwipeStart.x;
            const dy = touch.clientY - tocSwipeStart.y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            tocSwipeStart = null;
            if (dx < -48 && absDx > absDy * 1.4) closeMobileToc();
        }, { passive: true });

        toc.addEventListener('touchcancel', () => {
            tocSwipeStart = null;
        }, { passive: true });

        // Enter/exit mobile layout mode
        const enterMobileMode = () => {
            toc.classList.add('toc-mobile');
            toc.classList.remove('toc-open');
            desktopTocHeader.style.setProperty('display', 'none', 'important');
            toc.scrollTop = 0;
            toc.style.removeProperty('padding-top');
            // Clear any desktop inline styles — Stylus @media rules take over layout
            toc.style.removeProperty('display');
            toc.style.removeProperty('top');
            toc.style.removeProperty('max-height');
            document.body.appendChild(tocToggleBtn);
            pageHeader?.style.removeProperty('padding-left');
            pageArticle?.style.removeProperty('margin-left');
            pageArticle?.style.removeProperty('width');
            pageArticle?.style.removeProperty('max-width');
            document.getElementById('header')?.appendChild(hamburgerBtn);
            backdrop.classList.remove('visible');
            mobileTocOpen = false;
            document.body.style.removeProperty('overflow');
            document.documentElement.style.removeProperty('overflow');
            hamburgerBtn.textContent = 'Contents';
            hamburgerBtn.title = 'Show table of contents';
            hamburgerBtn.setAttribute('aria-label', 'Show table of contents');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
        };
        const exitMobileMode = () => {
            toc.classList.remove('toc-mobile');
            toc.classList.remove('toc-open');
            desktopTocHeader.style.removeProperty('display');
            backdrop.classList.remove('visible');
            mobileTocOpen = false;
            document.body.style.removeProperty('overflow');
            document.documentElement.style.removeProperty('overflow');
            document.body.appendChild(hamburgerBtn);
            toc.style.removeProperty('position');
            toc.style.removeProperty('display');
            if (tocOpen) {
                desktopTocHeader.append(tocToggleBtn);
                pageHeader?.style.setProperty('padding-left', '260px', 'important');
                pageArticle?.style.setProperty('margin-left', '260px', 'important');
                pageArticle?.style.removeProperty('width');
                pageArticle?.style.removeProperty('max-width');
            } else {
                toc.style.setProperty('display', 'none', 'important');
            }
            updateTocPosition();
        };

        // Desktop toggle click
        toggleDesktopToc = () => {
            const savedY = window.scrollY;
            tocOpen = !tocOpen;
            if (tocOpen) {
                toc.style.removeProperty('display');
                desktopTocHeader.append(tocToggleBtn);
                pageHeader?.style.setProperty('padding-left', '260px', 'important');
                pageArticle?.style.setProperty('margin-left', '260px', 'important');
                pageArticle?.style.removeProperty('width');
                pageArticle?.style.removeProperty('max-width');
                pageArticle?.style.removeProperty('padding-left');
                tocToggleBtn.title = 'Hide table of contents';
                tocToggleBtn.textContent = 'hide';
                updateTocPosition();
            } else {
                toc.style.setProperty('display', 'none', 'important');
                document.body.appendChild(tocToggleBtn);
                pageHeader?.style.removeProperty('padding-left');
                pageArticle?.style.setProperty('margin-left', '0', 'important');
                pageArticle?.style.setProperty('width', '100%', 'important');
                pageArticle?.style.setProperty('max-width', '100%', 'important');
                pageArticle?.style.removeProperty('padding-left');
                tocToggleBtn.title = 'Show table of contents';
                tocToggleBtn.textContent = 'Contents';
            }
            requestAnimationFrame(() => updateReaderBarMetrics());
            window.scrollTo({ top: savedY, behavior: 'instant' });
        };
        tocToggleBtn.addEventListener('click', toggleDesktopToc);

        // Mobile hamburger click
        hamburgerBtn.addEventListener('click', () => {
            if (mobileTocOpen) closeMobileToc();
            else openMobileToc();
        });
        edgeHandle.addEventListener('click', openMobileToc);

        // Make tapped TOC targets register before scroll spy settles.
        toc.addEventListener('click', e => {
            const link = e.target.closest('a[href^="#"]');
            if (!link) return;

            manualTocSection = tocSections.find(section => section.link === link) ?? null;
            manualTocActiveUntil = Date.now() + 1200;
            setActiveTocLink(link);
            updateReaderTitle(link.textContent);
            if (manualTocSection) {
                e.preventDefault();
                const targetTop = manualTocSection.target.getBoundingClientRect().top + window.scrollY;
                const top = Math.max(0, targetTop - getAnchorScrollOffset());
                window.history.pushState(null, '', link.getAttribute('href'));
                window.scrollTo({ top, behavior: 'smooth' });
            }

            if (isMobileViewport() && mobileTocOpen) closeMobileToc();
        });
        backdrop.addEventListener('click', closeMobileToc);
        tocPanelClose.addEventListener('click', closeMobileToc);

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && mobileTocOpen) closeMobileToc();
        });

        // Switch modes on resize
        mobileQuery.addEventListener('change', e => {
            if (e.matches) enterMobileMode();
            else exitMobileMode();
        });

        updateTocPosition();
        scrollCallbacks.push(updateTocPosition);
        window.addEventListener('resize', updateTocPosition);

        if (isMobileViewport()) enterMobileMode();

        if (tocSections.length) {
            const updateToc = scrollY => {
                const spyOffset = isMobileViewport() ? 80 : 200;
                const checkY = scrollY + spyOffset;
                let currentIdx = 0;
                for (let i = tocSections.length - 1; i >= 0; i--) {
                    if (tocSections[i].target.getBoundingClientRect().top + scrollY <= checkY) {
                        currentIdx = i;
                        break;
                    }
                }
                let current = tocSections[currentIdx];
                const manualActive = manualTocSection && Date.now() < manualTocActiveUntil;
                if (manualActive) {
                    current = manualTocSection;
                    currentIdx = tocSections.indexOf(manualTocSection);
                }

                if (current) {
                    setActiveTocLink(current.link);
                    updateReaderTitle(current.link.textContent);
                    const tr = toc.getBoundingClientRect();
                    const lr = current.link.getBoundingClientRect();
                    if ((!isMobileViewport() || mobileTocOpen) &&
                        (lr.top < tr.top + 10 || lr.bottom > tr.bottom - 10)) {
                        current.link.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                }

                // Section progress bar
                const sectionTop = current.target.getBoundingClientRect().top + scrollY;
                const next = tocSections[currentIdx + 1];
                const sectionBottom = next
                    ? next.target.getBoundingClientRect().top + scrollY
                    : document.documentElement.scrollHeight;
                const sectionLen = sectionBottom - sectionTop;
                const sectionPct = sectionLen > 0
                    ? Math.min(100, Math.max(0, (scrollY + spyOffset - sectionTop) / sectionLen * 100))
                    : 0;
                sectionProgressBar.style.width = \`\${sectionPct}%\`;
                sectionTick.style.left = \`\${sectionPct}%\`;
            };

            scrollCallbacks.push(updateToc);
            updateToc(window.scrollY);
        }
    }


    // =============================================
    // 12. READER APP BAR (shows on scroll up)
    // =============================================
    // Borrow the existing search form's action + param name so it routes correctly
    const existingForm = document.querySelector('#search form');
    const fsAction = existingForm?.action || 'https://plato.stanford.edu/search/searcher.py';
    const fsParamName = existingForm?.querySelector('input[type="search"]')?.name || 'query';

    const readerBar = document.createElement('div');
    readerBar.id = 'sep-reader-bar';

    const readerTitle = document.createElement('div');
    readerTitle.id = 'sep-reader-title';
    readerTitle.textContent = formatReaderTitle(pendingReaderHeading);
    updateReaderTitle = heading => {
        pendingReaderHeading = normalizeReaderTitlePart(heading);
        readerTitle.textContent = formatReaderTitle(pendingReaderHeading);
    };

    const readerTocBtn = document.createElement('button');
    readerTocBtn.id = 'sep-reader-toc-btn';
    readerTocBtn.type = 'button';
    readerTocBtn.innerHTML = \`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg><span class="sep-reader-btn-label">Contents</span>\`;
    readerTocBtn.setAttribute('aria-label', 'Show table of contents');
    readerTocBtn.setAttribute('aria-controls', 'toc');
    readerTocBtn.setAttribute('aria-expanded', 'false');

    const floatingSearch = document.createElement('form');
    floatingSearch.id = 'sep-floating-search';
    floatingSearch.action = fsAction;
    floatingSearch.method = 'get';

    const fsIcon = document.createElement('span');
    fsIcon.className = 'sep-fs-icon';
    fsIcon.innerHTML = \`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>\`;

    const fsInput = document.createElement('input');
    fsInput.type = 'search';
    fsInput.name = fsParamName;
    fsInput.placeholder = articleTitle;
    fsInput.autocomplete = 'off';
    fsInput.spellcheck = false;

    floatingSearch.append(fsIcon, fsInput);
    readerBar.append(readerTitle, floatingSearch, readerTocBtn);
    document.body.appendChild(readerBar);

    floatingSearch.addEventListener('click', event => {
        if (!isMobileViewport() || readerBar.classList.contains('mobile-search-open')) return;
        event.preventDefault();
        readerBar.classList.add('mobile-search-open');
        edgeHandle?.classList.add('is-search-open');
        requestAnimationFrame(() => fsInput.focus());
    });

    floatingSearch.addEventListener('submit', event => {
        if (!isMobileViewport()) return;
        if (!readerBar.classList.contains('mobile-search-open')) {
            event.preventDefault();
            readerBar.classList.add('mobile-search-open');
            edgeHandle?.classList.add('is-search-open');
            requestAnimationFrame(() => fsInput.focus());
        }
    });

    fsInput.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        readerBar.classList.remove('mobile-search-open');
        edgeHandle?.classList.remove('is-search-open');
        fsInput.blur();
    });

    fsInput.addEventListener('blur', () => {
        if (!isMobileViewport() || fsInput.value.trim()) return;
        setTimeout(() => {
            readerBar.classList.remove('mobile-search-open');
            edgeHandle?.classList.remove('is-search-open');
        }, 120);
    });

    const updateReaderBarMetrics = () => {
        const content = document.getElementById('aueditable') || document.getElementById('article-content');
        if (!content) return;
        const rect = content.getBoundingClientRect();
        document.documentElement.style.setProperty('--sep-reader-content-left', \`\${Math.max(0, rect.left)}px\`);
        document.documentElement.style.setProperty('--sep-reader-content-width', \`\${Math.max(280, rect.width)}px\`);
    };
    updateReaderBarMetrics();
    window.addEventListener('resize', updateReaderBarMetrics, { passive: true });

    readerTocBtn.addEventListener('click', () => {
        if (isMobileViewport()) {
            if (mobileTocOpen) closeMobileToc();
            else openMobileToc();
            readerTocBtn.setAttribute('aria-expanded', String(mobileTocOpen));
            readerTocBtn.setAttribute('aria-label', mobileTocOpen ? 'Hide table of contents' : 'Show table of contents');
        } else {
            toggleDesktopToc();
            readerTocBtn.setAttribute('aria-expanded', String(tocOpen));
            readerTocBtn.setAttribute('aria-label', tocOpen ? 'Hide table of contents' : 'Show table of contents');
        }
    });

    let fsLastY = window.scrollY;
    let fsVisible = false;
    let readerBarWasVisible = false;
    let lastManualScrollAt = 0;
    const markManualScroll = () => { lastManualScrollAt = Date.now(); };

    window.addEventListener('wheel', markManualScroll, { passive: true });
    window.addEventListener('touchmove', markManualScroll, { passive: true });
    window.addEventListener('keydown', e => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
            markManualScroll();
        }
    });

    const shouldSuppressReaderBarNearPageChrome = () => {
        const titleRect = articleTitleEl?.getBoundingClientRect();
        const headerRect = originalHeader?.getBoundingClientRect();
        const preambleRect = articlePreamble?.getBoundingClientRect();
        const titleVisible = titleRect && titleRect.bottom > 0 && titleRect.top < window.innerHeight;
        const headerVisible = headerRect && headerRect.bottom > 0 && headerRect.top < window.innerHeight;
        const preambleVisible = preambleRect && preambleRect.bottom > 48 && preambleRect.top < window.innerHeight;
        return Boolean(titleVisible || headerVisible || preambleVisible);
    };

    scrollCallbacks.push(scrollY => {
        const goingUp = scrollY < fsLastY;
        fsLastY = scrollY;
        const manualScroll = Date.now() - lastManualScrollAt < 700;
        const pageChromeVisible = shouldSuppressReaderBarNearPageChrome();
        const canShowReaderBar = manualScroll && goingUp && scrollY > 200 &&
            !pageChromeVisible && (!isMobileViewport() || !mobileTocOpen);
        if (canShowReaderBar) {
            if (!fsVisible) {
                fsVisible = true;
                updateReaderBarMetrics();
                readerBar.classList.add('visible');
                topBtn.classList.add('reader-hidden');
                updateTocPosition();
            }
        } else if (!goingUp || pageChromeVisible || (isMobileViewport() && mobileTocOpen)) {
            if (fsVisible) {
                fsVisible = false;
                readerBar.classList.remove('visible');
                topBtn.classList.remove('reader-hidden');
                updateTocPosition();
            }
        }
        readerTocBtn.setAttribute('aria-expanded', String(isMobileViewport() ? mobileTocOpen : tocOpen));
    });

})();
`;
