import { describe, it, expect } from 'vitest';
import {
  COMPAT_PROVIDERS,
  COMPAT_IDS,
  compatProviderById,
  provKeyName,
  provModelName,
  provBaseName,
  provEnabledName,
  provProtoName,
  compatStorageKeys,
  isCompatConnected,
  compatModelFor,
  compatProtocol,
  normalizeOpenAiUrl,
  normalizeAnthropicUrl,
  compatEndpoint,
  openaiBody,
  anthropicBody,
  parseOpenAiText,
  parseAnthropicText,
} from '../providers.js';

describe('registry integrity', () => {
  it('every provider has id/label/protocol and a non-empty endpoint (except custom/azure)', () => {
    for (const p of COMPAT_PROVIDERS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(['openai', 'anthropic', 'azure']).toContain(p.protocol);
      // custom + azure build their endpoint dynamically from user-entered settings
      if (!p.custom && p.protocol !== 'azure') expect(p.endpoint).toMatch(/^https?:\/\//);
    }
  });
  it('ids are unique', () => {
    expect(new Set(COMPAT_IDS).size).toBe(COMPAT_IDS.length);
  });
  it('at most one recommended model per provider', () => {
    for (const p of COMPAT_PROVIDERS) {
      expect(p.models.filter((m) => m.recommended).length).toBeLessThanOrEqual(1);
    }
  });
  it('does not collide with the five first-class providers', () => {
    for (const id of ['anthropic', 'google', 'openrouter', 'xai', 'nous']) {
      expect(COMPAT_IDS).not.toContain(id);
    }
  });
});

describe('storage-key naming', () => {
  it('derives independent slots per provider', () => {
    expect(provKeyName('deepseek')).toBe('deepseekKey');
    expect(provModelName('deepseek')).toBe('deepseekModel');
    expect(provBaseName('deepseek')).toBe('deepseekBaseUrl');
    expect(provEnabledName('ollama')).toBe('ollamaEnabled');
    expect(provProtoName('custom')).toBe('customProto');
  });
  it('compatStorageKeys covers key/model/base for all, +enabled/proto where relevant', () => {
    const keys = compatStorageKeys();
    expect(keys).toContain('openaiKey');
    expect(keys).toContain('ollamaEnabled'); // keyless
    expect(keys).toContain('customProto'); // custom
    expect(keys).toContain('customBaseUrl');
    // no duplicates
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('isCompatConnected', () => {
  it('keyed provider needs its key', () => {
    expect(isCompatConnected('deepseek', {})).toBe(false);
    expect(isCompatConnected('deepseek', { deepseekKey: 'sk-x' })).toBe(true);
  });
  it('keyless provider needs the enabled flag, not a key', () => {
    expect(isCompatConnected('ollama', {})).toBe(false);
    expect(isCompatConnected('ollama', { ollamaEnabled: true })).toBe(true);
  });
  it('custom needs an endpoint; the key is optional (local servers)', () => {
    expect(isCompatConnected('custom', { customKey: 'k' })).toBe(false); // key without an endpoint → not configured
    expect(isCompatConnected('custom', { customBaseUrl: 'https://x/y' })).toBe(true); // endpoint alone is enough
    expect(isCompatConnected('custom', { customBaseUrl: 'https://x/y', customKey: 'k' })).toBe(true);
  });
  it('unknown provider is never connected', () => {
    expect(isCompatConnected('nope', { nopeKey: 'x' })).toBe(false);
  });
});

describe('compatModelFor', () => {
  it('uses the stored model when set', () => {
    expect(compatModelFor('deepseek', { deepseekModel: 'deepseek-reasoner' })).toBe('deepseek-reasoner');
  });
  it('falls back to the recommended catalog model', () => {
    expect(compatModelFor('deepseek', {})).toBe('deepseek-chat');
  });
  it('falls back to the first model when none is recommended', () => {
    // volcengine has an empty catalog → empty string is acceptable (user must set one)
    expect(compatModelFor('volcengine', {})).toBe('');
    expect(compatModelFor('volcengine', { volcengineModel: 'ep-123' })).toBe('ep-123');
  });
});

describe('compatProtocol', () => {
  it('returns the fixed protocol for built-ins', () => {
    expect(compatProtocol('deepseek')).toBe('openai');
    expect(compatProtocol('minimax')).toBe('anthropic');
  });
  it('resolves custom from its stored setting (default openai)', () => {
    expect(compatProtocol('custom', {})).toBe('openai');
    expect(compatProtocol('custom', { customProto: 'anthropic' })).toBe('anthropic');
    expect(compatProtocol('custom', { customProto: 'garbage' })).toBe('openai');
  });
});

describe('URL normalization', () => {
  it('openai: leaves a full chat-completions URL alone', () => {
    expect(normalizeOpenAiUrl('https://x.test/v1/chat/completions')).toBe('https://x.test/v1/chat/completions');
  });
  it('openai: appends /chat/completions to a versioned base', () => {
    expect(normalizeOpenAiUrl('https://x.test/v1')).toBe('https://x.test/v1/chat/completions');
  });
  it('openai: appends /v1/chat/completions to a bare base, trimming trailing slashes', () => {
    expect(normalizeOpenAiUrl('https://x.test/')).toBe('https://x.test/v1/chat/completions');
  });
  it('anthropic: leaves a full messages URL alone and handles bases', () => {
    expect(normalizeAnthropicUrl('https://x.test/anthropic/v1/messages')).toBe('https://x.test/anthropic/v1/messages');
    expect(normalizeAnthropicUrl('https://x.test/anthropic')).toBe('https://x.test/anthropic/v1/messages');
    expect(normalizeAnthropicUrl('https://x.test/v1')).toBe('https://x.test/v1/messages');
  });
  it('returns empty for empty input', () => {
    expect(normalizeOpenAiUrl('')).toBe('');
    expect(normalizeAnthropicUrl('  ')).toBe('');
  });
  it('rejects non-http(s) schemes', () => {
    expect(normalizeOpenAiUrl('javascript:alert(1)')).toBe('');
    expect(normalizeOpenAiUrl('file:///etc/passwd')).toBe('');
    expect(normalizeAnthropicUrl('ftp://x.test')).toBe('');
    expect(normalizeOpenAiUrl('http://localhost:11434')).toBe('http://localhost:11434/v1/chat/completions');
  });
});

describe('compatEndpoint', () => {
  it('uses the registry endpoint when no override', () => {
    expect(compatEndpoint('deepseek', {})).toBe('https://api.deepseek.com/v1/chat/completions');
  });
  it('honors a per-provider override, normalized by protocol', () => {
    expect(compatEndpoint('deepseek', { deepseekBaseUrl: 'https://proxy.test/v1' }))
      .toBe('https://proxy.test/v1/chat/completions');
    expect(compatEndpoint('minimax', { minimaxBaseUrl: 'https://proxy.test/anthropic' }))
      .toBe('https://proxy.test/anthropic/v1/messages');
  });
  it('custom builds from its base + protocol', () => {
    expect(compatEndpoint('custom', { customBaseUrl: 'https://my.test', customProto: 'anthropic' }))
      .toBe('https://my.test/v1/messages');
    expect(compatEndpoint('custom', { customBaseUrl: 'https://my.test/v1' }))
      .toBe('https://my.test/v1/chat/completions');
  });
  it('azure embeds the deployment + api-version and needs a resource endpoint + model', () => {
    expect(compatEndpoint('azure', { azureBaseUrl: 'https://r.openai.azure.com/', azureModel: 'gpt4o', azureApiVersion: '2024-10-21' }))
      .toBe('https://r.openai.azure.com/openai/deployments/gpt4o/chat/completions?api-version=2024-10-21');
    expect(compatEndpoint('azure', { azureBaseUrl: 'https://r.openai.azure.com', azureModel: 'd1' }))
      .toMatch(/\/openai\/deployments\/d1\/chat\/completions\?api-version=/); // default version
    expect(compatEndpoint('azure', { azureBaseUrl: 'https://r.openai.azure.com' })).toBe(''); // no deployment yet
  });
});

describe('azure connectivity', () => {
  it('needs both a resource endpoint and a key', () => {
    expect(isCompatConnected('azure', { azureBaseUrl: 'https://r.openai.azure.com' })).toBe(false);
    expect(isCompatConnected('azure', { azureKey: 'k' })).toBe(false);
    expect(isCompatConnected('azure', { azureBaseUrl: 'https://r.openai.azure.com', azureKey: 'k' })).toBe(true);
  });
});

describe('request bodies + response parsers', () => {
  it('openaiBody shapes a single user message', () => {
    expect(openaiBody('m', 'hi', 10)).toEqual({ model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
  });
  it('anthropicBody shapes a single user message', () => {
    expect(anthropicBody('m', 'hi')).toEqual({ model: 'm', max_tokens: 4096, messages: [{ role: 'user', content: 'hi' }] });
  });
  it('parseOpenAiText reads choices[0].message.content', () => {
    expect(parseOpenAiText({ choices: [{ message: { content: 'out' } }] })).toBe('out');
  });
  it('parseOpenAiText throws on empty', () => {
    expect(() => parseOpenAiText({ choices: [] })).toThrow(/no text/i);
  });
  it('parseAnthropicText reads the first text block', () => {
    expect(parseAnthropicText({ content: [{ type: 'text', text: 'out' }] })).toBe('out');
    expect(parseAnthropicText({ content: [{ type: 'thinking', text: 't' }, { type: 'text', text: 'real' }] })).toBe('real');
  });
  it('parseAnthropicText throws on empty', () => {
    expect(() => parseAnthropicText({ content: [] })).toThrow(/no text/i);
  });
});
