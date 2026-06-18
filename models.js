// Single source of truth for the per-part model pickers: the scan parts that can be routed,
// and the provider × model catalog (with one ★ recommended model per provider). Pure data.

export const PARTS = [
  { id: 'core', label: 'Core scan' },
  { id: 'deepdive', label: 'Deep Dive' },
  { id: 'lens', label: 'Framework Lens' },
  { id: 'sktpg', label: 'SKTPG' },
  { id: 'versus', label: 'Versus' },
  { id: 'synergies', label: 'Synergies' },
  { id: 'combinator', label: 'Combinator' },
  { id: 'retag', label: 'Re-tag library' },
  { id: 'docs', label: 'Docs Quality' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'fits', label: 'Fits MY Stack?' },
  { id: 'stack', label: 'Stack Builder' },
];

// provider id → { label, models: [{ value, label, recommended? }] }
// `value` is the raw model id sent to the provider. Exactly one model per provider is recommended.
export const CATALOG = {
  anthropic: {
    label: 'Anthropic',
    models: [
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', recommended: true },
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 — max quality' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fast' },
    ],
  },
  google: {
    label: 'Gemini',
    models: [
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', recommended: true },
      { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash — fast' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
  },
  nous: {
    label: 'Nous',
    models: [
      { value: 'stepfun/step-3.7-flash', label: 'StepFun: Step 3.7 Flash', recommended: true },
      { value: 'nousresearch/hermes-4-405b', label: 'Nous: Hermes 4 405B' },
      { value: 'nousresearch/hermes-4-70b', label: 'Nous: Hermes 4 70B' },
      { value: 'anthropic/claude-opus-4.8', label: 'Anthropic: Claude Opus 4.8' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    models: [
      { value: 'x-ai/grok-4.3', label: 'xAI: Grok 4.3', recommended: true },
      { value: 'x-ai/grok-4.20', label: 'xAI: Grok 4.20' },
      { value: 'anthropic/claude-opus-4.8', label: 'Anthropic: Claude Opus 4.8' },
      { value: 'anthropic/claude-sonnet-4.6', label: 'Anthropic: Claude Sonnet 4.6' },
      { value: 'google/gemini-2.5-pro', label: 'Google: Gemini 2.5 Pro' },
      { value: 'google/gemini-2.5-flash', label: 'Google: Gemini 2.5 Flash' },
    ],
  },
  xai: {
    label: 'xAI Grok',
    models: [
      { value: 'grok-4.3', label: 'Grok 4.3', recommended: true },
      { value: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 Reasoning' },
    ],
  },
};

// Backward-compatible cleanup for model ids that old RepoLens builds displayed/saved
// with provider aliases or pre-release spellings. The APIs still accept some aliases,
// but saving canonical ids keeps the UI aligned with /v1/models and avoids failures
// for providers that do not resolve the old form.
export const MODEL_ALIASES = {
  google: {
    'models/gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
    'models/gemini-3.5-flash': 'gemini-3.5-flash',
    'models/gemini-2.5-pro': 'gemini-2.5-pro',
    'models/gemini-2.5-flash': 'gemini-2.5-flash',
  },
  nous: {
    'Step-3.7-Flash': 'stepfun/step-3.7-flash',
    'step-3.7-flash': 'stepfun/step-3.7-flash',
    'Hermes-4-405B': 'nousresearch/hermes-4-405b',
    'NousResearch/Hermes-4-405B': 'nousresearch/hermes-4-405b',
    'Hermes-4-70B': 'nousresearch/hermes-4-70b',
    'NousResearch/Hermes-4-70B': 'nousresearch/hermes-4-70b',
    'anthropic/claude-opus-4-8': 'anthropic/claude-opus-4.8',
  },
  openrouter: {
    'anthropic/claude-opus-4-8': 'anthropic/claude-opus-4.8',
    'anthropic/claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
    'anthropic/claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4.5',
  },
};

export function canonicalModel(provider, model) {
  const value = (model || '').trim();
  return MODEL_ALIASES[provider]?.[value] || value;
}
