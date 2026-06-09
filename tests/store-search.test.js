import { describe, it, expect } from 'vitest';
import { rankRepos, tokens } from '../store/search.js';

const repo = (repoId, extra = {}) => ({ repoId, ...extra });

describe('tokens', () => {
  it('lowercases, splits, drops stopwords, keeps + # .', () => {
    expect(tokens('A Rust CLI for the C++ node.js')).toEqual(['rust', 'cli', 'c++', 'node.js']);
  });
});

describe('rankRepos', () => {
  const rows = [
    repo('a/rust-cli', { language: 'Rust', category: 'CLI', tags: ['terminal'] }),
    repo('b/rust-web', { language: 'Rust', category: 'web framework' }),
    repo('c/js-cli', { language: 'JavaScript', category: 'CLI' }),
  ];

  it('orders by token overlap, best first', () => {
    // query overlaps a/rust-cli on both "rust" and "cli" (2), b on "rust" (1), c on "cli" (1)
    const out = rankRepos(rows, 'Rust CLI', { topK: 3 });
    expect(out[0].repoId).toBe('a/rust-cli');
    expect(out).toHaveLength(3);
  });

  it('excludes the given repoId (self)', () => {
    const out = rankRepos(rows, 'Rust CLI', { excludeId: 'a/rust-cli', topK: 3 });
    expect(out.map((r) => r.repoId)).not.toContain('a/rust-cli');
  });

  it('caps results at topK', () => {
    expect(rankRepos(rows, 'Rust CLI', { topK: 1 })).toHaveLength(1);
  });

  it('returns [] for an empty query and for zero matches', () => {
    expect(rankRepos(rows, '', {})).toEqual([]);
    expect(rankRepos(rows, 'haskell quantum', {})).toEqual([]);
  });

  it('ignores malformed rows (no repoId)', () => {
    expect(rankRepos([{ language: 'Rust' }, null], 'Rust', {})).toEqual([]);
  });
});
