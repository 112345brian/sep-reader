// DATA-xx — data/behavior backing the UI, plus makeExcerpt behaviour.
import { SRC } from './_src';
import { makeExcerpt } from '../../src/utils/excerpt';

describe('DATA — backing behaviour', () => {
  const db = () => SRC.db();

  test('DATA-01 entries.read_progress column + migration', () => {
    expect(db()).toMatch(/read_progress\s+REAL/);
    expect(db()).toMatch(/ALTER TABLE entries ADD COLUMN read_progress/);
  });

  test('DATA-01 setReadProgress ratchets upward (MAX) and clamps', () => {
    expect(db()).toMatch(/setReadProgress/);
    expect(db()).toMatch(/MAX\(COALESCE\(read_progress/);
    expect(db()).toMatch(/Math\.max\(0,\s*Math\.min\(1/);
  });

  test('DATA-02 reader reports scroll progress to the app', () => {
    expect(SRC.injected()).toMatch(/type:\s*'progress'/);
    expect(SRC.article()).toMatch(/setReadProgress\(slug/);
  });

  test('DATA-03 home queries include annotation_count', () => {
    expect(db()).toMatch(/annotation_count/);
    expect(db()).toMatch(/COUNT\(\*\)\s+FROM annotations/);
  });

  test('DATA-04 entries.excerpt column populated at cache time', () => {
    expect(db()).toMatch(/excerpt\s+TEXT/);
    expect(db()).toMatch(/makeExcerpt/);
  });

  test('DATA-04 graph preview uses a lightweight excerpt query', () => {
    expect(db()).toMatch(/getEntryPreview/);
    expect(SRC.graph()).toMatch(/getEntryPreview/);
  });
});

describe('DATA — makeExcerpt behaviour', () => {
  test('strips tags and entities', () => {
    expect(makeExcerpt('<p>Hello&nbsp;<b>world</b> &amp; more</p>'))
      .toBe('Hello world & more');
  });

  test('drops script/style content', () => {
    expect(makeExcerpt('<style>.x{color:red}</style><p>Body text</p>'))
      .toBe('Body text');
  });

  test('truncates on a word boundary with ellipsis', () => {
    const long = 'word '.repeat(60).trim();
    const out = makeExcerpt(long, 40);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\sword$/); // no dangling partial word before ellipsis
  });

  test('returns short text unchanged', () => {
    expect(makeExcerpt('<p>Short</p>', 160)).toBe('Short');
  });
});

describe('CONFIG — edge-to-edge (fixes bottom-nav overlap)', () => {
  test('edge-to-edge enabled so safe-area insets are real', () =>
    expect(SRC.gradle()).toMatch(/edgeToEdgeEnabled=true/));

  test('home bottom nav pads by safe-area inset', () =>
    expect(SRC.home()).toMatch(/paddingBottom:\s*insets\.bottom/));
});
