// Smoke test for the on-device TeX→SVG port.
//
// NOTE: Jest runs on Node, not Hermes. This proves the renderer code and the
// mathjax-full integration are correct; it does NOT prove Hermes compatibility.
// The Hermes check must be done by running the app (see PR notes) — if MathJax
// fails to init there, mathEngineUnavailable() returns true and the resolver
// falls back, which texToSvg models explicitly.

import { texToSvg, mathEngineUnavailable } from '../texToSvg';
import { mathHash, resolveMath, _clearMathCache } from '../mathStore';

jest.mock('../../../../services/db', () => ({
  getMathByHashes: jest.fn(async () => []),
  putMath: jest.fn(async () => {}),
}));

describe('texToSvg (on-device renderer)', () => {
  it('renders inline TeX to a self-contained SVG', () => {
    const r = texToSvg('\\frac{a}{b}', false);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.svg).toMatch(/^<svg/);
    expect(r.svg).not.toMatch(/<use [^>]*xlink:href="#MJX-/); // fontCache:'none' → standalone
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });

  it('renders display TeX', () => {
    const r = texToSvg('\\int_0^1 x^2 \\, dx', true);
    expect('error' in r).toBe(false);
  });

  it('returns an error (not a throw) for un-renderable input', () => {
    const r = texToSvg('\\thisIsNotARealMacro{', false);
    expect('error' in r).toBe(true);
  });

  it('engine initialized in this runtime', () => {
    texToSvg('x', false);
    expect(mathEngineUnavailable()).toBe(false);
  });
});

describe('mathStore', () => {
  beforeEach(() => _clearMathCache());

  it('hashes inline and display variants distinctly', () => {
    expect(mathHash('x', false)).not.toBe(mathHash('x', true));
  });

  it('resolves and memoizes (second call is the same object)', () => {
    const a = resolveMath('\\alpha', false);
    const b = resolveMath('\\alpha', false);
    expect(a).not.toBeNull();
    expect(a).toBe(b); // memoized identity
  });

  it('returns null for an un-renderable equation', () => {
    expect(resolveMath('\\bad{', false)).toBeNull();
  });
});
