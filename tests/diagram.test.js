import { describe, it, expect } from 'vitest';
import { lineageSvg, loopSvg } from '../diagram.js';

const atoms = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
];
const links = [
  { from: 'a', to: 'b' },
  { from: 'b', to: 'c' },
];

describe('lineageSvg', () => {
  it('returns empty string for empty/missing input', () => {
    expect(lineageSvg([], [])).toBe('');
    expect(lineageSvg(atoms, [])).toBe('');
    expect(lineageSvg(null, null)).toBe('');
  });
  it('renders one node per atom and one edge per valid link', () => {
    const svg = lineageSvg(atoms, links);
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/class="dg-node"/g) || []).length).toBe(3);
    expect((svg.match(/class="dg-edge"/g) || []).length).toBe(2);
  });
  it('drops links referencing unknown ids', () => {
    const svg = lineageSvg(atoms, [
      { from: 'a', to: 'zzz' },
      { from: 'a', to: 'b' },
    ]);
    expect((svg.match(/class="dg-edge"/g) || []).length).toBe(1);
  });
  it('escapes node names', () => {
    const svg = lineageSvg(
      [
        { id: 'x', name: '<script>' },
        { id: 'y', name: 'Y' },
      ],
      [{ from: 'x', to: 'y' }]
    );
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });
  it('escapes quotes in node names (canonical escaper, no attribute drift)', () => {
    const svg = lineageSvg(
      [
        { id: 'x', name: '"q"' },
        { id: 'y', name: 'Y' },
      ],
      [{ from: 'x', to: 'y' }]
    );
    expect(svg).toContain('&quot;q&quot;');
  });
});

describe('loopSvg', () => {
  it('returns empty string for cycles shorter than 2', () => {
    expect(loopSvg([], 'reinforcing')).toBe('');
    expect(loopSvg(['only'], 'reinforcing')).toBe('');
  });
  it('renders one line and one dot per node', () => {
    const svg = loopSvg(['A', 'B', 'C'], 'reinforcing');
    expect((svg.match(/<line /g) || []).length).toBe(3);
    expect((svg.match(/class="dg-dot/g) || []).length).toBe(3);
  });
  it('uses balancing class for balancing, reinforcing otherwise', () => {
    expect(loopSvg(['A', 'B'], 'balancing')).toContain('dg-bal');
    expect(loopSvg(['A', 'B'], 'reinforcing')).toContain('dg-rein');
    expect(loopSvg(['A', 'B'], 'whatever')).toContain('dg-rein');
  });
  it('escapes node labels', () => {
    expect(loopSvg(['<b>', 'B'], 'reinforcing')).toContain('&lt;b&gt;');
  });
});
