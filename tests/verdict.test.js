import { describe, it, expect } from 'vitest';
import { deriveFit, firstSentence, verdictCopyText } from '../verdict.js';

describe('firstSentence', () => {
  it('returns the first sentence, or empty', () => {
    expect(firstSentence('Hello world. Second one.')).toBe('Hello world.');
    expect(firstSentence('No terminator here')).toBe('No terminator here');
    expect(firstSentence('')).toBe('');
    expect(firstSentence(null)).toBe('');
  });
});

describe('deriveFit', () => {
  const fit = (d) => deriveFit(d).level;
  it('strong: high health, zero warnings', () => {
    expect(
      deriveFit({ health: { score: 92 }, red_flags: [{ severity: 'ok' }], pros: [1, 2, 3], cons: [1] })
    ).toEqual({ level: 'strong', label: 'Strong fit', why: 'Health 92 · 0 flags · 3 pros / 1 cons' });
  });
  it('solid: healthy with one warning', () => {
    expect(fit({ health: { score: 78 }, red_flags: [{ severity: 'warning' }] })).toBe('solid');
  });
  it('care: mixed health, a couple warnings', () => {
    expect(
      fit({ health: { score: 54 }, red_flags: [{ severity: 'warning' }, { severity: 'warning' }] })
    ).toBe('care');
  });
  it('risky: low health, many warnings', () => {
    expect(fit({ health: { score: 30 }, red_flags: [1, 2, 3, 4].map(() => ({ severity: 'warning' })) })).toBe(
      'risky'
    );
  });
  it('no health → leans on flags + pros/cons', () => {
    expect(fit({ pros: [1, 2], cons: [1], red_flags: [] })).toBe('solid');
    expect(fit({ red_flags: [1, 2, 3].map(() => ({ severity: 'warning' })) })).toBe('risky');
  });
  it('empty object does not throw and yields a valid level', () => {
    expect(['strong', 'solid', 'care', 'risky']).toContain(fit({}));
  });
});

describe('verdictCopyText', () => {
  it('builds a plain-text summary with title, fit, bottom line and flags', () => {
    const d = {
      repoId: 'o/r',
      description: 'A thing.',
      bottom_line: 'Use it when X.',
      health: { score: 78 },
      pros: [1, 2],
      cons: [1],
      red_flags: [
        { severity: 'warning', title: 'Risk', text: 'Watch out.' },
        { severity: 'ok', title: 'Good', text: 'Nice.' },
      ],
    };
    const txt = verdictCopyText(d);
    expect(txt).toContain('o/r — Solid'); // 78 health + 1 warning → Solid
    expect(txt).toContain('Health 78/100'); // meta line
    expect(txt).toContain('A thing.');
    expect(txt).toContain('Use it when X.');
    expect(txt).toContain('⚠ Risk: Watch out.');
    expect(txt).not.toContain('⚠ Good:'); // ok flags excluded
  });
  it('handles a sparse object without throwing', () => {
    expect(typeof verdictCopyText({})).toBe('string');
  });
});
