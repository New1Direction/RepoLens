// Controlled capability vocabulary for the Combinator. Tags are grouped into layers:
// the LAYER drives "adjacency" (do two repos sit in the same / a neighbouring space),
// the TAG drives "disjointness" (do they play different roles). Pure, dependency-free.

export const TAXONOMY = {
  storage: ['vector-index', 'database', 'cache', 'object-store', 'file-store'],
  compute: ['inference-runtime', 'training', 'sandbox', 'microvm', 'scheduler', 'workflow-engine'],
  io: ['scraping', 'api-gateway', 'message-queue', 'streaming'],
  ui: ['ui-rendering', 'terminal-ui', 'visualization', '3d'],
  agent: ['agent-runtime', 'agent-orchestration', 'skill-pack', 'tool-use', 'memory'],
  ml: ['fine-tuning', 'embeddings', 'rag', 'evaluation', 'multimodal', 'optimization'],
  security: ['auth', 'secrets', 'sandboxing', 'audit', 'grc'],
  data: ['parsing', 'transformation', 'osint', 'analytics'],
  devtools: ['cli', 'build-toolchain', 'testing', 'debugging', 'reverse-engineering'],
  domain: ['trading', 'finance', 'education', 'bot', 'content-gen'],
};

export const ALL_TAGS = new Set([...Object.values(TAXONOMY).flat(), 'other']);

const TAG_LAYER = (() => {
  const m = {};
  for (const [layer, tags] of Object.entries(TAXONOMY)) for (const t of tags) m[t] = layer;
  return m;
})();

export function layerOf(tag) {
  return TAG_LAYER[tag] || 'other';
}
export function isValidTag(tag) {
  return ALL_TAGS.has(tag);
}

// Symmetric "these layers cohere" map — same layer is always adjacent.
const NEIGHBOURS = {
  storage: ['compute', 'data', 'ml'],
  compute: ['storage', 'agent', 'ml'],
  ml: ['compute', 'storage', 'agent', 'data'],
  agent: ['compute', 'ml', 'devtools'],
  data: ['storage', 'ml', 'io'],
  io: ['data', 'compute'],
  ui: ['devtools', 'domain'],
  security: ['compute', 'devtools'],
  devtools: ['agent', 'ui', 'security'],
  domain: ['ui', 'data'],
};
export function layersAdjacent(a, b) {
  if (a === b) return true;
  return (NEIGHBOURS[a] || []).includes(b) || (NEIGHBOURS[b] || []).includes(a);
}

// Validate an AI-produced capabilities array: known tags only, lowercased, deduped, capped.
export function normalizeCapabilities(raw, max = 5) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const t of raw) {
    const tag = String(t || '')
      .trim()
      .toLowerCase();
    if (isValidTag(tag) && !out.includes(tag)) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

// Deterministic keyword -> tag hints. Conservative (mostly multi-word) to avoid false
// positives. Used as a fallback when the model omits capabilities (and, in Phase 2, by
// the library backfill). Not exhaustive — a bootstrap; re-scanning yields AI-quality tags.
const KEYWORD_HINTS = {
  'vector-index': [
    'vector index',
    'vector database',
    'hnsw',
    'nearest neighbor',
    'ann index',
    'embedding index',
  ],
  database: ['database', 'datastore', 'key-value store', 'sql engine'],
  cache: ['caching', 'cache layer'],
  'object-store': ['object store', 'blob store'],
  'file-store': ['file sharing', 'file store', 'file storage'],
  'inference-runtime': ['inference runtime', 'inference server', 'model serving', 'inference engine'],
  training: ['model training', 'pretrain'],
  sandbox: ['sandbox'],
  microvm: ['microvm', 'firecracker', 'kvm guest', 'virtual machine'],
  scheduler: ['scheduler', 'job scheduling'],
  'workflow-engine': ['workflow engine', 'workflow', 'pipeline engine', 'deterministic kernel'],
  scraping: ['scraping', 'scraper', 'web crawl', 'crawler'],
  'api-gateway': ['api gateway', 'gateway'],
  'message-queue': ['message queue', 'message bus', 'pub/sub'],
  streaming: ['streaming', 'websocket'],
  'ui-rendering': ['ui framework', 'user interface', 'frontend', 'rendering', 'jsx', 'component-based'],
  'terminal-ui': ['terminal ui', 'tui', 'terminal emulator'],
  visualization: ['visualization', 'visualisation', 'dashboard', 'chart'],
  '3d': ['webgl', 'three.js', '3d viewer', 'mesh'],
  'agent-runtime': ['agent runtime', 'autonomous agent', 'agent framework'],
  'agent-orchestration': ['multi-agent', 'agent orchestration', 'orchestrator', 'agent workflow'],
  'skill-pack': ['skill pack', 'skill collection', 'skills'],
  'tool-use': ['tool use', 'tool-calling', 'function calling', 'mcp '],
  memory: ['memory layer', 'context window', 'ledger'],
  'fine-tuning': ['fine-tuning', 'fine tune', 'lora', 'qlora'],
  embeddings: ['embedding model', 'embeddings'],
  rag: ['retrieval-augmented', 'retrieval augmented', 'rag pipeline', 'rag chatbot'],
  evaluation: ['evaluation', 'benchmark', 'auditor', 'calibration'],
  multimodal: ['multimodal', 'vision-language', 'image and text', 'omni'],
  optimization: ['optimization', 'optimisation', 'profiler', 'performance experiment'],
  auth: ['authentication', 'oauth', 'identity provider', 'authorization'],
  secrets: ['secret manager', 'credential', 'token scoping', 'vault'],
  sandboxing: ['seccomp', 'capability drop', 'isolation layer'],
  audit: ['audit layer', 'compliance', 'governance'],
  grc: ['grc', 'governance risk'],
  parsing: ['parser', 'parsing', 'lexer', 'ast '],
  transformation: ['transformation', 'transpile', 'etl'],
  osint: ['osint', 'investigation tool', 'reconnaissance'],
  analytics: ['analytics', 'metrics dashboard'],
  cli: ['command-line', 'command line', 'cli tool'],
  'build-toolchain': ['toolchain', 'compiler', 'bundler', 'cross-compilation', 'wasm'],
  testing: ['testing framework', 'test suite', 'ctf platform'],
  debugging: ['debugger', 'dynamic analysis', 'tracer'],
  'reverse-engineering': ['reverse engineer', 'disassembler', 'decompiler', 'ida pro', 'ghidra'],
  trading: ['trading', 'trading terminal'],
  finance: ['personal finance', 'budgeting', 'expense'],
  education: ['educational', 'tutorial', 'teaching'],
  bot: ['discord bot', 'telegram bot', 'chatbot'],
  'content-gen': ['content generation', 'authoring tool'],
};

export function deriveCapabilities(meta = {}, max = 5) {
  const hay = [
    meta.category || '',
    meta.tech_stack && Array.isArray(meta.tech_stack.built_with) ? meta.tech_stack.built_with.join(' ') : '',
    Array.isArray(meta.tags) ? meta.tags.join(' ') : '',
    meta.eli5 || '',
  ]
    .join(' ')
    .toLowerCase();

  const out = [];
  for (const [tag, kws] of Object.entries(KEYWORD_HINTS)) {
    if (kws.some((k) => hay.includes(k))) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}
