import { describe, it, expect } from 'vitest';
import { COPY } from '../onboarding-copy.js';

const BANNED = [
  'unlock',
  'supercharge',
  'elevate',
  'leverage',
  'harness',
  'streamline',
  'empower',
  'revolutionize',
  'showcase',
  'enhance',
  'foster',
  'facilitate',
  'dive in',
  'delve',
  'seamless',
  'effortless',
  'robust',
  'comprehensive',
  'powerful',
  'cutting-edge',
  'game-changer',
  'game-changing',
  'transformative',
  'remarkable',
  'crucial',
  'intricate',
  'meticulous',
  'landscape',
  'tapestry',
  'ecosystem',
  'synergy',
  'get ready',
  'the fun stuff',
  "that's it",
  "you're all set",
];

const lines = Object.entries(COPY);

describe('Vee copy is de-slopped', () => {
  it('uses no banned AI-slop vocab', () => {
    for (const [k, t] of lines) {
      const low = String(t).toLowerCase();
      for (const b of BANNED) expect(low.includes(b), `"${k}": banned "${b}" in: ${t}`).toBe(false);
    }
  });
  it('uses no em dashes (the #1 AI tell)', () => {
    for (const [k, t] of lines) expect(String(t).includes('—'), `"${k}" has an em dash`).toBe(false);
  });
  it('keeps exclamation marks to at most one across the whole deck', () => {
    const total = lines.reduce((n, [, t]) => n + (String(t).match(/!/g) || []).length, 0);
    expect(total).toBeLessThanOrEqual(1);
  });
  it('every line is short (≤ 140 chars) and non-empty', () => {
    for (const [k, t] of lines) {
      expect(String(t).length, k).toBeGreaterThan(0);
      expect(String(t).length, k).toBeLessThanOrEqual(140);
    }
  });
});
