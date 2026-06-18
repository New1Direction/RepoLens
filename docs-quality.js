// Documentation Quality — scores a repo's documentation completeness and
// developer-experience quality. One AI call, uses the README + file tree.
// Core question: "Can I use this without reading the source?"

import { extractJsonObject } from './deepdive.js';

export const DOCS_GRADES = ['A', 'B', 'C', 'D', 'F'];
export const DOCS_VERDICTS = ['yes', 'partially', 'no'];

function docsContext(repoData, source) {
  const tree = source?.tree ?? [];

  const hasFile = (patterns) => patterns.some((p) => tree.some((f) => f.toLowerCase().includes(p)));

  const signals = [
    `Has CHANGELOG: ${hasFile(['changelog', 'changes', 'history', 'news', 'releases'])}`,
    `Has CONTRIBUTING: ${hasFile(['contributing', 'contribute'])}`,
    `Has docs/ or documentation/ directory: ${hasFile(['docs/', 'documentation/', 'doc/'])}`,
    `Has API reference file: ${hasFile(['api.md', 'api/', 'reference.md', 'docs/api'])}`,
    `Has examples/ directory: ${hasFile(['examples/', 'example/', 'samples/', 'demo/'])}`,
  ].join('\n');

  const readme = repoData.readme ? repoData.readme.slice(0, 6000) : '(no README found)';

  return `Repository: ${repoData.repoId}
Description: ${repoData.description || '—'}
Language: ${repoData.language || 'Unknown'}

Structural signals (from file tree):
${signals}

README content:
${readme}`;
}

export function buildDocsQualityPrompt(repoData, source) {
  return `${docsContext(repoData, source)}

Evaluate this repository's documentation quality as a developer-experience assessment. Core question: can a developer understand, install, and use this project without reading the source code?

Score these six sections (0–100 each):
- README completeness (weight 25%): Does it cover what, why, install, and basic usage? Is it well-structured?
- Quickstart / Getting Started (weight 20%): Can a dev run something in <5 minutes from the README alone?
- Code Examples (weight 20%): Are there working, copy-pasteable examples for real use-cases?
- API Reference (weight 15%): Are public APIs, functions, or endpoints documented?
- Changelog (weight 10%): Is there a changelog that tracks releases and breaking changes?
- Contributing guide (weight 10%): Are there clear instructions for contributors?

Rules:
- Be honest and critical. A minimal one-paragraph README should not score above 50.
- A missing section scores 0; present-but-thin scores 10–40; solid 60–80; excellent 90–100.
- The overall score is the weighted average rounded to the nearest integer.
- overall_verdict: "yes" if score ≥ 80, "partially" if score ≥ 50, "no" if below 50.
- grade: A (90+), B (75–89), C (60–74), D (40–59), F (<40).

Return ONLY valid JSON, no markdown fences:
{
  "score": 0,
  "grade": "A|B|C|D|F",
  "summary": "One honest sentence.",
  "overall_verdict": "yes|partially|no",
  "sections": [
    { "name": "README", "score": 0, "verdict": "…", "missing": ["item"] },
    { "name": "Quickstart", "score": 0, "verdict": "…", "missing": [] },
    { "name": "Code Examples", "score": 0, "verdict": "…", "missing": [] },
    { "name": "API Reference", "score": 0, "verdict": "…", "missing": [] },
    { "name": "Changelog", "score": 0, "verdict": "…", "missing": [] },
    { "name": "Contributing", "score": 0, "verdict": "…", "missing": [] }
  ],
  "strengths": ["strength 1"],
  "gaps": ["gap 1"]
}`;
}

const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function verdictFromScore(score) {
  if (score >= 80) return 'yes';
  if (score >= 50) return 'partially';
  return 'no';
}

export function parseDocsQuality(rawText) {
  const d = extractJsonObject(rawText);

  const score = clamp(d.score);
  const grade = DOCS_GRADES.includes(d.grade) ? d.grade : gradeFromScore(score);
  const overall_verdict = DOCS_VERDICTS.includes(d.overall_verdict)
    ? d.overall_verdict
    : verdictFromScore(score);

  const sections = Array.isArray(d.sections)
    ? d.sections.map((s) => ({
        name: String(s.name || ''),
        score: clamp(s.score),
        verdict: String(s.verdict || ''),
        missing: Array.isArray(s.missing) ? s.missing.map(String) : [],
      }))
    : [];

  return {
    score,
    grade,
    summary: String(d.summary || ''),
    overall_verdict,
    sections,
    strengths: Array.isArray(d.strengths) ? d.strengths.map(String) : [],
    gaps: Array.isArray(d.gaps) ? d.gaps.map(String) : [],
  };
}
