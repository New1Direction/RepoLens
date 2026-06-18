import { describe, it, expect } from 'vitest';
import { LENS_GUIDE, guideFor } from '../lens-guide.js';

const KEYS = [
  'triz',
  'scamper',
  'lateral',
  'morph', // Ideate
  'toc',
  'loops',
  'pdca',
  'dmaic', // Systems
  'pareto',
  'eisenhower', // Prioritize
  'deepdive',
  'sktpg', // single-shot lenses
];

describe('lens-guide', () => {
  it('every framework/lens key has non-empty howToUse + misconceptions', () => {
    for (const k of KEYS) {
      const g = LENS_GUIDE[k];
      expect(g, `missing guide for ${k}`).toBeTruthy();
      expect(g.howToUse.trim().length, `empty howToUse for ${k}`).toBeGreaterThan(0);
      expect(Array.isArray(g.misconceptions)).toBe(true);
      expect(g.misconceptions.length, `no misconceptions for ${k}`).toBeGreaterThan(0);
      g.misconceptions.forEach((m) => expect(m.trim().length).toBeGreaterThan(0));
    }
  });

  it('guideFor returns the entry or null', () => {
    expect(guideFor('scamper')).toBe(LENS_GUIDE.scamper);
    expect(guideFor('nope')).toBeNull();
    expect(guideFor('')).toBeNull();
  });
});
