// GESTURE-xx — gesture navigation model.
import { SRC } from './_src';

describe('GESTURE — navigation gestures', () => {
  const art = () => SRC.article();

  test('gesture-handler is wired at the app root', () => {
    expect(SRC.index()).toMatch(/import 'react-native-gesture-handler'/);
    expect(SRC.app()).toMatch(/GestureHandlerRootView/);
  });

  test('GESTURE-01 swipe up → TOC', () => {
    expect(art()).toMatch(/tocSwipe|tocGesture/);
    expect(art()).toMatch(/setShowToc\(true\)/);
  });

  test('GESTURE-02 swipe down → graph', () => {
    expect(art()).toMatch(/swipeGraph/);
    expect(art()).toMatch(/openGraph|navigate\('Graph'/);
  });

  test('GESTURE-03 swipe right → home', () => {
    expect(art()).toMatch(/swipeHome/);
    expect(art()).toMatch(/nav\.goBack\(\)/);
  });

  test('article wraps zones in GestureDetector', () =>
    expect(art()).toMatch(/<GestureDetector/));
});
