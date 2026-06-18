import { describe, it, expect } from 'vitest';
import { bucketFor, checkPairCompat, checkLibraryCompat, SPDX_BUCKETS } from '../license-compat.js';

describe('bucketFor', () => {
  it('classifies MIT as permissive', () => expect(bucketFor('MIT')).toBe('permissive'));
  it('classifies Apache-2.0 as permissive', () => expect(bucketFor('Apache-2.0')).toBe('permissive'));
  it('classifies BSD-3-Clause as permissive', () => expect(bucketFor('BSD-3-Clause')).toBe('permissive'));
  it('classifies LGPL-2.1-only as weak-copyleft', () =>
    expect(bucketFor('LGPL-2.1-only')).toBe('weak-copyleft'));
  it('classifies MPL-2.0 as weak-copyleft', () => expect(bucketFor('MPL-2.0')).toBe('weak-copyleft'));
  it('classifies GPL-3.0-only as strong-copyleft', () =>
    expect(bucketFor('GPL-3.0-only')).toBe('strong-copyleft'));
  it('classifies AGPL-3.0-only as strong-copyleft', () =>
    expect(bucketFor('AGPL-3.0-only')).toBe('strong-copyleft'));
  it('normalizes GPL-3.0 alias', () => expect(bucketFor('GPL-3.0')).toBe('strong-copyleft'));
  it('normalizes LGPL-2.1 alias', () => expect(bucketFor('LGPL-2.1')).toBe('weak-copyleft'));
  it('returns unknown for unrecognized license', () => expect(bucketFor('Proprietary')).toBe('unknown'));
  it('returns unknown for empty string', () => expect(bucketFor('')).toBe('unknown'));
  it('returns unknown for null', () => expect(bucketFor(null)).toBe('unknown'));
  it('returns unknown for "Unknown"', () => expect(bucketFor('Unknown')).toBe('unknown'));
  it('SPDX_BUCKETS has at least 10 entries', () =>
    expect(Object.keys(SPDX_BUCKETS).length).toBeGreaterThan(10));
});

describe('checkPairCompat', () => {
  it('permissive + permissive → ok', () => {
    expect(checkPairCompat('MIT', 'Apache-2.0').status).toBe('ok');
  });
  it('permissive + weak-copyleft → ok', () => {
    expect(checkPairCompat('MIT', 'LGPL-2.1-only').status).toBe('ok');
  });
  it('permissive + strong-copyleft → conflict', () => {
    expect(checkPairCompat('MIT', 'GPL-3.0-only').status).toBe('conflict');
  });
  it('strong-copyleft + permissive → conflict', () => {
    expect(checkPairCompat('GPL-3.0-only', 'MIT').status).toBe('conflict');
  });
  it('same strong-copyleft family → ok', () => {
    expect(checkPairCompat('GPL-3.0-only', 'GPL-3.0-or-later').status).toBe('ok');
  });
  it('two different strong-copyleft licenses → conflict', () => {
    expect(checkPairCompat('GPL-3.0-only', 'AGPL-3.0-only').status).toBe('conflict');
  });
  it('weak + weak → warn', () => {
    expect(checkPairCompat('LGPL-2.1-only', 'MPL-2.0').status).toBe('warn');
  });
  it('unknown license → warn', () => {
    expect(checkPairCompat('MIT', 'Proprietary').status).toBe('warn');
  });
  it('both unknown → warn', () => {
    expect(checkPairCompat('Unknown', 'Unknown').status).toBe('warn');
  });
});

describe('checkLibraryCompat', () => {
  const library = [
    { repoId: 'a/react', license: 'MIT' },
    { repoId: 'b/vue', license: 'MIT' },
    { repoId: 'c/linuxpkg', license: 'GPL-2.0-only' },
  ];

  it('returns a summary string', () => {
    const r = checkLibraryCompat('MIT', library);
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it('finds conflicts with GPL-licensed repos', () => {
    const r = checkLibraryCompat('Proprietary', library);
    const gplConflict = r.concerns.some((c) => c.repoId === 'c/linuxpkg');
    expect(gplConflict).toBe(true);
  });

  it('no conflicts for all-permissive library', () => {
    const permLib = [
      { repoId: 'a/x', license: 'MIT' },
      { repoId: 'b/y', license: 'Apache-2.0' },
    ];
    const r = checkLibraryCompat('MIT', permLib);
    expect(r.concerns.filter((c) => c.status === 'conflict')).toHaveLength(0);
  });

  it('totalChecked excludes Unknown licenses', () => {
    const lib = [
      { repoId: 'a/x', license: 'MIT' },
      { repoId: 'b/y', license: 'Unknown' },
    ];
    const r = checkLibraryCompat('MIT', lib);
    expect(r.totalChecked).toBe(1);
  });

  it('returns currentBucket', () => {
    const r = checkLibraryCompat('MIT', library);
    expect(r.currentBucket).toBe('permissive');
  });

  it('handles empty library', () => {
    const r = checkLibraryCompat('MIT', []);
    expect(r.totalChecked).toBe(0);
    expect(r.concerns).toHaveLength(0);
  });

  it('handles null library', () => {
    const r = checkLibraryCompat('MIT', null);
    expect(r.totalChecked).toBe(0);
  });
});
