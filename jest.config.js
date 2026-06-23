module.exports = {
  // jest-expo mocks Expo + RN native modules so the app can be imported in node.
  preset: 'jest-expo',
  setupFiles: ['./node_modules/react-native-gesture-handler/jestSetup.js'],
  // Only *.test files are suites; helpers like _src.ts are not.
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
};
