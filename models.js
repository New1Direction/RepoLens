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
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', recommended: true },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — fast' },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  },
  nous: {
    label: 'Nous',
    models: [
      { value: 'Hermes-4-405B', label: 'Hermes 4 405B — flagship', recommended: true },
      { value: 'stepfun/step-3.7-flash', label: 'Step 3.7 Flash — free 30d' },
      { value: 'Hermes-4-70B', label: 'Hermes 4 70B — faster' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    models: [
      { value: 'x-ai/grok-4.3', label: 'Grok 4.3', recommended: true },
      { value: 'anthropic/claude-opus-4-8', label: 'Claude Opus 4.8' },
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
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
