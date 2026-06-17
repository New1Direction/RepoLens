import { describe, it, expect } from 'vitest';
import { ACTS, ACT_ORDER, TAB_LABELS, actForTab, tabsForAct } from '../output-acts.js';

describe('act model', () => {
  it('orders the four acts', () => {
    expect(ACT_ORDER).toEqual(['decide', 'understand', 'deeper', 'act']);
  });

  it('covers every tab index 0..27 exactly once', () => {
    const all = ACTS.flatMap((a) => a.tabs).sort((x, y) => x - y);
    expect(all).toEqual(Array.from({ length: 28 }, (_, i) => i));
    expect(new Set(all).size).toBe(28); // no duplicates
  });

  it('maps a tab to its owning act', () => {
    expect(actForTab(9)).toBe('decide');
    expect(actForTab(7)).toBe('understand'); // Health
    expect(actForTab(10)).toBe('deeper'); // Deep Dive
    expect(actForTab(17)).toBe('act'); // Versus
    expect(actForTab(99)).toBeNull();
  });

  it('lists tabs for an act in display order', () => {
    expect(tabsForAct('decide')).toEqual([9]);
    expect(tabsForAct('understand')[0]).toBe(0); // ELI5 leads
    expect(tabsForAct('nope')).toEqual([]);
  });

  it('has a label for every tab it groups', () => {
    for (const t of ACTS.flatMap((a) => a.tabs)) {
      expect(typeof TAB_LABELS[t]).toBe('string');
      expect(TAB_LABELS[t].length).toBeGreaterThan(0);
    }
  });
});
