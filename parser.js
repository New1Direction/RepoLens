import { normalizeCapabilities, deriveCapabilities } from './taxonomy.js';

const HL_SEVERITIES = new Set(['risk', 'insight', 'opportunity']);
const HL_SECTIONS = new Set([
  'eli5',
  'technical',
  'use_cases',
  'skip_if',
  'enables',
  'pros',
  'cons',
  'alternatives',
  'health',
  'red_flags',
  'start_here',
  'tech_stack',
]);

function normalizeHighlights(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && typeof h === 'object' && String(h.text || '').trim())
    .slice(0, 4)
    .map((h) => ({
      text: String(h.text),
      why: String(h.why ?? ''),
      severity: HL_SEVERITIES.has(h.severity) ? h.severity : 'insight',
      tab: HL_SECTIONS.has(h.tab) ? h.tab : '',
    }));
}

export function parseClaudeResponse(rawText) {
  let text = rawText.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in Claude response');
  text = text.slice(start, end + 1);
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse Claude response: ${e.message}\nRaw: ${text.slice(0, 200)}`);
  }
  return {
    eli5: data.eli5 ?? '',
    analogies: Array.isArray(data.analogies) ? data.analogies.map(String) : [],
    technical: data.technical ?? '',
    use_cases: data.use_cases ?? { core_fit: '', good_fit: '', works_well: '', long_term: '' },
    skip_if: data.skip_if ?? { overkill: '', wrong_tool: '', needs_care: '', consider: '' },
    enables: data.enables ?? '',
    pros: data.pros ?? [],
    cons: data.cons ?? [],
    alternatives: data.alternatives ?? [],
    health: data.health ?? {
      score: 0,
      commit_activity: 0,
      issue_response: 0,
      pr_merge_rate: 0,
      maintainer_count: 0,
      summary: '',
    },
    red_flags: data.red_flags ?? [],
    start_here: data.start_here ?? [],
    compare_hooks: data.compare_hooks ?? '',
    bottom_line: String(data.bottom_line ?? ''),
    tech_stack: {
      built_with: Array.isArray(data.tech_stack?.built_with) ? data.tech_stack.built_with : [],
      key_dependencies: Array.isArray(data.tech_stack?.key_dependencies)
        ? data.tech_stack.key_dependencies.map((d) => ({ name: d?.name ?? '', purpose: d?.purpose ?? '' }))
        : [],
    },
    tags: data.tags ?? [],
    category: data.category ?? '',
    capabilities: (() => {
      const norm = normalizeCapabilities(data.capabilities);
      return norm.length
        ? norm
        : deriveCapabilities({
            category: data.category,
            tech_stack: data.tech_stack,
            tags: data.tags,
            eli5: data.eli5,
          });
    })(),
    highlights: normalizeHighlights(data.highlights),
  };
}
