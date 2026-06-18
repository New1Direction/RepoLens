// Heuristics lens — prioritization rules of thumb for deciding what's even worth
// solving. Pick one and run it: Pareto (80/20) or the Eisenhower Matrix. One
// focused AI call per framework. Reuses Deep Dive's JSON extractor.

import { extractJsonObject } from './deepdive.js';

export const HEURISTICS_FRAMEWORKS = [
  { key: 'pareto', label: 'Pareto (80/20)', blurb: 'The 20% causing 80% of the friction.' },
  { key: 'eisenhower', label: 'Eisenhower Matrix', blurb: 'Urgent × Important — do, plan, delegate, drop.' },
];

export function isHeuristicFramework(key) {
  return HEURISTICS_FRAMEWORKS.some((f) => f.key === key);
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
  pareto: (ctx) => `${ctx}

Apply the PARETO PRINCIPLE (80/20) to this project. Identify the roughly 20% of factors — modules, dependencies, decisions, or issues — responsible for roughly 80% of the friction, risk, or value. Rank that vital few, and say what the long-tail 80% is that can safely be deprioritized.

Return ONLY valid JSON, no markdown fences:
{
  "vital_few": [ { "factor": "The high-leverage factor.", "impact": "The ~80% outcome it drives.", "share": "e.g. ~50% of the complexity" } ],
  "trivial_many": "What the remaining ~80% of factors are, and why they can wait."
}`,

  eisenhower: (ctx) => `${ctx}

Apply the EISENHOWER MATRIX to the work facing anyone building on or maintaining this project. Sort concrete tasks/concerns into four quadrants by Urgency and Importance. Remember: many urgent things are not important, and the most important work (architecture, hardening) is rarely urgent.

Return ONLY valid JSON, no markdown fences:
{
  "do": ["Important AND urgent — do now."],
  "schedule": ["Important, NOT urgent — plan it in."],
  "delegate": ["Urgent, NOT important — delegate or automate."],
  "eliminate": ["Neither — drop it."]
}`,
};

export function buildHeuristicsPrompt(framework, repoData, source) {
  const build = FRAMEWORK_PROMPTS[framework] || FRAMEWORK_PROMPTS.pareto;
  return build(sourceContext(repoData, source));
}

const arr = (v) => (Array.isArray(v) ? v : []);

const FRAMEWORK_PARSERS = {
  pareto(d) {
    return {
      vital_few: arr(d.vital_few).map((v) => ({
        factor: v.factor || '',
        impact: v.impact || '',
        share: v.share || '',
      })),
      trivial_many: d.trivial_many || '',
    };
  },
  eisenhower(d) {
    return {
      do: arr(d.do).map(String),
      schedule: arr(d.schedule).map(String),
      delegate: arr(d.delegate).map(String),
      eliminate: arr(d.eliminate).map(String),
    };
  },
};

export function parseHeuristics(framework, rawText) {
  const data = extractJsonObject(rawText);
  const parse = FRAMEWORK_PARSERS[framework] || FRAMEWORK_PARSERS.pareto;
  return parse(data);
}
