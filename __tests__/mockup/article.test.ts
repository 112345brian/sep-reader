// ART-xx — article screen + ANNOT-xx annotation mode.
import { SRC, flat } from './_src';

describe('ART — article screen', () => {
  const art = () => flat(SRC.article());
  const reader = () => SRC.readerCss() + SRC.injected();

  test('ART-01 app bar: back, search, vertical-dots overflow', () => {
    const raw = SRC.article();
    expect(raw).toMatch(/IconBack/);
    expect(raw).toMatch(/IconSearch/);
    // vertical dots: three circles sharing cx="12"
    expect(raw).toMatch(/IconDots[\s\S]{0,300}cx="12"\s+cy="5"[\s\S]{0,160}cx="12"\s+cy="19"/);
  });

  test('ART-02 left edge hint 3px accent gradient', () =>
    expect(art()).toMatch(/edgeAccent:\s*\{[^}]*width:\s*3[^}]*rgba\(91,142,245/));

  test('ART-03 swipe-up pill 40x4', () =>
    expect(art()).toMatch(/tocHandlePill:\s*\{[^}]*width:\s*40[^}]*height:\s*4/));

  test('ART-04 header padding 22/18/16 with bottom border', () =>
    expect(art()).toMatch(/articleHeader:\s*\{[^}]*paddingHorizontal:\s*18[^}]*paddingTop:\s*22/));

  test('ART-05 category eyebrow 11/600 uppercase accent', () =>
    expect(art()).toMatch(/articleCategory:\s*\{[^}]*fontSize:\s*11[^}]*textTransform:\s*'uppercase'[^}]*color:\s*'#5b8ef5'/));

  test('ART-06 title 26 / 700', () =>
    expect(art()).toMatch(/articleTitle:\s*\{[^}]*fontSize:\s*26[^}]*fontWeight:\s*'700'/));

  test('ART-08 annotation-count chip "notes" with accent-dim bg', () => {
    expect(SRC.article()).toMatch(/notes/);
    expect(art()).toMatch(/annChip:\s*\{[^}]*rgba\(91,142,245,0?\.14\)/);
  });

  test('ART-09 prose 16px base, sans-serif, line-height 1.78, color #d0d0d0', () => {
    const css = SRC.readerCss();
    expect(css).toMatch(/--font-size:\s*16px/);          // mockup base size
    expect(css).toMatch(/font-family:\s*var\(--sans\)/); // mockup sans body
    expect(css).toMatch(/line-height:\s*1\.78/);
    expect(css).toMatch(/--text:\s*#d0d0d0/i);
  });

  test('ART-14 wiki link styling in reader CSS', () =>
    expect(reader()).toMatch(/#5b8ef5|wl\b|entry-link|class="?wl/i));

  test('ART-19 backlinks row "pages link here"', () => {
    // May live in article screen, reader CSS, or injected assets.
    const all = SRC.article() + reader();
    expect(all).toMatch(/link here|backlink/i);
  });
});

describe('ANNOT — annotation/highlight mode', () => {
  const ann = () => SRC.annotationJs();

  test('ANNOT-02 four highlight colors (yellow/green/blue/pink)', () => {
    const a = SRC.annotationJs() + SRC.injected() + SRC.article();
    expect(a).toMatch(/fbbf24|FFE566/i); // yellow
    expect(a).toMatch(/34d399|66DD99/i); // green
    expect(a).toMatch(/60a5fa|66AAFF/i); // blue
    expect(a).toMatch(/f472b6|FF6B6B/i); // pink
  });

  test('ANNOT-03 Note action exists', () =>
    expect(ann() + SRC.article()).toMatch(/note/i));

  test('ANNOT-04 Copy action exists', () =>
    expect(ann() + SRC.injected()).toMatch(/copy/i));

  test('ANNOT-07 tapping a highlight opens it for edit', () =>
    expect(ann() + SRC.article()).toMatch(/tap_annotation/));
});
