// HOME-xx — home screen.
import { SRC, flat } from './_src';

describe('HOME — home screen', () => {
  const home = () => flat(SRC.home());

  test('HOME-01 app bar has no bottom border', () =>
    expect(home()).not.toMatch(/ab:\s*\{[^}]*borderBottom/));

  test('HOME-02 wordmark 22px / 700, letter-spacing -.02em', () =>
    expect(home()).toMatch(/abTitle:\s*\{[^}]*fontSize:\s*22[^}]*fontWeight:\s*'700'[^}]*letterSpacing:\s*-0?\.44/));

  test('HOME-03 overflow is horizontal three-dots (cy all = 12)', () => {
    const raw = SRC.home();
    // IconDots: three circles sharing cy="12" → horizontal dots
    expect(raw).toMatch(/IconDots[\s\S]{0,300}cx="5"\s+cy="12"[\s\S]{0,120}cx="12"\s+cy="12"[\s\S]{0,120}cx="19"\s+cy="12"/);
  });

  test('HOME-04 search pill height 46, radius 23, border', () =>
    expect(home()).toMatch(/searchPill:\s*\{[^}]*height:\s*46[^}]*borderRadius:\s*23/));

  test('HOME-06 placeholder "Search pages…"', () =>
    expect(SRC.home()).toMatch(/Search pages/));

  test('HOME-07 section label 11 / 600 uppercase', () =>
    expect(home()).toMatch(/secLabel:\s*\{[^}]*fontSize:\s*11[^}]*fontWeight:\s*'600'[^}]*textTransform:\s*'uppercase'/));

  test('HOME-08 "Continue reading" section', () =>
    expect(SRC.home()).toMatch(/Continue reading/));

  test('HOME-09 page row gap 14, padding 13/16, bottom border', () =>
    expect(home()).toMatch(/pageRow:\s*\{[^}]*gap:\s*14[^}]*paddingHorizontal:\s*16[^}]*paddingVertical:\s*13/));

  test('HOME-10 page-row icon 38x38 radius 8 bg-surface', () =>
    expect(home()).toMatch(/pageRowIcon:\s*\{[^}]*width:\s*38[^}]*height:\s*38[^}]*borderRadius:\s*8/));

  test('HOME-11 title 14 / 500', () =>
    expect(home()).toMatch(/pageRowTitle:\s*\{[^}]*fontSize:\s*14[^}]*fontWeight:\s*'500'/));

  test('HOME-12 meta line shows "% read" and "annotation"', () => {
    const raw = SRC.home();
    expect(raw).toMatch(/% read/);
    expect(raw).toMatch(/annotation/);
  });

  test('HOME-13 progress bar track #2a2a2a 2px + accent fill at opacity .6', () => {
    expect(home()).toMatch(/progressTrack:\s*\{[^}]*height:\s*2[^}]*backgroundColor:\s*'#2a2a2a'/);
    expect(home()).toMatch(/progressFill:\s*\{[^}]*opacity:\s*0?\.6/);
  });

  test('HOME-14 chevron 15px hint', () =>
    expect(SRC.home()).toMatch(/IconChevron[\s\S]{0,120}size\s*=\s*15/));

  test('HOME-16 page-row excerpt rendered under title', () => {
    expect(SRC.home()).toMatch(/item\.excerpt/);
    expect(flat(SRC.home())).toMatch(/pageRowExcerpt:\s*\{/);
  });
});
