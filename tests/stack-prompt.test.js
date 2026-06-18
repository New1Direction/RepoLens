import { describe, it, expect } from 'vitest';
import { buildStackPrompt, parseStack, STACK_LAYERS } from '../stack-prompt.js';

const repos = [
  {
    repoId: 'trpc/trpc',
    eli5: 'End-to-end typesafe APIs.',
    capabilities: ['api', 'rpc', 'typescript'],
    category: 'API layer',
    language: 'TypeScript',
  },
  {
    repoId: 'prisma/prisma',
    eli5: 'Next-gen Node.js ORM.',
    capabilities: ['orm', 'database', 'migrations'],
    category: 'database',
    language: 'TypeScript',
  },
  {
    repoId: 'vercel/next.js',
    eli5: 'The React framework for the web.',
    capabilities: ['react', 'ssr', 'routing'],
    category: 'frontend framework',
    language: 'TypeScript',
  },
];

describe('STACK_LAYERS', () => {
  it('includes expected layer names', () => {
    expect(STACK_LAYERS).toContain('frontend');
    expect(STACK_LAYERS).toContain('backend');
    expect(STACK_LAYERS).toContain('data');
  });
});

describe('buildStackPrompt', () => {
  it('returns empty string for fewer than 2 repos', () => {
    expect(buildStackPrompt([repos[0]])).toBe('');
    expect(buildStackPrompt([])).toBe('');
  });

  it('returns empty string for null', () => {
    expect(buildStackPrompt(null)).toBe('');
  });

  it('returns empty string for non-array', () => {
    expect(buildStackPrompt('not an array')).toBe('');
  });

  it('includes all repo names', () => {
    const prompt = buildStackPrompt(repos);
    expect(prompt).toContain('trpc/trpc');
    expect(prompt).toContain('prisma/prisma');
    expect(prompt).toContain('vercel/next.js');
  });

  it('includes eli5 descriptions', () => {
    const prompt = buildStackPrompt(repos);
    expect(prompt).toContain('End-to-end typesafe APIs');
  });

  it('includes capabilities', () => {
    const prompt = buildStackPrompt(repos);
    expect(prompt).toContain('database');
  });

  it('requests a JSON response', () => {
    const prompt = buildStackPrompt(repos);
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"roles"');
    expect(prompt).toContain('"integrations"');
  });

  it('works with exactly 2 repos', () => {
    const prompt = buildStackPrompt(repos.slice(0, 2));
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('trpc/trpc');
  });
});

describe('parseStack', () => {
  it('returns null for null', () => {
    expect(parseStack(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseStack('')).toBeNull();
  });

  it('returns null when no JSON found', () => {
    expect(parseStack('plain text')).toBeNull();
  });

  it('parses a valid stack response', () => {
    const raw = JSON.stringify({
      title: 'T3 Stack',
      roles: [
        { repoId: 'trpc/trpc', role: 'API layer', layer: 'backend' },
        { repoId: 'prisma/prisma', role: 'Database ORM', layer: 'data' },
      ],
      integrations: [{ from: 'trpc/trpc', to: 'prisma/prisma', glue: 'tRPC resolvers call Prisma' }],
      gaps: ['Auth', 'Caching'],
      order: ['prisma/prisma', 'trpc/trpc'],
      summary: 'A typesafe full-stack setup.',
    });
    const result = parseStack(raw);
    expect(result).not.toBeNull();
    expect(result.title).toBe('T3 Stack');
    expect(result.roles).toHaveLength(2);
    expect(result.roles[0].layer).toBe('backend');
    expect(result.integrations).toHaveLength(1);
    expect(result.gaps).toContain('Auth');
    expect(result.order[0]).toBe('prisma/prisma');
  });

  it('normalizes unknown layer to tooling', () => {
    const raw = JSON.stringify({
      title: 'Stack',
      roles: [{ repoId: 'owner/a', role: 'unknown type', layer: 'UNKNOWN_LAYER' }],
      integrations: [],
      gaps: [],
      order: [],
      summary: '',
    });
    const result = parseStack(raw);
    expect(result?.roles[0].layer).toBe('tooling');
  });

  it('returns empty arrays for missing fields', () => {
    const raw = JSON.stringify({ title: 'Minimal', summary: 'A stack' });
    const result = parseStack(raw);
    expect(result?.roles).toEqual([]);
    expect(result?.integrations).toEqual([]);
    expect(result?.gaps).toEqual([]);
    expect(result?.order).toEqual([]);
  });

  it('returns null for malformed JSON', () => {
    expect(parseStack('{bad json')).toBeNull();
  });

  it('defaults title to Custom Stack if missing', () => {
    const raw = JSON.stringify({ summary: 'some stack', roles: [] });
    const result = parseStack(raw);
    expect(result?.title).toBe('Custom Stack');
  });
});
