// Ideate lens — creative generation. Pick one ideation framework and run it to
// invent new features or bypass a constraint: TRIZ, SCAMPER, Lateral Thinking,
// or Morphological Analysis. One focused AI call per framework. Reuses Deep
// Dive's JSON extractor.

import { extractJsonObject } from './deepdive.js';

export const IDEATE_FRAMEWORKS = [
  { key: 'triz', label: 'TRIZ', blurb: 'Resolve a contradiction with inventive principles.' },
  {
    key: 'scamper',
    label: 'SCAMPER',
    blurb: 'Substitute · Combine · Adapt · Modify · Put · Eliminate · Reverse.',
  },
  { key: 'lateral', label: 'Lateral Thinking', blurb: 'A random provocation → a radical angle.' },
  { key: 'morph', label: 'Morphological', blurb: 'Cross every variable to find novel combos.' },
];

export function isIdeateFramework(key) {
  return IDEATE_FRAMEWORKS.some((f) => f.key === key);
}

function sourceContext(repoData, source) {
  const tree = source?.tree?.length
    ? `File tree (truncated):\n${source.tree.join('\n')}`
    : '(no file tree — work from the README + description)';
  const files = source?.files?.length
    ? source.files.map((f) => `=== ${f.path} ===\n${f.content}`).join('\n\n')
    : '(no source files available)';
  return `Repository: ${repoData.repoId}
Description: ${repoData.description || '—'}
Language: ${repoData.language || 'Unknown'}

${tree}

Key source files:
${files}`;
}

const FRAMEWORK_PROMPTS = {
  triz: (ctx) => `${ctx}

You are inventing improvements for this project using TRIZ (Theory of Inventive Problem Solving). Identify a core engineering CONTRADICTION (something that gets worse when you improve something else, e.g. "richer analysis vs. speed"), then apply 2–4 of the 40 TRIZ inventive principles to resolve it WITHOUT compromise, and state the resulting invention.

Return ONLY valid JSON, no markdown fences:
{
  "contradiction": { "improving": "What we want to improve.", "worsening": "What that normally makes worse." },
  "principles": [ { "number": 15, "name": "Dynamics", "application": "How this principle applies here." } ],
  "idea": "The resolved inventive concept."
}`,

  scamper: (ctx) => `${ctx}

Apply SCAMPER to invent new features for this project. Give one concrete, specific idea for each of the seven lenses.

Return ONLY valid JSON, no markdown fences:
{
  "items": [
    { "lens": "Substitute", "idea": "..." },
    { "lens": "Combine", "idea": "..." },
    { "lens": "Adapt", "idea": "..." },
    { "lens": "Modify", "idea": "..." },
    { "lens": "Put to another use", "idea": "..." },
    { "lens": "Eliminate", "idea": "..." },
    { "lens": "Reverse", "idea": "..." }
  ]
}`,

  lateral: (ctx) => `${ctx}

Apply LATERAL THINKING (Edward de Bono). Introduce a deliberately RANDOM, unrelated provocation, make the lateral leap from it to this project, and propose 2–3 radical features or approaches that a straight logical analysis would never reach.

Return ONLY valid JSON, no markdown fences:
{
  "provocation": "A random, unrelated provocation.",
  "leap": "How that provocation reframes the project.",
  "ideas": ["A radical idea it unlocks."]
}`,

  morph: (ctx) => `${ctx}

Apply MORPHOLOGICAL ANALYSIS. Break this project's design space into 2–4 variables (axes), give each 2–4 options, then surface 2–3 NOVEL combinations that no one would naturally pick, with the concept each yields.

Return ONLY valid JSON, no markdown fences:
{
  "dimensions": [ { "axis": "Variable name", "options": ["option a", "option b"] } ],
  "combinations": [ { "picks": ["option per axis, in order"], "concept": "The novel solution this combo produces." } ]
}`,
};

export function buildIdeatePrompt(framework, repoData, source) {
  const build = FRAMEWORK_PROMPTS[framework] || FRAMEWORK_PROMPTS.triz;
  return build(sourceContext(repoData, source));
}

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : {});

const FRAMEWORK_PARSERS = {
  triz(d) {
    const c = obj(d.contradiction);
    return {
      contradiction: { improving: c.improving || '', worsening: c.worsening || '' },
      principles: arr(d.principles).map((p) => ({
        number: p.number ?? '',
        name: p.name || '',
        application: p.application || '',
      })),
      idea: d.idea || '',
    };
  },
  scamper(d) {
    return { items: arr(d.items).map((i) => ({ lens: i.lens || '', idea: i.idea || '' })) };
  },
  lateral(d) {
    return { provocation: d.provocation || '', leap: d.leap || '', ideas: arr(d.ideas).map(String) };
  },
  morph(d) {
    return {
      dimensions: arr(d.dimensions).map((dim) => ({
        axis: dim.axis || '',
        options: arr(dim.options).map(String),
      })),
      combinations: arr(d.combinations).map((c) => ({
        picks: arr(c.picks).map(String),
        concept: c.concept || '',
      })),
    };
  },
};

export function parseIdeate(framework, rawText) {
  const data = extractJsonObject(rawText);
  const parse = FRAMEWORK_PARSERS[framework] || FRAMEWORK_PARSERS.triz;
  return parse(data);
}
