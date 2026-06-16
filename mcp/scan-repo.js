// scan_repo tool: verdict-first analysis of a GitHub repo.
// Pipeline (extension modules, verbatim): fetchRepoData -> buildPrompt -> (Anthropic) -> parseClaudeResponse.

import { fetchRepoData } from '../fetcher.js';
import { buildPrompt } from '../prompt.js';
import { parseClaudeResponse } from '../parser.js';
import { parseRepoInput } from './repo-input.js';
import { callAnthropic } from './anthropic.js';

export const SCAN_TOOL = {
  name: 'scan_repo',
  description:
    "Read a GitHub repo's real source and return RepoLens's verdict-first analysis: " +
    'overall fit, a health score, pros, cons, red flags, and capabilities. Use this when ' +
    'the user wants a structured read on whether to use a repository, not its README pitch.',
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
      platform: { type: 'string' },
      language: { type: 'string' },
      license: { type: 'string' },
      stars: { type: 'number' },
      description: { type: 'string' },
      fit: { type: 'string', description: 'overall fit verdict' },
      health: { type: 'object', description: 'health score + signals' },
      pros: { type: 'array', items: { type: 'string' } },
      cons: { type: 'array', items: { type: 'string' } },
      red_flags: { type: 'array' },
      capabilities: { type: 'array', items: { type: 'string' } },
    },
    required: ['repoId', 'fit'],
  },
};

export async function runScanRepo(args) {
  const { platform, repoId } = parseRepoInput(args?.repo);
  const repoData = await fetchRepoData(platform, repoId);
  const analysis = parseClaudeResponse(await callAnthropic(buildPrompt(repoData)));
  return {
    repoId: repoData.repoId,
    platform,
    language: repoData.language,
    license: repoData.license,
    stars: repoData.stars,
    description: repoData.description,
    ...analysis,
  };
}
