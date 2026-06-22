// Injected into every article WebView.
// Exposes: window.applyAnnotations(ann[]) and window.removeAnnotation(id)
// Posts messages: { type: 'highlight'|'annotate'|'tap_annotation', ... }

export const ANNOTATION_JS = `
(function() {
  var bar = null;
  var pending = null;

  // ── Selection toolbar ─────────────────────────────────────────────────────

  document.addEventListener('selectionchange', function() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      hideBar();
      return;
    }
    pending = { text: sel.toString(), context: getContext(sel) };
    if (!bar) showBar();
  });

  function getContext(sel) {
    if (!sel.rangeCount) return '';
    var r = sel.getRangeAt(0);
    var node = r.startContainer;
    var t = (node.textContent || '');
    var s = Math.max(0, r.startOffset - 50);
    var e = Math.min(t.length, r.endOffset + 50);
    return t.slice(s, e);
  }

  function showBar() {
    bar = document.createElement('div');
    bar.style.cssText = [
      'position:fixed',
      'bottom:72px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:#1c1c1e',
      'border:1px solid #3a3a3c',
      'border-radius:32px',
      'padding:8px 18px',
      'display:flex',
      'align-items:center',
      'gap:16px',
      'z-index:99999',
      'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
      '-webkit-user-select:none',
      'user-select:none',
    ].join(';');

    var COLORS = [
      '#FFE566',
      '#FF6B6B',
      '#66AAFF',
      '#66DD99',
    ];

    COLORS.forEach(function(c) {
      var btn = document.createElement('button');
      btn.style.cssText = [
        'width:22px','height:22px','border-radius:50%',
        'border:2px solid rgba(255,255,255,0.15)',
        'background:' + c,
        'cursor:pointer','padding:0','flex-shrink:0',
      ].join(';');
      btn.addEventListener('mousedown', function(e) { e.preventDefault(); send('highlight', c); });
      btn.addEventListener('touchend',  function(e) { e.preventDefault(); send('highlight', c); });
      bar.appendChild(btn);
    });

    var divider = document.createElement('div');
    divider.style.cssText = 'width:1px;height:18px;background:#3a3a3c;flex-shrink:0;';
    bar.appendChild(divider);

    var noteBtn = document.createElement('button');
    noteBtn.innerHTML = '&#9998;';
    noteBtn.style.cssText = [
      'background:none','border:none','color:#7ba4ff',
      'font-size:17px','cursor:pointer','padding:0 2px','line-height:1',
    ].join(';');
    noteBtn.title = 'Add note';
    noteBtn.addEventListener('mousedown', function(e) { e.preventDefault(); send('annotate', '#FFE566'); });
    noteBtn.addEventListener('touchend',  function(e) { e.preventDefault(); send('annotate', '#FFE566'); });
    bar.appendChild(noteBtn);

    document.body.appendChild(bar);
  }

  function hideBar() {
    if (bar) { bar.remove(); bar = null; }
    pending = null;
  }

  function send(type, color) {
    if (!pending) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: type,
      text: pending.text,
      context: pending.context,
      color: color,
    }));
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    hideBar();
  }

  // ── Document-level tap handler for marks ─────────────────────────────────
  // Element-level touch events on inline <mark> nodes are unreliable in Android
  // WebView. elementsFromPoint (plural) returns the full element stack including
  // inline children that elementFromPoint (singular) misses.
  document.addEventListener('touchend', function(e) {
    var touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    var els = document.elementsFromPoint
      ? document.elementsFromPoint(touch.clientX, touch.clientY)
      : [document.elementFromPoint(touch.clientX, touch.clientY)];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el && el.tagName === 'MARK' && el.getAttribute('data-ann-id')) {
        var id = parseInt(el.getAttribute('data-ann-id'), 10);
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap_annotation', id: id }));
        return;
      }
    }
  }, { passive: true });

  // ── TOC open (called from native header button) ───────────────────────────
  window.openToc = function() {
    var toc = document.getElementById('toc');
    if (!toc) return;
    toc.classList.add('toc-open');
    var bd = document.getElementById('sep-mobile-backdrop');
    if (bd) bd.classList.add('visible');
  };

  // ── Apply / remove highlights ─────────────────────────────────────────────

  window.applyAnnotations = function(annotations) {
    annotations.forEach(function(ann) { applyOne(ann); });
  };

  window.removeAnnotation = function(id) {
    var marks = document.querySelectorAll('mark[data-ann-id="' + id + '"]');
    marks.forEach(function(mark) {
      var parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  };

  function applyOne(ann) {
    var text = ann.selected_text;
    if (!text) return;
    var root = document.getElementById('aueditable') || document.getElementById('article') || document.body;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var idx = node.textContent.indexOf(text);
      if (idx === -1) continue;
      try {
        var range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + text.length);

        var mark = document.createElement('mark');
        mark.setAttribute('data-ann-id', String(ann.id));
        mark.style.backgroundColor = ann.color + '44';
        mark.style.borderBottom = '2px solid ' + ann.color;
        mark.style.borderRadius = '2px';
        mark.style.cursor = 'pointer';
        mark.style.transition = 'background 0.15s';
        if (ann.note) mark.title = ann.note;

        range.surroundContents(mark);
      } catch (e) {
        // Selection spans multiple nodes — skip
      }
      break;
    }
  }

  // ── Native app: remove companion JS elements that duplicate native UI ────
  // The companion JS reader bar is always-visible on mobile but the Nous native
  // header already provides title + navigation. Remove from DOM entirely so there
  // is no CSS specificity battle. CSS !important is also added as a fallback.
  var _rb = document.getElementById('sep-reader-bar');
  if (_rb && _rb.parentNode) _rb.parentNode.removeChild(_rb);
  var _s = document.createElement('style');
  _s.textContent =
    '#sep-reader-bar{display:none!important}' +
    'html{scroll-padding-top:0!important}' +
    '[id],a[name],:target{scroll-margin-top:1rem!important}';
  document.head.appendChild(_s);
})();
`;
