import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';
import { _registerInject, _onMessage } from '../services/mathRender';

// Off-screen WebView that hosts MathJax (which can't run on Hermes) and converts
// TeX → SVG on request from the fetch/backfill pipeline. Mounted once, app-wide.
//
// MathJax is configured with typeset:false (we drive it programmatically via
// tex2svg) and fontCache:'none' so each SVG is standalone — no cross-equation
// <use> refs into a shared cache that won't exist once equations are stored and
// rendered independently in the native renderer.
//
// SOURCE NOTE: this loads the MathJax engine (MIT). The SVGs it produces are
// SEP-derived but generated on-device at runtime and stored locally — never
// bundled or shipped (see NOTICE.md / AGENTS.md).
const MATHJAX_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js';

const BOOT_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script>
  window.MathJax = {
    startup: {
      typeset: false,
      ready: function () {
        MathJax.startup.defaultReady();
        MathJax.startup.promise.then(function () {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        });
      }
    },
    svg: { fontCache: 'none' }
  };
  window.__renderMath = function (req) {
    var out = (req.items || []).map(function (it) {
      try {
        var node = MathJax.tex2svg(it.tex, { display: !!it.display });
        var svg = node.querySelector('svg');
        if (!svg) return { tex: it.tex, display: it.display, error: 'no svg' };
        // MathJax SVG output is ASCII (path data), so btoa is safe. Encode in the
        // WebView so the RN side never needs Hermes base64 on the write path.
        return {
          tex: it.tex, display: it.display,
          b64: btoa(svg.outerHTML),
          w: parseFloat(svg.getAttribute('width')) || 1,
          h: parseFloat(svg.getAttribute('height')) || 1
        };
      } catch (e) {
        return { tex: it.tex, display: it.display, error: String(e) };
      }
    });
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'result', reqId: req.reqId, out: out }));
  };
</script>
<script src="${MATHJAX_SRC}"></script>
</head><body></body></html>`;

export default function MathRenderWebView() {
  const ref = useRef<WebView>(null);

  useEffect(() => {
    _registerInject((js: string) => ref.current?.injectJavaScript(js));
  }, []);

  return (
    <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0, top: -9999, left: -9999 }} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ html: BOOT_HTML }}
        originWhitelist={['*']}
        onMessage={e => _onMessage(e.nativeEvent.data)}
        javaScriptEnabled
        domStorageEnabled
        // Keep it alive in the background; never throttle the render bridge.
        androidLayerType="software"
        cacheEnabled
      />
    </View>
  );
}
