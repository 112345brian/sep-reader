// TOC-xx — table-of-contents bottom sheet.
import { SRC, flat } from './_src';
import { parseToc } from '../../src/utils/parseToc';

describe('TOC — bottom sheet', () => {
  const toc = () => flat(SRC.toc());

  test('TOC-02 scrim rgba(0,0,0,0.55) tap to dismiss', () => {
    expect(toc()).toMatch(/backdrop:\s*\{[^}]*rgba\(0,0,0,0?\.55\)/);
    expect(SRC.toc()).toMatch(/onPress=\{onClose\}/);
  });

  test('TOC-03 sheet 66% height, bg-surface, top radius 14', () =>
    expect(toc()).toMatch(/sheet:\s*\{[^}]*height:\s*'66%'[^}]*borderTopLeftRadius:\s*14/));

  test('TOC-04 drag handle 36x4 color border #2e2e2e', () =>
    expect(toc()).toMatch(/handle:\s*\{[^}]*width:\s*36[^}]*height:\s*4[^}]*backgroundColor:\s*C\.border/));

  test('TOC-06 two tabs Contents + Annotations', () => {
    expect(SRC.toc()).toMatch(/Contents/);
    expect(SRC.toc()).toMatch(/Annotations/);
  });

  test('TOC-07 active tab gets 2px accent bottom border', () =>
    expect(toc()).toMatch(/tabActive:\s*\{[^}]*borderBottomColor:\s*C\.accent/));

  test('TOC-09 annotations count badge', () =>
    expect(SRC.toc()).toMatch(/annotations\.length/));

  test('TOC-10 toc-item gap 14 padding 14/18 bottom border', () =>
    expect(toc()).toMatch(/tocItem:\s*\{[^}]*gap:\s*14[^}]*paddingVertical:\s*14[^}]*paddingHorizontal:\s*18/));

  test('TOC-11 toc-num is a SEPARATE element, 12px hint, min-width 20', () => {
    expect(SRC.toc()).toMatch(/\{item\.num\}/);
    expect(toc()).toMatch(/tocNum:\s*\{[^}]*fontSize:\s*12[^}]*minWidth:\s*20/);
  });

  test('TOC-12 toc-text 14px text color', () =>
    expect(toc()).toMatch(/tocText:\s*\{[^}]*fontSize:\s*14/));

  test('TOC-13 sub-item indent 36 + 13px sec text', () => {
    expect(toc()).toMatch(/tocItemH3:\s*\{\s*paddingLeft:\s*36/);
    expect(toc()).toMatch(/tocTextH3:\s*\{[^}]*fontSize:\s*13/);
  });

  test('TOC-16 no × close button in the sheet', () =>
    expect(SRC.toc()).not.toMatch(/['"]✕['"]|['"]×['"]|CloseButton|close-btn/));
});

describe('TOC — parseToc behaviour (DATA-05)', () => {
  test('parses number, text and nesting level', () => {
    const html = `
      <a href="#overview">1. Architecture overview</a>
      <a href="#config">2. Configuration</a>
      <a href="#ttl">2.1 TTL settings</a>
      <a href="#gaps">3. Known gaps</a>`;
    const items = parseToc(html);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ num: '1', text: 'Architecture overview', href: 'overview', level: 0 });
    expect(items[2]).toMatchObject({ num: '2.1', text: 'TTL settings', href: 'ttl', level: 1 });
  });

  test('skips empty anchors and strips inner tags', () => {
    const html = `<a href="#x"><strong>Intro</strong></a><a href="#y"></a>`;
    const items = parseToc(html);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('Intro');
  });
});
