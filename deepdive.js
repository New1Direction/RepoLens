// Deep Dive — a multi-stage repo analysis: Atomic Deconstruction (semantic
// chunking of the source) → Causal Lineage (how the atoms relate) → Feynman
// Validation (explain-it-simply + gaps + self-test + confidence). Each stage is
// its own AI call, chained, fed the previous stage's output.

const MAX_TREE_PATHS = 200;       // file paths shown to the model
const MAX_KEY_FILES = 8;          // source files fetched + included
const MAX_FILE_CHARS = 2500;      // per-file content cap

// Filenames that most reveal a project's shape, in priority order.
const PRIORITY_FILES = [
  'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'requirements.txt',
  'setup.py', 'pom.xml', 'build.gradle', 'composer.json', 'Gemfile',
  'src/index.ts', 'src/index.js', 'src/index.tsx', 'index.ts', 'index.js',
  'src/main.ts', 'src/main.js', 'src/main.py', 'main.py', 'app.py',
  'src/lib.rs', 'src/main.rs', 'main.go', 'src/app.ts', 'src/App.tsx',
];
const CODE_EXT = /\.(ts|tsx|js|jsx|py|rs|go|java|rb|php|c|cc|cpp|h|hpp|kt|swift)$/i;

/** Extract the first JSON object from a model response (tolerates code fences). */
export function extractJsonObject(rawText) {
  let text = (rawText || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  return JSON.parse(text.slice(start, end + 1));
}

// ─── Stage 0: fetch source (GitHub-first; others degrade to README only) ──────

async function ghJson(url, opts = {}) {
  const headers = { Accept: 'application/vnd.github+json' };
  // Optional auth (MCP only; the extension passes no token). Lifts the 60/hr
  // anon GitHub limit that blueprint/deep-dive would otherwise trip mid-scan.
  if (opts.githubToken) headers.Authorization = `Bearer ${opts.githubToken}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GitHub ${r.status} for ${url}`);
  return r.json();
}

/** Pick the most revealing files present in the tree, priority list first. */
export function selectKeyFiles(paths) {
  const set = new Set(paths);
  const picked = [];
  for (const p of PRIORITY_FILES) {
    if (set.has(p) && !picked.includes(p)) picked.push(p);
    if (picked.length >= MAX_KEY_FILES) return picked;
  }
  // Fill remaining slots with shallow (depth <= 2) source files.
  const shallow = paths
    .filter(p => CODE_EXT.test(p) && p.split('/').length <= 2 && !picked.includes(p))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);
  for (const p of shallow) {
    picked.push(p);
    if (picked.length >= MAX_KEY_FILES) break;
  }
  return picked;
}

/**
 * Fetch a repo's file tree + a handful of key files.
 * Returns { tree: string[], files: [{path, content}], degraded: boolean }.
 * Only GitHub fetches real source; other platforms return a degraded result.
 */
