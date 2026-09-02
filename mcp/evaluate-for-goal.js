import { fetchRepoData } from '../src/fetcher.js';
import { buildPrompt } from '../src/prompt.js';
import { parseClaudeResponse } from '../src/parser.js';
import { deriveFit } from '../src/verdict.js';
import { parseRepoInput } from './repo-input.js';
import { callModel } from './model.js';
import { ghOpts } from './github-auth.js';
import { attachHtmlReport } from './report.js';

export const EVALUATE_FOR_GOAL_TOOL = {
  name: 'evaluate_for_goal',
  description:
    'Evaluate a GitHub/GitLab/npm/PyPI repo against a concrete engineering goal and explicit constraints. ' +
    'Returns a decision, fit score, blockers, integration/replacement cost, dependency risk, evidence, and a short trial plan.',
  inputSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'owner/name, platform:name, or GitHub/GitLab/npm/PyPI URL' },
      goal: { type: 'string', description: 'Concrete engineering goal this repo must satisfy.' },
      constraints: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      report: { type: 'boolean', description: 'Write a local HTML report. Default: true.' },
      openReport: { type: 'boolean', description: 'Open the local HTML report. Default: true.' },
    },
    required: ['repo', 'goal'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      repoId: { type: 'string' },
      platform: { type: 'string' },
      goal: { type: 'string' },
      constraints: { type: 'array', items: { type: 'string' } },
      decision: { type: 'string', enum: ['adopt', 'trial', 'hold', 'reject'] },
      fit_score: { type: 'number' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      bottom_line: { type: 'string' },
      blockers: { type: 'array', items: { type: 'string' } },
      integration_cost: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'] },
      replacement_cost: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'] },
      dependency_risk: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'] },
      evidence: { type: 'array' },
      trial_plan: { type: 'array', items: { type: 'string' } },
      base_scan: { type: 'object' },
      report: { type: 'object' },
    },
    required: ['repoId', 'goal', 'decision', 'fit_score', 'bottom_line'],
  },
};

const strings = (xs, max = 20) =>
  Array.isArray(xs) ? xs.map(String).map((s) => s.trim()).filter(Boolean).slice(0, max) : [];

function extractJson(rawText) {
  const text = String(rawText || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in goal evaluation response');
  return JSON.parse(text.slice(start, end + 1));
}

export function buildGoalPrompt(scan, goal, constraints = []) {
  return `You are evaluating whether an experienced software engineer should adopt a repository for a specific goal.\n\nGoal:\n${goal}\n\nConstraints:\n${constraints.length ? constraints.map((c) => `- ${c}`).join('\n') : '- none provided'}\n\nRepoLens base scan evidence:\n${JSON.stringify(scan, null, 2)}\n\nTreat the base scan as evidence, not truth. Do not infer verification that is not present. Return ONLY valid JSON with this shape:\n{\n  \"decision\": \"adopt | trial | hold | reject\",\n  \"fit_score\": 0,\n  \"confidence\": \"high | medium | low\",\n  \"bottom_line\": \"One decisive sentence.\",\n  \"blockers\": [\"Concrete blocker\"],\n  \"integration_cost\": \"low | medium | high | unknown\",\n  \"replacement_cost\": \"low | medium | high | unknown\",\n  \"dependency_risk\": \"low | medium | high | unknown\",\n  \"evidence\": [{\"claim\": \"Why it fits or fails\", \"source\": \"base_scan | metadata | readme | inferred\", \"verified\": false}],\n  \"trial_plan\": [\"A concrete short test\"]\n}`;
}

export function parseGoalResponse(rawText) {
  const data = extractJson(rawText);
  const allowedDecision = new Set(['adopt', 'trial', 'hold', 'reject']);
  const allowedConfidence = new Set(['high', 'medium', 'low']);
  const allowedCost = new Set(['low', 'medium', 'high', 'unknown']);
  const cost = (v) => allowedCost.has(String(v)) ? String(v) : 'unknown';
  return {
    decision: allowedDecision.has(String(data.decision)) ? String(data.decision) : 'trial',
    fit_score: Math.max(0, Math.min(100, Number(data.fit_score) || 0)),
    confidence: allowedConfidence.has(String(data.confidence)) ? String(data.confidence) : 'low',
    bottom_line: String(data.bottom_line || ''),
    blockers: strings(data.blockers, 10),
    integration_cost: cost(data.integration_cost),
    replacement_cost: cost(data.replacement_cost),
    dependency_risk: cost(data.dependency_risk),
    evidence: Array.isArray(data.evidence) ? data.evidence.slice(0, 12) : [],
    trial_plan: strings(data.trial_plan, 8),
  };
}

export async function runEvaluateForGoal(args) {
  const goal = String(args?.goal || '').trim();
  if (!goal) throw new Error('evaluate_for_goal requires a non-empty goal');
  const constraints = strings(args?.constraints, 20);
  const { platform, repoId } = parseRepoInput(args?.repo);
  const repoData = await fetchRepoData(platform, repoId, ghOpts());
  const analysis = parseClaudeResponse(await callModel(buildPrompt(repoData)));
  const baseScan = {
    repoId: repoData.repoId,
    platform,
    language: repoData.language,
    license: repoData.license,
    stars: repoData.stars,
    description: repoData.description,
    ...analysis,
    fit: deriveFit(analysis),
  };
  const evaluation = parseGoalResponse(await callModel(buildGoalPrompt(baseScan, goal, constraints)));
  const result = { repoId: repoData.repoId, platform, goal, constraints, ...evaluation, base_scan: baseScan };
  return attachHtmlReport('evaluate_for_goal', repoData.repoId, result, args);
}
