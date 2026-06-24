const { getDefaultConfig } = require('/Users/bri/programming/sep-reader/node_modules/expo/metro-config');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');

const defaultConfig = getDefaultConfig(__dirname);

module.exports = {
  ...defaultConfig,
  watchFolders: [repoRoot],
  resolver: {
    ...defaultConfig.resolver,
    nodeModulesPaths: [path.join(repoRoot, 'node_modules')],
  },
};