export async function fetchSource(platform, repoId, opts = {}) {
  if (platform !== 'github') return { tree: [], files: [], degraded: true };

  const meta = await ghJson(`https://api.github.com/repos/${repoId}`, opts);
  const branch = meta.default_branch || 'main';
  const treeRes = await ghJson(
    `https://api.github.com/repos/${repoId}/git/trees/${branch}?recursive=1`, opts
  );
  const allPaths = (treeRes.tree || []).filter(e => e.type === 'blob').map(e => e.path);
  const tree = allPaths.slice(0, MAX_TREE_PATHS);

  const keyPaths = selectKeyFiles(allPaths);
  const files = [];
  for (const path of keyPaths) {
    try {
      const data = await ghJson(`https://api.github.com/repos/${repoId}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, opts);
      if (data.encoding === 'base64' && data.content) {
        const content = atob(data.content.replace(/\n/g, '')).slice(0, MAX_FILE_CHARS);
        files.push({ path, content });
      }
    } catch {
      // Skip files we can't read; the tree alone still informs the analysis.
    }
  }
  return { tree, files, degraded: files.length === 0 && tree.length === 0 };
}

// ─── Stage 1: Atomic Deconstruction (semantic chunking) ───────────────────────

/** A compact "measured facts" block for the atoms prompt; '' when no runner facts. */
export function factsBlock(facts) {
  if (!facts) return '';
  const langs = (facts.languages || []).slice(0, 6).map(l => `${l.name} ${l.code}`).join(', ');
  const dep = (k) => (facts.dependencies && facts.dependencies[k]) || [];
  const depLine = ['npm', 'cargo', 'pip', 'go']
    .filter(k => dep(k).length)
    .map(k => `${k}: ${dep(k).slice(0, 12).join(', ')}`)
    .join('; ');
  const lines = [
    `- ${facts.fileCount} files. LOC by language: ${langs || '—'}.`,
    `- Manifests: ${(facts.manifests || []).join(', ') || 'none'}.${depLine ? ` Direct deps — ${depLine}.` : ''}`,
    `- Tests: ${facts.tests && facts.tests.present ? 'present' : 'none detected'}. CI: ${facts.ci && facts.ci.present ? (facts.ci.files || []).join(', ') : 'none detected'}.`,
  ];
  const dg = facts.depGraph || {};
  const scale = ['npm', 'cargo', 'pip', 'go']
    .filter(k => (dg[k] || {}).total)
    .map(k => `${k} ${dg[k].direct} direct / ${dg[k].total} total`)
    .join('; ');
  if (scale) lines.push(`- Dependency scale (from lockfile): ${scale}.`);
  if (facts.license) lines.push(`- License: ${facts.license.spdx} (${facts.license.file}).`);
  const a = facts.architecture;
  if (a) {
    const bits = [];
    if (a.monorepo) bits.push(`monorepo${(a.workspaces || []).length ? ` (${a.workspaces.slice(0, 4).join(', ')})` : ''}`);
    if ((a.entryPoints || []).length) bits.push(`entry points: ${a.entryPoints.slice(0, 4).join(', ')}`);
    if (a.containerized) bits.push('containerized (Dockerfile)');
    if (bits.length) lines.push(`- Architecture: ${bits.join('; ')}.`);
  }
  if ((facts.secrets || []).length) lines.push(`- Static secret-scan flags: ${facts.secrets.length} (review).`);
  return `\nMEASURED FACTS (from a real checkout via the runner — ground truth; prefer these over inference):\n${lines.join('\n')}\n`;
}

export function buildAtomsPrompt(repoData, source, facts) {
  const treeBlock = source.tree.length
    ? `File tree (truncated):\n${source.tree.join('\n')}`
    : '(no file tree available — work from the README + description)';
  const filesBlock = source.files.length
    ? source.files.map(f => `=== ${f.path} ===\n${f.content}`).join('\n\n')
    : '(no source files available)';

  return `You are reverse-engineering a software repository into its ATOMIC SEMANTIC UNITS — the smallest set of self-contained concepts/subsystems that, taken together, explain how the project works.

Repository: ${repoData.repoId}
Description: ${repoData.description || '—'}
Language: ${repoData.language || 'Unknown'}

${treeBlock}

Key source files:
${filesBlock}
${factsBlock(facts)}
Decompose the project into 5–10 atomic units. For each, give a stable short id (kebab-case), a human name, a kind, a one-sentence purpose, and the files/paths it lives in.

Return ONLY valid JSON, no markdown fences:
{
  "atoms": [
    { "id": "kebab-id", "name": "Human Name", "kind": "subsystem|module|concept|entrypoint|data", "purpose": "One sentence on what it does and why it exists.", "files": ["path/one", "path/two"] }
  ]
}`;
}

export function parseAtoms(rawText) {
  const data = extractJsonObject(rawText);
  const atoms = Array.isArray(data.atoms) ? data.atoms : [];
  return {
    atoms: atoms.map((a, i) => ({
      id: a.id || `atom-${i + 1}`,
      name: a.name || a.id || `Unit ${i + 1}`,
      kind: a.kind || 'module',
      purpose: a.purpose || '',
      files: Array.isArray(a.files) ? a.files : [],
    })),
  };
}

// ─── Stage 2: Mapping Causal Lineage ──────────────────────────────────────────

export function buildLineagePrompt(atoms) {
  const list = atoms.map(a => `- ${a.id}: ${a.name} — ${a.purpose}`).join('\n');
  return `Given these atomic units of a software project, map the CAUSAL LINEAGE between them — the directed cause→effect / dependency relationships.

Atomic units:
${list}

For every meaningful relationship, emit a directed link using the unit ids above. Identify the "roots" (foundational units everything traces back to) and "leaves" (user-facing outcomes that depend on the rest).

Return ONLY valid JSON, no markdown fences:
{
  "links": [ { "from": "id", "to": "id", "relation": "depends-on|enables|triggers|derives-from", "why": "One clause explaining the link." } ],
  "roots": ["id"],
  "leaves": ["id"]
}`;
}

export function parseLineage(rawText) {
  const data = extractJsonObject(rawText);
  const links = Array.isArray(data.links) ? data.links : [];
  return {
    links: links
      .filter(l => l && l.from && l.to)
      .map(l => ({ from: l.from, to: l.to, relation: l.relation || 'depends-on', why: l.why || '' })),
    roots: Array.isArray(data.roots) ? data.roots : [],
    leaves: Array.isArray(data.leaves) ? data.leaves : [],
  };
}

// ─── Stage 3: Execution & Validation (the Feynman Protocol) ───────────────────

export function buildFeynmanPrompt(repoData, atoms, lineage) {
  const atomList = atoms.map(a => `- ${a.name}: ${a.purpose}`).join('\n');
  const linkList = lineage.links.map(l => `- ${l.from} ${l.relation} ${l.to} (${l.why})`).join('\n');
  return `Apply the FEYNMAN PROTOCOL to validate an understanding of ${repoData.repoId}.

Atomic units:
${atomList}

Causal lineage:
${linkList}

Do four things:
1. explanation — explain the whole project from scratch in plain language a smart beginner would follow (3–5 sentences). No jargon left unexplained.
2. gaps — list the points where this explanation is weakest or where the model lacks evidence.
3. assumptions — list claims that are inferred rather than directly verified from the source.
4. questions — 3 self-test questions (with answers) a reader could use to check their own understanding.
Then rate confidence per major claim.

Return ONLY valid JSON, no markdown fences:
{
  "explanation": "Plain-language explanation.",
  "gaps": ["..."],
  "assumptions": ["..."],
  "questions": [ { "q": "Question?", "a": "Answer." } ],
  "confidence": [ { "claim": "...", "level": "high|medium|low", "note": "Why." } ]
}`;
}

export function parseFeynman(rawText) {
  const data = extractJsonObject(rawText);
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    explanation: data.explanation || '',
    gaps: arr(data.gaps),
    assumptions: arr(data.assumptions),
    questions: arr(data.questions).map(q => ({ q: q.q || '', a: q.a || '' })),
    confidence: arr(data.confidence).map(c => ({ claim: c.claim || '', level: c.level || 'medium', note: c.note || '' })),
  };
}
