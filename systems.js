// Systems lens — view the repo as a system in motion. Pick one process/dynamics
// framework and run it: Theory of Constraints, Feedback Loops, PDCA, or DMAIC.
// One focused AI call per framework. Reuses Deep Dive's source fetch + JSON
// extractor.

import { extractJsonObject } from './deepdive.js';

export const SYSTEMS_FRAMEWORKS = [
  { key: 'toc', label: 'Theory of Constraints', blurb: 'Find & break the single bottleneck.' },
  { key: 'loops', label: 'Feedback Loops', blurb: 'Reinforcing vs balancing loops.' },
  { key: 'pdca', label: 'PDCA', blurb: 'Plan · Do · Check · Act cycle.' },
  { key: 'dmaic', label: 'DMAIC', blurb: 'Define · Measure · Analyze · Improve · Control.' },
];

export function isFramework(key) {
  return SYSTEMS_FRAMEWORKS.some((f) => f.key === key);
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
  toc: (ctx) => `${ctx}

Apply the THEORY OF CONSTRAINTS: a system moves only as fast as its slowest part. Identify the SINGLE biggest bottleneck constraining this project (performance, architecture, or process), how to ruthlessly exploit/optimize it, and what becomes the NEXT constraint once it is resolved.

Return ONLY valid JSON, no markdown fences:
{
  "bottleneck": { "name": "The one constraint", "why": "Why it limits the whole system." },
  "exploit": ["Concrete action to relieve the constraint."],
  "next_bottleneck": { "name": "What constrains next", "why": "Why it surfaces once the first is fixed." }
}`,

  loops: (ctx) => `${ctx}

Apply SYSTEMS THINKING: map the feedback loops in this project. Reinforcing loops drive growth or collapse; balancing loops are self-stabilizing. Each loop is a cycle of 2–5 nodes that returns to its start.

Return ONLY valid JSON, no markdown fences:
{
  "loops": [
    { "type": "reinforcing", "name": "Loop name", "cycle": ["Node A", "Node B", "Node C"], "effect": "What this loop does to the system over time." }
  ]
}`,

  pdca: (ctx) => `${ctx}

Apply PDCA (the Deming cycle) to this project's continuous improvement. Describe how the project iterates — or should — across the four phases.

Return ONLY valid JSON, no markdown fences:
{
  "plan": "What gets planned each cycle (goals, hypotheses).",
  "do": "How changes are implemented / shipped.",
  "check": "How outcomes are measured and verified.",
  "act": "How learnings are standardized or rolled back."
}`,

  dmaic: (ctx) => `${ctx}

Apply DMAIC (Six Sigma) to reduce variance and defects in this project's workflow.

Return ONLY valid JSON, no markdown fences:
{
  "define": "The core goal / problem to improve.",
  "measure": ["A concrete, trackable metric."],
  "analyze": "The main sources of variance or defects.",
  "improve": ["A concrete improvement action."],
  "control": ["A mechanism to hold the gains."]
}`,
};

export function buildSystemsPrompt(framework, repoData, source) {
  const build = FRAMEWORK_PROMPTS[framework] || FRAMEWORK_PROMPTS.toc;
  return build(sourceContext(repoData, source));
}

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (Array.isArray(v) ? v.join(' ') : v || '');
const obj = (v) => (v && typeof v === 'object' ? v : {});

const FRAMEWORK_PARSERS = {
  toc(d) {
    const b = obj(d.bottleneck),
      n = obj(d.next_bottleneck);
    return {
      bottleneck: { name: b.name || '', why: b.why || '' },
      exploit: arr(d.exploit).map(String),
      next_bottleneck: { name: n.name || '', why: n.why || '' },
    };
  },
  loops(d) {
    return {
      loops: arr(d.loops).map((l) => ({
        type: l.type === 'balancing' ? 'balancing' : 'reinforcing',
        name: l.name || '',
        cycle: arr(l.cycle).map(String),
        effect: l.effect || '',
      })),
    };
  },
  pdca(d) {
    return { plan: str(d.plan), do: str(d.do), check: str(d.check), act: str(d.act) };
  },
  dmaic(d) {
    return {
      define: str(d.define),
      measure: arr(d.measure).map(String),
      analyze: str(d.analyze),
      improve: arr(d.improve).map(String),
      control: arr(d.control).map(String),
    };
  },
};

export function parseSystems(framework, rawText) {
  const data = extractJsonObject(rawText);
  const parse = FRAMEWORK_PARSERS[framework] || FRAMEWORK_PARSERS.toc;
  return parse(data);
}
