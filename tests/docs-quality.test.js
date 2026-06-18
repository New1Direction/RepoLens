import { describe, it, expect } from 'vitest';
import { buildDocsQualityPrompt, parseDocsQuality, DOCS_GRADES, DOCS_VERDICTS } from '../docs-quality.js';

// ─── buildDocsQualityPrompt ───────────────────────────────────────────────────

describe('buildDocsQualityPrompt', () => {
  const baseRepo = {
    repoId: 'acme/widget',
    description: 'A widget library',
    language: 'TypeScript',
    readme: '# Widget\n\nInstall: `npm install widget`\n\n## Usage\n\n```js\nconst w = new Widget();\n```',
  };

  it('includes the repoId and description', () => {
    const prompt = buildDocsQualityPrompt(baseRepo, { tree: [] });
    expect(prompt).toContain('acme/widget');
    expect(prompt).toContain('A widget library');
  });

  it('includes the README content', () => {
    const prompt = buildDocsQualityPrompt(baseRepo, { tree: [] });
    expect(prompt).toContain('# Widget');
    expect(prompt).toContain('npm install widget');
  });

  it('detects CHANGELOG in the file tree', () => {
    const source = { tree: ['CHANGELOG.md', 'src/index.ts'] };
    const prompt = buildDocsQualityPrompt(baseRepo, source);
    expect(prompt).toContain('Has CHANGELOG: true');
  });

  it('detects CONTRIBUTING in the file tree', () => {
    const source = { tree: ['CONTRIBUTING.md', 'README.md'] };
    const prompt = buildDocsQualityPrompt(baseRepo, source);
    expect(prompt).toContain('Has CONTRIBUTING: true');
  });

  it('detects docs/ directory in the file tree', () => {
    const source = { tree: ['docs/api.md', 'docs/guide.md', 'src/index.ts'] };
    const prompt = buildDocsQualityPrompt(baseRepo, source);
    expect(prompt).toContain('Has docs/ or documentation/ directory: true');
  });

  it('reports false for absent structural signals', () => {
    const prompt = buildDocsQualityPrompt(baseRepo, { tree: ['src/index.ts'] });
    expect(prompt).toContain('Has CHANGELOG: false');
    expect(prompt).toContain('Has CONTRIBUTING: false');
    expect(prompt).toContain('Has docs/ or documentation/ directory: false');
  });

  it('truncates a very long README to 6000 chars', () => {
    const longReadme = 'x'.repeat(10000);
    const prompt = buildDocsQualityPrompt({ ...baseRepo, readme: longReadme }, { tree: [] });
    const readmeIdx = prompt.indexOf('x'.repeat(6000));
    expect(readmeIdx).toBeGreaterThan(-1);
    expect(prompt).not.toContain('x'.repeat(6001));
  });

  it('falls back gracefully when readme is missing', () => {
    const prompt = buildDocsQualityPrompt({ ...baseRepo, readme: '' }, { tree: [] });
    expect(prompt).toContain('(no README found)');
  });

  it('handles a null/missing source gracefully', () => {
    expect(() => buildDocsQualityPrompt(baseRepo, null)).not.toThrow();
    expect(() => buildDocsQualityPrompt(baseRepo, undefined)).not.toThrow();
  });

  it('asks for JSON with the expected fields', () => {
    const prompt = buildDocsQualityPrompt(baseRepo, { tree: [] });
    expect(prompt).toContain('"score"');
    expect(prompt).toContain('"grade"');
    expect(prompt).toContain('"overall_verdict"');
    expect(prompt).toContain('"sections"');
    expect(prompt).toContain('"strengths"');
    expect(prompt).toContain('"gaps"');
  });
});

// ─── parseDocsQuality ─────────────────────────────────────────────────────────

