import { describe, it, expect } from 'vitest';
import {
  DECISIONS,
  DECISION_META,
  buildDecision,
  normalizeDecision,
  isValidDecision,
} from '../decision-log.js';

// ─── constants ────────────────────────────────────────────────────────────────

describe('DECISIONS', () => {
  it('contains adopt, trial, hold, reject', () => {
    expect(DECISIONS).toEqual(['adopt', 'trial', 'hold', 'reject']);
  });
});

describe('DECISION_META', () => {
  it('has an entry for every decision value', () => {
    for (const key of DECISIONS) {
      expect(DECISION_META[key]).toBeDefined();
      expect(typeof DECISION_META[key].label).toBe('string');
      expect(DECISION_META[key].label.length).toBeGreaterThan(0);
    }
  });
});

// ─── buildDecision ────────────────────────────────────────────────────────────

describe('buildDecision', () => {
  it('builds a valid decision record', () => {
    const d = buildDecision({
      repoId: 'acme/widget',
      decision: 'adopt',
      note: 'Great lib',
      timestamp: '2026-06-13T00:00:00.000Z',
    });
    expect(d.repoId).toBe('acme/widget');
    expect(d.decision).toBe('adopt');
    expect(d.note).toBe('Great lib');
    expect(d.timestamp).toBe('2026-06-13T00:00:00.000Z');
  });

  it('defaults note to empty string when omitted', () => {
    const d = buildDecision({ repoId: 'acme/widget', decision: 'trial' });
    expect(d.note).toBe('');
  });

  it('generates a timestamp when not provided', () => {
    const d = buildDecision({ repoId: 'acme/widget', decision: 'hold' });
    expect(typeof d.timestamp).toBe('string');
    expect(d.timestamp.length).toBeGreaterThan(0);
  });

  it('throws when repoId is missing', () => {
    expect(() => buildDecision({ decision: 'adopt' })).toThrow();
    expect(() => buildDecision({ repoId: '', decision: 'adopt' })).toThrow();
  });

  it('throws when decision is not a valid value', () => {
    expect(() => buildDecision({ repoId: 'acme/widget', decision: 'maybe' })).toThrow(/invalid decision/i);
  });

  it('trims whitespace from the note', () => {
    const d = buildDecision({ repoId: 'acme/widget', decision: 'reject', note: '  noisy note  ' });
    expect(d.note).toBe('noisy note');
  });

  it('returns a new object each time (immutable)', () => {
    const opts = { repoId: 'acme/widget', decision: 'adopt' };
    const a = buildDecision(opts);
    const b = buildDecision(opts);
    expect(a).not.toBe(b);
  });

  it('works for all four valid decisions', () => {
    for (const decision of DECISIONS) {
      const d = buildDecision({ repoId: 'acme/widget', decision });
      expect(d.decision).toBe(decision);
    }
  });
});

// ─── normalizeDecision ────────────────────────────────────────────────────────

describe('normalizeDecision', () => {
  it('returns null for null input', () => {
    expect(normalizeDecision(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(normalizeDecision('adopt')).toBeNull();
    expect(normalizeDecision(42)).toBeNull();
  });

  it('returns null when repoId is missing', () => {
    expect(normalizeDecision({ decision: 'adopt' })).toBeNull();
  });

  it('returns null when decision is invalid', () => {
    expect(normalizeDecision({ repoId: 'acme/widget', decision: 'maybe' })).toBeNull();
  });

  it('normalizes a valid raw object', () => {
    const raw = {
      repoId: 'acme/widget',
      decision: 'trial',
      note: 'testing it',
      timestamp: '2026-06-13T00:00:00.000Z',
    };
    const n = normalizeDecision(raw);
    expect(n).not.toBeNull();
    expect(n.repoId).toBe('acme/widget');
    expect(n.decision).toBe('trial');
    expect(n.note).toBe('testing it');
  });

  it('defaults missing timestamp to a valid ISO string', () => {
    const n = normalizeDecision({ repoId: 'acme/widget', decision: 'hold' });
    expect(typeof n.timestamp).toBe('string');
    expect(n.timestamp.length).toBeGreaterThan(0);
  });

  it('coerces note to empty string when missing', () => {
    const n = normalizeDecision({ repoId: 'acme/widget', decision: 'reject' });
    expect(n.note).toBe('');
  });
});

// ─── isValidDecision ──────────────────────────────────────────────────────────

describe('isValidDecision', () => {
  it('returns true for a valid decision object', () => {
    expect(isValidDecision({ repoId: 'acme/widget', decision: 'adopt' })).toBe(true);
  });

  it('returns false for missing repoId', () => {
    expect(isValidDecision({ decision: 'adopt' })).toBe(false);
  });

  it('returns false for invalid decision value', () => {
    expect(isValidDecision({ repoId: 'acme/widget', decision: 'maybe' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidDecision(null)).toBe(false);
  });
});
