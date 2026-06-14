import { describe, it, expect } from 'vitest';
import { buildFitsStackPrompt, parseFitsStack, FITS_VERDICTS } from '../fits-stack.js';

const repo = {
  repoId: 'owner/new-lib',
  description: 'A fast HTTP client',
  language: 'TypeScript',
  category: 'networking',
  capabilities: ['http', 'fetch', 'retry'],
};

const library = [
  { repoId: 'owner/existing-a', eli5: 'A state manager for UIs.', capabilities: ['state', 'reactivity'] },
  { repoId: 'owner/existing-b', eli5: 'A build tool.', capabilities: ['bundling', 'esm'] },
];

describe('FITS_VERDICTS', () => {
  it('contains the three expected verdict keys', () => {
    expect(FITS_VERDICTS).toContain('slots-in');
    expect(FITS_VERDICTS).toContain('new-paradigm');
    expect(FITS_VERDICTS).toContain('conflict');
  });
});

describe('buildFitsStackPrompt', () => {
  it('returns empty string for null repoData', () => {
    expect(buildFitsStackPrompt(null, library)).toBe('');
  });

  it('returns empty string for undefined repoData', () => {
    expect(buildFitsStackPrompt(undefined, library)).toBe('');
  });

  it('returns empty string when nearestRepos is empty', () => {
    expect(buildFitsStackPrompt(repo, [])).toBe('');
  });

  it('returns empty string when nearestRepos is not an array', () => {
    expect(buildFitsStackPrompt(repo, null)).toBe('');
  });

  it('includes the repo id', () => {
    const prompt = buildFitsStackPrompt(repo, library);
    expect(prompt).toContain('owner/new-lib');
  });

  it('includes library repo ids', () => {
    const prompt = buildFitsStackPrompt(repo, library);
    expect(prompt).toContain('owner/existing-a');
    expect(prompt).toContain('owner/existing-b');
  });

  it('includes repo language and category', () => {
    const prompt = buildFitsStackPrompt(repo, library);
    expect(prompt).toContain('TypeScript');
    expect(prompt).toContain('networking');
  });

  it('includes capabilities in the library context', () => {
    const prompt = buildFitsStackPrompt(repo, library);
    expect(prompt).toContain('state');
  });

  it('requests JSON response with verdict field', () => {
    const prompt = buildFitsStackPrompt(repo, library);
    expect(prompt).toContain('"verdict"');
  });
});

describe('parseFitsStack', () => {
  it('returns null for null input', () => {
    expect(parseFitsStack(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseFitsStack('')).toBeNull();
  });

  it('returns null when no JSON object found', () => {
    expect(parseFitsStack('some plain text without json')).toBeNull();
  });

  it('parses a valid slots-in response', () => {
    const raw = JSON.stringify({
      verdict: 'slots-in',
      summary: 'Fills the HTTP client gap.',
      integrations: ['Works alongside state manager'],
      risks: ['Adds bundle weight'],
      recommendation: 'Adopt it.',
    });
    const result = parseFitsStack(raw);
    expect(result).not.toBeNull();
    expect(result.verdict).toBe('slots-in');
    expect(result.summary).toBe('Fills the HTTP client gap.');
  });

  it('normalizes unknown verdict to new-paradigm', () => {
    const raw = JSON.stringify({ verdict: 'maybe', summary: 'unclear' });
    const result = parseFitsStack(raw);
    expect(result?.verdict).toBe('new-paradigm');
  });

  it('returns empty arrays for missing integrations/risks', () => {
    const raw = JSON.stringify({ verdict: 'conflict', summary: 'bad match' });
    const result = parseFitsStack(raw);
    expect(result?.integrations).toEqual([]);
    expect(result?.risks).toEqual([]);
  });

  it('returns null for malformed JSON', () => {
    expect(parseFitsStack('{broken json')).toBeNull();
  });

  it('parses all three verdict types', () => {
    for (const verdict of FITS_VERDICTS) {
      const raw = JSON.stringify({ verdict, summary: 'test', integrations: [], risks: [], recommendation: 'ok' });
      const result = parseFitsStack(raw);
      expect(result?.verdict).toBe(verdict);
    }
  });

  it('trims whitespace from summary and recommendation', () => {
    const raw = JSON.stringify({ verdict: 'slots-in', summary: '  spaces  ', recommendation: '  do it  ' });
    const result = parseFitsStack(raw);
    expect(result?.summary).toBe('spaces');
    expect(result?.recommendation).toBe('do it');
  });
});
