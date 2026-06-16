import { describe, it, expect } from 'vitest';
import { placeCard } from '../coachmark.js';

const VP = { w: 1000, h: 700 };
const CARD = { w: 320, h: 150 };

describe('placeCard', () => {
  it('places the card BELOW a target near the top', () => {
    const p = placeCard({ x: 400, y: 40, width: 120, height: 36 }, CARD, VP);
    expect(p.side).toBe('below');
    expect(p.top).toBeGreaterThan(40 + 36);
  });
  it('places the card ABOVE a target near the bottom', () => {
    const p = placeCard({ x: 400, y: 650, width: 120, height: 36 }, CARD, VP);
    expect(p.side).toBe('above');
    expect(p.top + CARD.h).toBeLessThanOrEqual(650);
  });
  it('keeps the card within the viewport horizontally', () => {
    const p = placeCard({ x: 980, y: 300, width: 40, height: 36 }, CARD, VP);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + CARD.w).toBeLessThanOrEqual(VP.w - 8);
  });
  it('centers when target is null', () => {
    const p = placeCard(null, CARD, VP);
    expect(p.side).toBe('center');
    expect(Math.round(p.left)).toBe(Math.round((VP.w - CARD.w) / 2));
  });
});
