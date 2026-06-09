import { describe, it, expect } from 'vitest';
import { PARTS, CATALOG } from '../models.js';
import { CHAIN } from '../routing.js';

describe('PARTS', () => {
  it('has unique non-empty ids and labels', () => {
    const ids = PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PARTS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
    }
  });
});

describe('CATALOG', () => {
  it('covers exactly the providers in the routing chain', () => {
    expect(Object.keys(CATALOG).sort()).toEqual([...CHAIN].sort());
  });

  it('each provider has exactly one recommended model', () => {
    for (const [provider, { models }] of Object.entries(CATALOG)) {
      const rec = models.filter((m) => m.recommended);
      expect(rec, `${provider} should have one recommended model`).toHaveLength(1);
    }
  });

  it('every model has a non-empty value and label', () => {
    for (const { models } of Object.values(CATALOG)) {
      for (const m of models) {
        expect(typeof m.value).toBe('string');
        expect(m.value.length).toBeGreaterThan(0);
        expect(m.label).toBeTruthy();
      }
    }
  });
});
