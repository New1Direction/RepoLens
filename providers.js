// providers.js — data-driven registry of OpenAI- and Anthropic-compatible model
// providers, plus pure request/response helpers. No DOM, no chrome, no network:
// background.js performs the fetch; options.js renders the UI from this registry;
// routing.js consults it for connectivity + model resolution. Unit-tested.
//
// These sit alongside the five "first-class" providers that have bespoke OAuth /
// quirks (anthropic, google, openrouter, xai, nous). Everything here speaks one of
// two wire protocols:
//   • 'openai'    → POST {endpoint}, `Authorization: Bearer <key>`,
//                   { model, messages, max_tokens } → choices[0].message.content
//   • 'anthropic' → POST {endpoint}, `x-api-key: <key>` + anthropic-version,
//                   { model, messages, max_tokens } → content[0].text
//
// Each provider's `endpoint` is the full URL we POST to. A user can override it
// per-provider (stored at `<id>BaseUrl`) — handy when an endpoint moves or for a
// regional gateway — and every provider also exposes a free-form Custom… model.

export const COMPAT_PROVIDERS = [
  // ── OpenAI-compatible, API-key (Bearer) ──────────────────────────────────────
  {
    id: 'openai', label: 'OpenAI (GPT)', protocol: 'openai',
    hint: 'Official OpenAI API', keyHint: 'sk-…',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    host: 'https://api.openai.com/*', docsUrl: 'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-4.1', label: 'GPT-4.1', recommended: true },
      { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini — fast' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'o4-mini', label: 'o4-mini — reasoning' },
    ],
  },
  {
    id: 'deepseek', label: 'DeepSeek', protocol: 'openai',
    hint: 'api.deepseek.com', keyHint: 'sk-…',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    host: 'https://api.deepseek.com/*', docsUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek-V3 (chat)', recommended: true },
      { value: 'deepseek-reasoner', label: 'DeepSeek-R1 (reasoner)' },
    ],
  },
  {
    id: 'groq', label: 'Groq', protocol: 'openai',
    hint: 'api.groq.com — very fast inference', keyHint: 'gsk_…',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    host: 'https://api.groq.com/*', docsUrl: 'https://console.groq.com/keys',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', recommended: true },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — instant' },
      { value: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2' },
    ],
  },
  {
    id: 'nvidia', label: 'NVIDIA NIM', protocol: 'openai',
    hint: 'integrate.api.nvidia.com', keyHint: 'nvapi-…',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    host: 'https://integrate.api.nvidia.com/*', docsUrl: 'https://build.nvidia.com',
    models: [
      { value: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', recommended: true },
      { value: 'deepseek-ai/deepseek-r1', label: 'DeepSeek-R1' },
      { value: 'qwen/qwen2.5-coder-32b-instruct', label: 'Qwen2.5 Coder 32B' },
    ],
  },
  {
    id: 'moonshot', label: 'Kimi (Moonshot)', protocol: 'openai',
    hint: 'api.moonshot.ai', keyHint: 'sk-…',
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    host: 'https://api.moonshot.ai/*', docsUrl: 'https://platform.moonshot.ai/console/api-keys',
    models: [
      { value: 'kimi-k2-0905-preview', label: 'Kimi K2', recommended: true },
      { value: 'moonshot-v1-128k', label: 'Moonshot v1 128k' },
    ],
  },
  {
    id: 'moonshot_cn', label: 'Kimi (Moonshot, 中国)', protocol: 'openai',
    hint: 'api.moonshot.cn', keyHint: 'sk-…',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    host: 'https://api.moonshot.cn/*', docsUrl: 'https://platform.moonshot.cn/console/api-keys',
    models: [
      { value: 'kimi-k2-0905-preview', label: 'Kimi K2', recommended: true },
      { value: 'moonshot-v1-128k', label: 'Moonshot v1 128k' },
    ],
  },
  {
    id: 'kimi_coding', label: 'Kimi (Coding Plan)', protocol: 'openai',
    hint: 'api.kimi.com', keyHint: 'sk-…',
    endpoint: 'https://api.kimi.com/v1/chat/completions',
    host: 'https://api.kimi.com/*', docsUrl: 'https://www.kimi.com',
    models: [
      { value: 'kimi-k2-0905-preview', label: 'Kimi K2', recommended: true },
    ],
  },
  {
    id: 'zhipu', label: '智谱 GLM (Zhipu)', protocol: 'openai',
    hint: 'open.bigmodel.cn', keyHint: 'id.secret',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    host: 'https://open.bigmodel.cn/*', docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    models: [
      { value: 'glm-4.6', label: 'GLM-4.6', recommended: true },
      { value: 'glm-4.5-air', label: 'GLM-4.5 Air — fast' },
    ],
  },
  {
    id: 'aliyun', label: '阿里百炼 (Qwen)', protocol: 'openai',
    hint: 'dashscope.aliyuncs.com (compatible-mode)', keyHint: 'sk-…',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    host: 'https://dashscope.aliyuncs.com/*', docsUrl: 'https://bailian.console.aliyun.com',
    models: [
      { value: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus', recommended: true },
      { value: 'qwen-max', label: 'Qwen Max' },
      { value: 'qwen-plus', label: 'Qwen Plus' },
    ],
  },
  {
    id: 'xiaomi', label: '小米 MiMo (Xiaomi)', protocol: 'openai',
    hint: 'api.xiaomimimo.com', keyHint: 'sk-…',
    endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    host: 'https://api.xiaomimimo.com/*', docsUrl: 'https://xiaomimimo.com',
    models: [
      { value: 'MiMo-7B-RL', label: 'MiMo 7B RL', recommended: true },
    ],
  },
  {
    id: 'volcengine', label: '火山引擎 Ark (Volcengine)', protocol: 'openai',
    hint: 'ark.cn-beijing.volces.com — Model is an endpoint id (ep-…)', keyHint: 'API key',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    host: 'https://ark.cn-beijing.volces.com/*', docsUrl: 'https://www.volcengine.com/product/ark',
    models: [],
  },
  {
    id: 'azure', label: 'Azure OpenAI', protocol: 'azure', needsOrigin: true, needsVersion: true,
    hint: 'Resource endpoint + API version; Model = your deployment name', keyHint: 'Azure key',
    endpoint: '', host: 'https://*/*', docsUrl: 'https://portal.azure.com', defaultApiVersion: '2024-10-21',
    models: [], // deployment names are per-resource — set yours in the Model field
  },
  {
    id: 'ollama_cloud', label: 'Ollama Cloud', protocol: 'openai',
    hint: 'ollama.com', keyHint: 'API key',
    endpoint: 'https://ollama.com/v1/chat/completions',
    host: 'https://ollama.com/*', docsUrl: 'https://ollama.com/settings/keys',
    models: [
      { value: 'gpt-oss:120b', label: 'gpt-oss 120B', recommended: true },
      { value: 'deepseek-v3.1:671b', label: 'DeepSeek V3.1 671B' },
    ],
  },

  // ── OpenAI-compatible, keyless (local) ───────────────────────────────────────
  {
    id: 'ollama', label: 'Ollama (Local)', protocol: 'openai', keyless: true,
    hint: 'Self-hosted llama.cpp / Ollama — no key needed',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    host: 'http://localhost/*', docsUrl: 'https://ollama.com',
    models: [
      { value: 'llama3.1', label: 'Llama 3.1', recommended: true },
      { value: 'qwen2.5-coder', label: 'Qwen2.5 Coder' },
      { value: 'deepseek-r1', label: 'DeepSeek-R1' },
    ],
  },

  // ── Anthropic-compatible, API-key (x-api-key) ────────────────────────────────
  {
    id: 'minimax', label: 'MiniMax (Global)', protocol: 'anthropic',
    hint: 'api.minimax.io/anthropic', keyHint: 'API key',
    endpoint: 'https://api.minimax.io/anthropic/v1/messages',
    host: 'https://api.minimax.io/*', docsUrl: 'https://www.minimax.io/platform',
    models: [
      { value: 'MiniMax-M2', label: 'MiniMax-M2', recommended: true },
      { value: 'MiniMax-M1', label: 'MiniMax-M1' },
    ],
  },
  {
    id: 'minimax_cn', label: 'MiniMax (中国)', protocol: 'anthropic',
    hint: 'api.minimaxi.com/anthropic', keyHint: 'API key',
    endpoint: 'https://api.minimaxi.com/anthropic/v1/messages',
    host: 'https://api.minimaxi.com/*', docsUrl: 'https://platform.minimaxi.com',
    models: [
      { value: 'MiniMax-M2', label: 'MiniMax-M2', recommended: true },
      { value: 'MiniMax-M1', label: 'MiniMax-M1' },
    ],
  },

  // ── Custom: user supplies endpoint + protocol + model ────────────────────────
  {
    id: 'custom', label: 'Custom', protocol: 'openai', custom: true,
    hint: 'Any OpenAI- or Anthropic-compatible endpoint', keyHint: 'API key (optional)',
    endpoint: '', host: 'https://*/*', docsUrl: '',
    models: [],
  },
];

export const COMPAT_IDS = COMPAT_PROVIDERS.map((p) => p.id);

export function compatProviderById(id) {
  return COMPAT_PROVIDERS.find((p) => p.id === id) || null;
}

// ── storage-key naming (one independent slot per provider) ─────────────────────
export const provKeyName = (id) => `${id}Key`;        // API key
export const provModelName = (id) => `${id}Model`;    // chosen model id
export const provBaseName = (id) => `${id}BaseUrl`;   // endpoint override (+ custom base)
export const provEnabledName = (id) => `${id}Enabled`; // keyless providers (Ollama local)
export const provProtoName = (id) => `${id}Proto`;    // custom: 'openai' | 'anthropic'
export const provVerName = (id) => `${id}ApiVersion`; // azure api-version

// Every storage key this registry can touch — for allowlisted reads / cleanup.
export function compatStorageKeys() {
  const out = [];
  for (const p of COMPAT_PROVIDERS) {
    out.push(provKeyName(p.id), provModelName(p.id), provBaseName(p.id));
    if (p.keyless) out.push(provEnabledName(p.id));
    if (p.custom) out.push(provProtoName(p.id));
    if (p.needsVersion) out.push(provVerName(p.id));
  }
  return out;
}

/** Is a registry provider usable right now? Keyless ⇒ explicitly enabled; custom ⇒ endpoint set; else ⇒ key present. */
export function isCompatConnected(id, keys = {}) {
  const p = compatProviderById(id);
  if (!p) return false;
  if (p.keyless) return !!keys[provEnabledName(id)];
  if (p.custom) return !!keys[provBaseName(id)]; // endpoint is the minimum; key is optional (local servers)
  if (p.protocol === 'azure') return !!(keys[provBaseName(id)] && keys[provKeyName(id)]); // resource + key
  return !!keys[provKeyName(id)];
}

/** The provider's chosen model, falling back to its recommended/first catalog model. */
export function compatModelFor(id, keys = {}) {
  const p = compatProviderById(id);
  if (!p) return '';
  const recommended = p.models.find((m) => m.recommended)?.value || p.models[0]?.value || '';
  return (keys[provModelName(id)] || recommended || '').trim();
}

/** The wire protocol for a provider (custom resolves from its stored setting). */
export function compatProtocol(id, keys = {}) {
  const p = compatProviderById(id);
  if (!p) return 'openai';
  if (p.custom) return keys[provProtoName(id)] === 'anthropic' ? 'anthropic' : 'openai';
  return p.protocol;
}

/** Accept a full chat-completions URL or a base; return a POST-able OpenAI URL. Only http(s). */
export function normalizeOpenAiUrl(input) {
  const u = (input || '').trim().replace(/\/+$/, '');
  if (!u || !/^https?:\/\//i.test(u)) return '';
  if (/\/chat\/completions$/.test(u)) return u;
  if (/\/v\d+$/.test(u)) return `${u}/chat/completions`;
  return `${u}/v1/chat/completions`;
}

/** Accept a full messages URL or a base; return a POST-able Anthropic URL. Only http(s). */
export function normalizeAnthropicUrl(input) {
  const u = (input || '').trim().replace(/\/+$/, '');
  if (!u || !/^https?:\/\//i.test(u)) return '';
  if (/\/messages$/.test(u)) return u;
  if (/\/v\d+$/.test(u)) return `${u}/messages`;
  return `${u}/v1/messages`;
}

/** The endpoint URL to POST to: per-provider override (normalized) or the registry default. */
export function compatEndpoint(id, keys = {}) {
  const p = compatProviderById(id);
  if (!p) return '';
  if (p.protocol === 'azure') {
    // Azure embeds the deployment (model) and api-version in the URL.
    const base = (keys[provBaseName(id)] || '').trim().replace(/\/+$/, '');
    const model = compatModelFor(id, keys);
    if (!base || !model || !/^https?:\/\//i.test(base)) return '';
    const ver = (keys[provVerName(id)] || p.defaultApiVersion || '2024-10-21').trim();
    return `${base}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(ver)}`;
  }
  const proto = compatProtocol(id, keys);
  const override = (keys[provBaseName(id)] || '').trim();
  if (override) return proto === 'anthropic' ? normalizeAnthropicUrl(override) : normalizeOpenAiUrl(override);
  return p.endpoint || '';
}

// ── pure request bodies + response parsers (shared by call + test paths) ───────
export function openaiBody(model, prompt, maxTokens = 4096) {
  return { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
}

export function anthropicBody(model, prompt, maxTokens = 4096) {
  return { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
}

export function parseOpenAiText(json) {
  const t = json?.choices?.[0]?.message?.content;
  if (!t) throw new Error('Provider returned no text content');
  return t;
}

export function parseAnthropicText(json) {
  const t = Array.isArray(json?.content) ? json.content.find((b) => b?.type === 'text')?.text ?? json.content[0]?.text : json?.content?.[0]?.text;
  if (!t) throw new Error('Provider returned no text content');
  return t;
}
