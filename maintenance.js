// Maintenance & Abandonment lens — classifies a repo's maintenance health into
// Active / Slowing / Stale / Abandoned using GitHub metadata + contributor signals
// + CI file presence. Pure functions; fetch calls live in fetcher.js.

import { extractJsonObject } from './deepdive.js';

export const MAINT_BANDS = ['active', 'slowing', 'stale', 'abandoned'];
export const BUS_FACTORS = ['safe', 'concentrated', 'solo'];

/** Deterministic band fallback when AI response is missing or malformed. */
export function bandFromSignals(signals) {
  if (!signals) return 'unknown';
  if (signals.archived) return 'abandoned';
  if (!signals.pushedAt) return 'unknown';
  const daysSince = Math.floor((Date.now() - Date.parse(signals.pushedAt)) / 86400000);
  if (daysSince > 365) return 'abandoned';
  if (daysSince > 180) return 'stale';
  if (daysSince > 90) return 'slowing';
  return 'active';
}

/** Days since pushedAt ISO string, or null if unavailable. */
export function daysSincePush(pushedAt) {
  if (!pushedAt) return null;
  const d = Math.floor((Date.now() - Date.parse(pushedAt)) / 86400000);
  return Number.isFinite(d) && d >= 0 ? d : null;
}

function formatSignals(signals, today) {
  if (!signals) return '(GitHub signals unavailable — non-GitHub repo or API error)';

  const pushed = signals.pushedAt ? Date.parse(signals.pushedAt) : 0;
  const days = pushed ? Math.floor((today - pushed) / 86400000) : null;

  const lines = [
    `Last commit pushed: ${signals.pushedAt ? `${signals.pushedAt} (${days} days ago)` : 'unknown'}`,
    `Archived: ${signals.archived}`,
    `Open issues: ${signals.openIssues}`,
    `Forks: ${signals.forks}`,
    `Watchers/subscribers: ${signals.watchers}`,
  ];

  if (signals.topContributors?.length) {
    const total = signals.topContributors.reduce((s, c) => s + c.contributions, 0);
    const top1 = signals.topContributors[0];
    const top1Pct = total ? Math.round((top1.contributions / total) * 100) : 0;
    lines.push(`Top contributor share: ${top1.login} — ${top1.contributions} commits (${top1Pct}% of top-5)`);
    const others = signals.topContributors
      .slice(1)
      .map((c) => c.login)
      .join(', ');
    if (others) lines.push(`Other top contributors: ${others}`);
  } else {
    lines.push('Contributor data: unavailable');
  }

  return lines.join('\n');
}

/** Detect CI and project-health signals from the file tree. */
export function ciSignals(tree) {
  if (!Array.isArray(tree) || !tree.length) return 'No file tree available.';
  const has = (p) => tree.some((f) => String(f).toLowerCase().includes(p));
  return [
    ['GitHub Actions (.github/workflows)', has('.github/workflows')],
    ['CircleCI (.circleci)', has('.circleci')],
    ['Travis CI (.travis.yml)', has('.travis')],
    ['Jenkins (Jenkinsfile)', has('jenkinsfile')],
    [
      'Test files (test/ or tests/ or *.test.* or *.spec.*)',
      has('test/') || has('tests/') || has('.test.') || has('.spec.'),
    ],
    ['CONTRIBUTING guide', has('contributing')],
    ['SECURITY policy', has('security')],
    ['CHANGELOG', has('changelog') || has('changes.md') || has('history.md')],
  ]
    .map(([label, present]) => `${present ? '✓' : '✗'} ${label}`)
    .join('\n');
}

/**
 * Build the maintenance analysis prompt.
 * @param {object} repoData - { repoId, description, stars, language, license }
 * @param {object|null} signals - output of fetchMaintenanceSignals, or null
 * @param {string[]} tree - file tree from fetchSource
 * @param {number} [today] - injectable Date.now() for tests
 */
export function buildMaintenancePrompt(repoData, signals, tree, today = Date.now()) {
  return `You are auditing the maintenance health of a software repository. Your job is to synthesize the signals below into four structured outputs.

Repository: ${repoData.repoId}
Description: ${repoData.description || '—'}
Stars: ${repoData.stars ?? 0}
Language: ${repoData.language || 'Unknown'}
License: ${repoData.license || 'Unknown'}

GitHub signals:
${formatSignals(signals, today)}

Ecosystem signals (file tree):
${ciSignals(tree)}

Classify across three dimensions:

1. **band** — the maintenance activity level:
   - "active": last push < 90 days, issues engaged, at least some CI
   - "slowing": 90–180 days OR visible declining engagement
   - "stale": 180–365 days, issues accumulating, no recent releases
   - "abandoned": > 365 days OR archived flag set, OR clear maintainer departure

2. **bus_factor** — contributor concentration risk:
   - "safe": 3+ active contributors, balanced commit share
   - "concentrated": 1–2 people hold most commits, others rarely contribute
   - "solo": single maintainer, no visible co-contributors

3. **watch_list** — 2–4 specific, factual concerns. Quote actual numbers. No fluff. Example: "No CI detected — test reliability cannot be verified", "Top contributor holds 94% of commits — solo bus factor risk".

4. **summary** — 1 honest, specific sentence.

Return ONLY valid JSON, no markdown fences:
{
  "band": "active|slowing|stale|abandoned",
  "bus_factor": "safe|concentrated|solo",
  "days_since_push": 0,
  "summary": "One sentence.",
  "watch_list": ["concern 1", "concern 2"]
}`;
}

const clampDays = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/**
 * Parse the AI maintenance response, falling back to deterministic signals.
 * @param {string} rawText
 * @param {object|null} signals - used for fallback band derivation
 */
export function parseMaintenance(rawText, signals) {
  const fallbackBand = bandFromSignals(signals);
  let d;
  try {
    d = extractJsonObject(rawText);
  } catch {
    return {
      band: fallbackBand,
      bus_factor: 'unknown',
      days_since_push: daysSincePush(signals?.pushedAt),
      summary: 'Could not parse maintenance analysis.',
      watch_list: [],
    };
  }

  return {
    band: MAINT_BANDS.includes(d.band) ? d.band : fallbackBand,
    bus_factor: BUS_FACTORS.includes(d.bus_factor) ? d.bus_factor : 'unknown',
    days_since_push: clampDays(d.days_since_push) ?? daysSincePush(signals?.pushedAt),
    summary: String(d.summary || ''),
    watch_list: Array.isArray(d.watch_list) ? d.watch_list.map(String) : [],
  };
}
