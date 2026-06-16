import { describe, it, expect } from 'vitest';
import { scanFrameParams, ANIM_SIZES, RING_GREY, RING_BLUE } from '../icon-anim.js';

describe('scanFrameParams', () => {
  it('starts the aperture small and grown-in by the end of the grow phase', () => {
    const t0 = scanFrameParams(0);
    const tGrown = scanFrameParams(600); // end of grow phase
    expect(t0.apertureScale).toBeLessThan(0.7);
    expect(tGrown.apertureScale).toBeGreaterThan(1.0);
    // dashed so the spin reads
    expect(t0.dashed).toBe(true);
  });

  it('rotation increases monotonically and accelerates (slow → fast)', () => {
    const a = scanFrameParams(800).apertureRotation;
    const b = scanFrameParams(1700).apertureRotation;
    const c = scanFrameParams(2600).apertureRotation;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // second 900ms window covers more rotation than the first (acceleration)
    expect(c - b).toBeGreaterThan(b - a);
  });

  it('ring breathes within bounds and stays between grey and blue', () => {
    for (const t of [0, 250, 700, 1500, 3000]) {
      const p = scanFrameParams(t);
      expect(p.ringScale).toBeGreaterThanOrEqual(1.0);
      expect(p.ringScale).toBeLessThanOrEqual(1.1);
      expect([RING_GREY, RING_BLUE].includes(p.ringColor) || p.ringColor.startsWith('rgb')).toBe(true);
    }
  });

  it('renders at the toolbar sizes 16, 32, 48', () => {
    expect(ANIM_SIZES).toEqual([16, 32, 48]);
  });
});
