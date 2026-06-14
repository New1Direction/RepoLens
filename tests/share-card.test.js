import { describe, it, expect } from 'vitest';
import { encodeShareCard, decodeShareCard } from '../share-card.js';

const sample = {
  repoId: 'facebook/react',
  description: 'The library for web and native user interfaces.',
  health: { score: 95 },
  fitLevel: 'strong',
  eli5: 'React lets you build UIs from components.',
  license: 'MIT',
  stars: 220000,
  language: 'JavaScript',
};

describe('encodeShareCard', () => {
  it('returns empty string for null', () => {
    expect(encodeShareCard(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(encodeShareCard(undefined)).toBe('');
  });

  it('returns empty string when repoId is absent', () => {
    expect(encodeShareCard({ description: 'no repo' })).toBe('');
  });

  it('returns a non-empty string for valid data', () => {
    const encoded = encodeShareCard(sample);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('produces valid base64', () => {
    const encoded = encodeShareCard(sample);
    expect(() => atob(encoded)).not.toThrow();
  });

  it('truncates long descriptions to 140 chars', () => {
    const longDesc = 'x'.repeat(200);
    const encoded = encodeShareCard({ ...sample, description: longDesc });
    const decoded = JSON.parse(atob(encoded));
    expect(decoded.d.length).toBeLessThanOrEqual(140);
  });

  it('truncates long eli5 to 120 chars', () => {
    const longEli5 = 'y'.repeat(200);
    const encoded = encodeShareCard({ ...sample, eli5: longEli5 });
    const decoded = JSON.parse(atob(encoded));
    expect(decoded.e.length).toBeLessThanOrEqual(120);
  });

  it('handles flat health score (number) as well as { score }', () => {
    const encoded = encodeShareCard({ ...sample, health: 88 });
    const decoded = JSON.parse(atob(encoded));
    expect(decoded.h).toBe(88);
  });
});

describe('decodeShareCard', () => {
  it('returns null for null', () => {
    expect(decodeShareCard(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(decodeShareCard('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(decodeShareCard('not-valid-base64!!')).toBeNull();
  });

  it('returns null for wrong version', () => {
    const bad = btoa(JSON.stringify({ v: 99, r: 'owner/repo' }));
    expect(decodeShareCard(bad)).toBeNull();
  });

  it('returns null when repoId is missing', () => {
    const bad = btoa(JSON.stringify({ v: 1, d: 'hi' }));
    expect(decodeShareCard(bad)).toBeNull();
  });

  it('round-trips through encode/decode', () => {
    const encoded = encodeShareCard(sample);
    const decoded = decodeShareCard(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded.repoId).toBe('facebook/react');
    expect(decoded.fitLevel).toBe('strong');
    expect(decoded.health).toBe(95);
    expect(decoded.stars).toBe(220000);
  });

  it('strips a leading # from the fragment', () => {
    const encoded = encodeShareCard(sample);
    const decoded = decodeShareCard('#' + encoded);
    expect(decoded?.repoId).toBe('facebook/react');
  });

  it('preserves license and language', () => {
    const decoded = decodeShareCard(encodeShareCard(sample));
    expect(decoded?.license).toBe('MIT');
    expect(decoded?.language).toBe('JavaScript');
  });
});
