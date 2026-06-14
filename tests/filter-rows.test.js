import { describe, it, expect } from 'vitest';
import { filterRows } from '../library-data.js';

const row = (repoId, opts = {}) => ({
  repoId,
  name: repoId.split('/').pop() || repoId,
  blurb: opts.blurb || '',
  capabilities: opts.caps || [],
  languages: opts.langs ? [{ name: opts.langs, pct: 100 }] : [],
  category: opts.cat || '',
  fit: { level: 'solid' },
  health: 80,
});

describe('filterRows', () => {
  const rows = [
    row('facebook/react', { blurb: 'UI library', caps: ['frontend', 'rendering'], langs: 'JavaScript' }),
    row('vuejs/vue', { blurb: 'Progressive framework', caps: ['frontend'], langs: 'TypeScript' }),
    row('django/django', { blurb: 'Web framework', caps: ['backend', 'orm'], langs: 'Python' }),
    row('numpy/numpy', { blurb: 'Scientific computing', caps: ['data', 'math'], langs: 'Python' }),
  ];

  it('returns all rows when no query', () => {
    expect(filterRows(rows, {})).toHaveLength(4);
  });

  it('matches on repoId', () => {
    expect(filterRows(rows, { query: 'react' })).toHaveLength(1);
    expect(filterRows(rows, { query: 'react' })[0].repoId).toBe('facebook/react');
  });

  it('matches on blurb', () => {
    const res = filterRows(rows, { query: 'framework' });
    expect(res.map(r => r.repoId)).toContain('vuejs/vue');
    expect(res.map(r => r.repoId)).toContain('django/django');
  });

  it('matches on capability', () => {
    const res = filterRows(rows, { query: 'orm' });
    expect(res).toHaveLength(1);
    expect(res[0].repoId).toBe('django/django');
  });

  it('matches on language', () => {
    const res = filterRows(rows, { query: 'python' });
    expect(res).toHaveLength(2);
  });

  it('filters by capability tag', () => {
    const res = filterRows(rows, { capability: 'backend' });
    expect(res).toHaveLength(1);
    expect(res[0].repoId).toBe('django/django');
  });

  it('ranks exact name match highest', () => {
    const res = filterRows(rows, { query: 'vue' });
    expect(res[0].repoId).toBe('vuejs/vue');
  });

  it('returns empty array when nothing matches', () => {
    expect(filterRows(rows, { query: 'zzznomatch' })).toHaveLength(0);
  });
});
