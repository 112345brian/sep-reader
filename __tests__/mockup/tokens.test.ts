// TOKEN-xx + NAV-xx — design tokens and bottom navigation.
import { SRC, flat } from './_src';

describe('TOKEN — design tokens', () => {
  const home = () => SRC.home();
  const toc = () => SRC.toc();

  test('TOKEN-01 bg #111111', () => expect(home()).toContain('#111111'));
  test('TOKEN-02 bg-surface #1c1c1c', () => expect(home()).toContain('#1c1c1c'));
  test('TOKEN-03 bg-elevated #252525', () => expect(toc()).toContain('#252525'));
  test('TOKEN-05 border #2e2e2e', () => expect(home()).toContain('#2e2e2e'));
  test('TOKEN-06 border-subtle #222222', () => expect(home()).toContain('#222222'));
  test('TOKEN-07 text #e4e4e4', () => expect(home()).toContain('#e4e4e4'));
  test('TOKEN-08 text-sec #9a9a9a', () => expect(toc()).toContain('#9a9a9a'));
  test('TOKEN-09 text-hint #555555', () => expect(home()).toContain('#555555'));
  test('TOKEN-10 accent #5b8ef5', () => expect(home()).toContain('#5b8ef5'));
  test('TOKEN-11 accent-dim rgba(91,142,245,.14)', () =>
    expect(home()).toMatch(/rgba\(91,\s*142,\s*245,\s*\.?0?\.14\)/));
  test('TOKEN-12 accent-border rgba(91,142,245,.35)', () =>
    expect(home()).toMatch(/rgba\(91,\s*142,\s*245,\s*\.?0?\.35\)/));
  test('TOKEN-13 highlight yellow #fbbf24', () => expect(toc()).toContain('#fbbf24'));
  test('TOKEN-14 highlight green #34d399', () => expect(toc()).toContain('#34d399'));
  test('TOKEN-15 highlight blue #60a5fa', () => expect(toc()).toContain('#60a5fa'));
  test('TOKEN-16 highlight pink #f472b6', () => expect(toc()).toContain('#f472b6'));
  test('TOKEN-19 svg stroke width 1.8', () => expect(home()).toMatch(/strokeWidth=\{1\.8\}/));
});

describe('NAV — bottom navigation', () => {
  const home = () => flat(SRC.home());

  test('NAV-01 nav height 56', () => expect(home()).toMatch(/bn:\s*\{[^}]*height:\s*56/));
  test('NAV-01 nav top border #2e2e2e', () =>
    expect(home()).toMatch(/borderTopColor:\s*C\.border|borderTopColor:\s*'#2e2e2e'/));
  test('NAV-02 Home item', () => expect(home()).toContain('>Home<'));
  test('NAV-02 Search item', () => expect(home()).toContain('>Search<'));
  test('NAV-02 Notes item', () => expect(home()).toContain('>Notes<'));
  test('NAV-04 active pill 56x30 radius 15', () =>
    expect(home()).toMatch(/bnPill:\s*\{[^}]*width:\s*56[^}]*height:\s*30[^}]*borderRadius:\s*15/));
  test('NAV-05 label 10px / 500', () =>
    expect(home()).toMatch(/bnLabel:\s*\{[^}]*fontSize:\s*10[^}]*fontWeight:\s*'500'/));
});
