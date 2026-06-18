import { describe, it, expect } from 'vitest';
import { buildStackScene } from '../stack-scene.js';

const result = {
  title: 'Edge API stack',
  roles: [
    { repoId: 'honojs/hono', role: 'HTTP router', layer: 'backend' },
    { repoId: 'drizzle-team/drizzle-orm', role: 'data layer', layer: 'data' },
  ],
  integrations: [{ from: 'honojs/hono', to: 'drizzle-team/drizzle-orm', glue: 'handlers call the ORM' }],
  gaps: ['no auth layer'],
  order: ['honojs/hono', 'drizzle-team/drizzle-orm'],
  summary: 'A minimal edge API.',
};

describe('buildStackScene', () => {
  it('maps roles→repo nodes (with layer), integrations→edges (glue note), gaps→gap nodes', () => {
    const s = buildStackScene(result);
    expect(s.scope).toBe('stack');
    const hono = s.nodes.find((n) => n.id === 'honojs/hono');
    expect(hono.kind).toBe('repo');
    expect(hono.layer).toBe('backend');
    expect(hono.ref.role).toBe('HTTP router');
    expect(s.edges[0]).toMatchObject({
      from: 'honojs/hono',
      to: 'drizzle-team/drizzle-orm',
      rel: 'integrates',
      note: 'handlers call the ORM',
    });
    const gap = s.nodes.find((n) => n.kind === 'gap');
    expect(gap.label).toBe('no auth layer');
    expect(s.source.order).toEqual(['honojs/hono', 'drizzle-team/drizzle-orm']);
  });
  it('drops integrations whose endpoints are not roles', () => {
    const s = buildStackScene({
      roles: [{ repoId: 'a/b', role: 'x', layer: 'tooling' }],
      integrations: [{ from: 'a/b', to: 'ghost', glue: 'g' }],
      gaps: [],
      order: [],
    });
    expect(s.edges).toHaveLength(0);
  });
  it('handles a missing/empty result without throwing', () => {
    const s = buildStackScene(null);
    expect(s.scope).toBe('stack');
    expect(s.nodes).toEqual([]);
  });
});
