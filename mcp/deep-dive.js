// deep_dive tool: RepoLens's plain-English Deep Dive — explain how a repo really
// works, with the gaps and confidence made explicit.
//
// Pipeline (extension modules, verbatim): fetchRepoData + fetchSource ->
// atoms prompt/parse -> lineage prompt/parse -> Feynman prompt/parse. THREE
// model calls (atoms, lineage, Feynman), so this is the heaviest tool. `facts`
// is null — the extension's local "runner" (measured metrics) isn't part of a
// headless MCP, and factsBlock('') degrades cleanly.

import { fetchRepoData } from '../fetcher.js';
import {
  fetchSource,
  buildAtomsPrompt,
  parseAtoms,
  buildLineagePrompt,
  parseLineage,
  buildFeynmanPrompt,
  parseFeynman,
} from '../deepdive.js';
import { parseRepoInput } from './repo-input.js';
import { callAnthropic } from './anthropic.js';
import { ghOpts } from './github-auth.js';

export const DEEP_DIVE_TOOL = {
  name: 'deep_dive',
  description:
    'Explain how a GitHub repo actually works, in plain language, with its weak spots named. ' +
    'Returns a from-scratch explanation, the gaps/assumptions behind it, self-test questions, ' +
    'per-claim confidence, and the underlying atoms + causal lineage. Use this when the user ' +
    'wants to *understand* a codebase, not just judge it. Heaviest tool (reads source, three model calls).',
  inputSchema: {
    type: 'object',
    properties: { repo: { type: 'string', description: 'A repo as owner/name or a GitHub URL' } },
    required: ['repo'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      repoId: { type: 'string' },
      degraded: { type: 'boolean', description: 'true when no source tree was available (README-only read)' },
      explanation: { type: 'string', description: 'Plain-language explanation from scratch.' },
      gaps: { type: 'array', items: { type: 'string' }, description: 'Where the explanation is weakest.' },
      assumptions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Inferred, not directly verified.',
      },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { q: { type: 'string' }, a: { type: 'string' } },
        },
        description: 'Self-test questions with answers.',
      },
      confidence: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim: { type: 'string' },
            level: { type: 'string', enum: ['high', 'medium', 'low'] },
            note: { type: 'string' },
          },
        },
      },
      atoms: { type: 'array', description: 'The atomic units the explanation is built from.' },
      lineage: { type: 'object', description: 'Causal links + roots/leaves between atoms.' },
    },
    required: ['repoId', 'explanation'],
  },
};

/** Pure assembly of the tool result. Network/model-free so it is unit-testable. */
export function buildDeepDiveResult(repoId, atoms, lineage, feynman, source) {
  return {
    repoId,
    degraded: !!(source && source.degraded),
    explanation: feynman.explanation,
    gaps: feynman.gaps,
    assumptions: feynman.assumptions,
    questions: feynman.questions,
    confidence: feynman.confidence,
    atoms,
    lineage,
  };
}

export async function runDeepDive(args) {
  const { platform, repoId } = parseRepoInput(args?.repo);
  const opts = ghOpts();
  const repoData = await fetchRepoData(platform, repoId, opts);
  const source = await fetchSource(platform, repoId, opts);
  const { atoms } = parseAtoms(await callAnthropic(buildAtomsPrompt(repoData, source, null)));
  const lineage = parseLineage(await callAnthropic(buildLineagePrompt(atoms)));
  const feynman = parseFeynman(await callAnthropic(buildFeynmanPrompt(repoData, atoms, lineage)));
  return buildDeepDiveResult(repoId, atoms, lineage, feynman, source);
}
