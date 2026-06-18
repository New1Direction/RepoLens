import { describe, it, expect } from 'vitest';
import { TONES, DEFAULT_TONE, isTone, tonePreamble, withTone } from '../tone.js';

describe('TONES', () => {
  it('exposes the default + five named tones', () => {
    expect(TONES.map((t) => t.key)).toEqual([
      'neutral',
      'director',
      'catalyst',
      'guide',
      'nurturer',
      'copilot',
    ]);
    for (const t of TONES) {
      expect(t.label).toBeTruthy();
      expect(t.blurb).toBeTruthy();
    }
  });
  it('defaults to neutral', () => {
    expect(DEFAULT_TONE).toBe('neutral');
  });
});

describe('isTone', () => {
  it('validates keys', () => {
    expect(isTone('director')).toBe(true);
    expect(isTone('nope')).toBe(false);
  });
});

describe('tonePreamble', () => {
  it('returns an empty string for neutral / unknown (no voice instruction)', () => {
    expect(tonePreamble('neutral')).toBe('');
    expect(tonePreamble(undefined)).toBe('');
    expect(tonePreamble('bogus')).toBe('');
  });
  it('returns a voice directive that preserves JSON structure for named tones', () => {
    const p = tonePreamble('director');
    expect(p).toContain('Director');
    expect(p).toMatch(/JSON structure/i);
  });
});

describe('withTone', () => {
  it('prepends the preamble to the prompt', () => {
    expect(withTone('catalyst', 'BODY')).toMatch(/Catalyst[\s\S]*BODY$/);
  });
  it('leaves the prompt unchanged for neutral', () => {
    expect(withTone('neutral', 'BODY')).toBe('BODY');
  });
});
