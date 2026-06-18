// Pure helpers for Tech-Stack Builder — fuse 2-6 repos into an architecture diagram.
// No DOM, no chrome APIs, unit-testable.

export const STACK_LAYERS = ['frontend', 'backend', 'data', 'infra', 'testing', 'tooling'];

/**
 * Build the prompt for Tech-Stack Builder.
 * repos: [{ repoId, eli5, capabilities, category, language }]
 */
export function buildStackPrompt(repos) {
  if (!Array.isArray(repos) || repos.length < 2) return '';

  const repoBlock = repos
    .map((r, i) => {
      const lines = [`${i + 1}. ${r.repoId}`];
      if (r.eli5) lines.push(`   What: ${String(r.eli5).slice(0, 100)}`);
      if (r.capabilities?.length) lines.push(`   Capabilities: ${r.capabilities.slice(0, 5).join(', ')}`);
      if (r.category) lines.push(`   Category: ${r.category}`);
      if (r.language) lines.push(`   Language: ${r.language}`);
      return lines.join('\n');
    })
    .join('\n\n');

  return `You are a software architect designing a cohesive tech stack from a hand-picked set of repos.

The developer has selected these ${repos.length} repos:

${repoBlock}

Design the complete tech stack: roles, integrations, gaps, and adoption order.

Return a single JSON object:
{
  "title": "Short evocative stack name (e.g. 'Full-Stack Data Pipeline')",
  "roles": [
    { "repoId": "owner/repo", "role": "primary role in this stack", "layer": "frontend|backend|data|infra|testing|tooling" }
  ],
  "integrations": [
    { "from": "owner/repo1", "to": "owner/repo2", "glue": "how they connect or integrate" }
  ],
  "gaps": ["missing capability or concern not covered by these repos"],
  "order": ["owner/repo (adopt first)", "owner/repo (adopt second)"],
  "summary": "2-3 sentence overview of this stack and what it enables"
}`;
}

/**
 * Parse the AI response into a structured stack result.
 */
export function parseStack(rawText) {
  if (!rawText) return null;
  const m = String(rawText).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const r = JSON.parse(m[0]);
    return {
      title: String(r.title || 'Custom Stack').trim(),
      roles: Array.isArray(r.roles)
        ? r.roles.map((x) => ({
            repoId: String(x.repoId || ''),
            role: String(x.role || ''),
            layer: STACK_LAYERS.includes(x.layer) ? x.layer : 'tooling',
          }))
        : [],
      integrations: Array.isArray(r.integrations)
        ? r.integrations.map((x) => ({
            from: String(x.from || ''),
            to: String(x.to || ''),
            glue: String(x.glue || ''),
          }))
        : [],
      gaps: Array.isArray(r.gaps) ? r.gaps.map(String) : [],
      order: Array.isArray(r.order) ? r.order.map(String) : [],
      summary: String(r.summary || '').trim(),
    };
  } catch {
    return null;
  }
}
