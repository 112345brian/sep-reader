import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';
import { _registerInject, _onMessage } from '../services/mathRender';
import { TEX_SVG_FULL_B64 } from '../utils/mathjax/texSvgFull';

// Off-screen WebView that hosts MathJax (which can't run on Hermes) and converts
// TeX → SVG on request from the fetch/backfill pipeline. Mounted once, app-wide.
//
// MathJax is configured with typeset:false (we drive it programmatically via
// tex2svg) and fontCache:'none' so each SVG is standalone — no cross-equation
// <use> refs into a shared cache that won't exist once equations are stored and
// rendered independently in the native renderer.
//
// SOURCE NOTE: this loads the MathJax engine (MIT), bundled as base64 (see
// texSvgFull.ts) so math renders offline with no CDN dependency. The SVGs it
// produces are SEP-derived but generated on-device at runtime and stored
// locally — never bundled or shipped (see NOTICE.md / AGENTS.md).

// The page bridge: configure MathJax, then expose __renderMath. MathJax itself
// is injected separately after load (it's ~2.3MB — too large to inline in the
// source HTML reliably).
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
</head><body></body></html>`;

// Decode and run the bundled MathJax engine inside the page. atob is native in
// the WebView (a real browser engine), so the 2.3MB base64 decodes there.
const LOAD_MATHJAX_JS = `(function(){
  try {
    var src = atob(${JSON.stringify(TEX_SVG_FULL_B64)});
    var s = document.createElement('script');
    s.text = src;
    document.head.appendChild(s);
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: String(e) }));
  }
})(); true;`;

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
        onLoadEnd={() => ref.current?.injectJavaScript(LOAD_MATHJAX_JS)}
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
