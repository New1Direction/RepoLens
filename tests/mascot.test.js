import { describe, it, expect } from 'vitest';
import { setMascotState, setMascotFromFit, veeSvg, VEE_STATES } from '../mascot.js';

// A minimal stand-in for an Element's classList so the pure state logic can be
// tested without a DOM environment.
function fakeEl() {
  const classes = new Set();
  return {
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      contains: (n) => classes.has(n),
    },
    classes,
  };
}

const stateClasses = (el) => [...el.classes].filter((c) => c.startsWith('is-'));

describe('setMascotState', () => {
  it('applies exactly the requested state class', () => {
    const el = fakeEl();
    setMascotState(el, 'strong');
    expect(stateClasses(el)).toEqual(['is-strong']);
  });
  it('treats idle as the absence of any state class', () => {
    const el = fakeEl();
    setMascotState(el, 'strong');
    setMascotState(el, 'idle');
    expect(stateClasses(el)).toEqual([]);
  });
  it('switching states never leaves a stale class', () => {
    const el = fakeEl();
    setMascotState(el, 'scanning');
    setMascotState(el, 'risky');
    expect(stateClasses(el)).toEqual(['is-risky']);
  });
  it('falls back to idle for an unknown state', () => {
    const el = fakeEl();
    setMascotState(el, 'definitely-not-a-state');
    expect(stateClasses(el)).toEqual([]);
  });
  it('is a no-op (no throw) on a null element', () => {
    expect(() => setMascotState(null, 'strong')).not.toThrow();
  });
});

describe('setMascotFromFit', () => {
  it('maps only the two extremes to a distinct face', () => {
    const strong = fakeEl();
    setMascotFromFit(strong, 'strong');
    expect(stateClasses(strong)).toEqual(['is-strong']);
    const risky = fakeEl();
    setMascotFromFit(risky, 'risky');
    expect(stateClasses(risky)).toEqual(['is-risky']);
  });
  it('rests at idle for solid / care / unknown / missing fit', () => {
    for (const fit of ['solid', 'care', 'nonsense', undefined, null]) {
      const el = fakeEl();
      setMascotFromFit(el, fit);
      expect(stateClasses(el)).toEqual([]);
    }
  });
});

describe('veeSvg', () => {
  it('returns the token-aware SVG markup', () => {
    const svg = veeSvg();
    expect(svg).toContain('vee-aperture');
    expect(svg).toContain('var(--accent)');
    expect(svg).toContain('currentColor');
  });
  it('exposes the canonical state list', () => {
    expect(VEE_STATES).toContain('scanning');
    expect(VEE_STATES).toContain('idle');
  });
});
