// blueprint_scene tool: a laid-out nodes/edges graph of how a repo is built —
// ready for a <DependencyGraph>-style component.
//
// Pipeline (extension modules, verbatim): fetchRepoData + fetchSource ->
// atoms prompt/parse -> lineage prompt/parse -> buildBlueprintScene. Two model
// calls (atoms, then lineage); the optional "feynman" plain-English layer is
// skipped since the scene only needs atoms + lineage. `facts` is null here —
// the extension's local "runner" (measured metrics) isn't part of a headless MCP.

import { fetchRepoData } from '../fetcher.js';
import { fetchSource, buildAtomsPrompt, parseAtoms, buildLineagePrompt, parseLineage } from '../deepdive.js';
import { buildBlueprintScene } from '../blueprint-adapter.js';
import { parseRepoInput } from './repo-input.js';
import { callAnthropic } from './anthropic.js';

export const BLUEPRINT_TOOL = {
  name: 'blueprint_scene',
  description:
    'Map how a GitHub repo is built and return a laid-out graph: nodes (its key parts) and ' +
    'edges (how they relate), with positions. Use this to visualize a repository as a ' +
    'dependency / architecture diagram. Heavier than scan_repo (reads source, two model calls).',
  inputSchema: {
    type: 'object',
    properties: { repo: { type: 'string', description: 'A repo as owner/name or a GitHub URL' } },
    required: ['repo'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      scope: { type: 'string' },
      repoId: { type: 'string' },
      title: { type: 'string' },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            kind: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            label: { type: 'string' },
          },
        },
      },
      camera: { type: 'object' },
    },
    required: ['nodes', 'edges'],
  },
};

export async function runBlueprintScene(args) {
  const { platform, repoId } = parseRepoInput(args?.repo);
  const repoData = await fetchRepoData(platform, repoId);
  const source = await fetchSource(platform, repoId);
  const { atoms } = parseAtoms(await callAnthropic(buildAtomsPrompt(repoData, source, null)));
  const lineage = parseLineage(await callAnthropic(buildLineagePrompt(atoms)));
  return buildBlueprintScene({ deepDive: { atoms, lineage }, repoId, title: repoId });
}