describe('parseDocsQuality', () => {
  const validResult = {
    score: 72,
    grade: 'B',
    summary: 'Solid README but missing API reference.',
    overall_verdict: 'partially',
    sections: [
      { name: 'README', score: 85, verdict: 'Well structured.', missing: [] },
      { name: 'Quickstart', score: 90, verdict: 'Clear install steps.', missing: [] },
      { name: 'Code Examples', score: 70, verdict: 'A few examples present.', missing: [] },
      { name: 'API Reference', score: 20, verdict: 'Sparse.', missing: ['Function signatures'] },
      { name: 'Changelog', score: 0, verdict: 'No changelog found.', missing: ['CHANGELOG.md'] },
      { name: 'Contributing', score: 60, verdict: 'Basic guidelines.', missing: [] },
    ],
    strengths: ['Clear quickstart', 'Working examples'],
    gaps: ['No API reference', 'No changelog'],
  };

  const wrap = (obj) => JSON.stringify(obj);

  it('parses a valid JSON response', () => {
    const result = parseDocsQuality(wrap(validResult));
    expect(result.score).toBe(72);
    expect(result.grade).toBe('B');
    expect(result.overall_verdict).toBe('partially');
    expect(result.summary).toBe('Solid README but missing API reference.');
  });

  it('returns all six sections', () => {
    const result = parseDocsQuality(wrap(validResult));
    expect(result.sections).toHaveLength(6);
    expect(result.sections[0].name).toBe('README');
    expect(result.sections[0].score).toBe(85);
  });

  it('clamps scores to 0–100', () => {
    const r = parseDocsQuality(
      wrap({ ...validResult, score: 150, sections: [{ name: 'X', score: -10, verdict: 'v', missing: [] }] })
    );
    expect(r.score).toBe(100);
    expect(r.sections[0].score).toBe(0);
  });

  it('returns strengths and gaps arrays', () => {
    const result = parseDocsQuality(wrap(validResult));
    expect(result.strengths).toEqual(['Clear quickstart', 'Working examples']);
    expect(result.gaps).toEqual(['No API reference', 'No changelog']);
  });

  it('derives grade from score when grade is invalid', () => {
    const r = parseDocsQuality(wrap({ ...validResult, grade: 'Z', score: 82 }));
    expect(r.grade).toBe('B');
  });

  it('derives overall_verdict from score when verdict is invalid', () => {
    const r = parseDocsQuality(wrap({ ...validResult, overall_verdict: 'maybe', score: 85 }));
    expect(r.overall_verdict).toBe('yes');
  });

  it('returns "no" verdict for score below 50', () => {
    const r = parseDocsQuality(wrap({ ...validResult, overall_verdict: 'bad', score: 35 }));
    expect(r.overall_verdict).toBe('no');
  });

  it('handles missing sections array gracefully', () => {
    const r = parseDocsQuality(wrap({ ...validResult, sections: undefined }));
    expect(r.sections).toEqual([]);
  });

  it('handles missing strengths/gaps gracefully', () => {
    const r = parseDocsQuality(wrap({ ...validResult, strengths: null, gaps: null }));
    expect(r.strengths).toEqual([]);
    expect(r.gaps).toEqual([]);
  });

  it('strips markdown fences from the response', () => {
    const fenced = '```json\n' + wrap(validResult) + '\n```';
    const r = parseDocsQuality(fenced);
    expect(r.score).toBe(72);
  });

  it('grade A at score 95', () => {
    const r = parseDocsQuality(wrap({ ...validResult, score: 95, grade: 'X' }));
    expect(r.grade).toBe('A');
  });

  it('grade F at score 30', () => {
    const r = parseDocsQuality(wrap({ ...validResult, score: 30, grade: 'X' }));
    expect(r.grade).toBe('F');
  });
});

// ─── constants ────────────────────────────────────────────────────────────────

describe('DOCS_GRADES and DOCS_VERDICTS', () => {
  it('DOCS_GRADES contains A B C D F', () => {
    expect(DOCS_GRADES).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D', 'F']));
  });

  it('DOCS_VERDICTS contains yes partially no', () => {
    expect(DOCS_VERDICTS).toEqual(expect.arrayContaining(['yes', 'partially', 'no']));
  });
});
