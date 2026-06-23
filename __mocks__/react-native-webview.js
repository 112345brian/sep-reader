// Jest manual mock — react-native-webview pulls a native TurboModule that can't
// load in node. Render a plain View so screens that import it can mount in tests.
const React = require('react');
const { View } = require('react-native');

const WebView = React.forwardRef((props, ref) =>
  React.createElement(View, { ...props, ref })
);

module.exports = { __esModule: true, default: WebView, WebView };
