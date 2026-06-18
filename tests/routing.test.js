import { describe, it, expect } from 'vitest';
import { buildAttemptPlan, isConnected, modelFor, CHAIN, DEFAULT_MODELS } from '../routing.js';

// All five providers connected, each on its default model.
const allKeys = {
  nousKey: 'n',
  googleKey: 'g',
  openrouterKey: 'o',
  xaiKey: 'x',
  anthropicKey: 'a',
};
const ids = (plan) => plan.map((p) => p.provider);

describe('isConnected', () => {
  it('treats refresh-token providers as connected', () => {
    expect(isConnected('xai', { xaiRefresh: 'r' })).toBe(true);
    expect(isConnected('xai', {})).toBe(false);
    expect(isConnected('anthropic', { anthropicRefresh: 'r' })).toBe(true);
  });
});

describe('modelFor', () => {
  it('uses the configured model, else the default', () => {
    expect(modelFor('anthropic', { anthropicModel: 'claude-opus-4-8' })).toBe('claude-opus-4-8');
    expect(modelFor('anthropic', {})).toBe(DEFAULT_MODELS.anthropic);
  });
});

describe('buildAttemptPlan', () => {
  it('absent routing → full chain order, only connected providers', () => {
    const plan = buildAttemptPlan({ keys: allKeys });
    expect(ids(plan)).toEqual(CHAIN);
  });

  it("a part set to 'default' → plain chain", () => {
    const plan = buildAttemptPlan({ routing: { core: 'default' }, part: 'core', keys: allKeys });
    expect(ids(plan)).toEqual(CHAIN);
  });

  it('override with a connected provider is tried first, then the chain (de-duped)', () => {
    const plan = buildAttemptPlan({
      routing: { core: 'anthropic:claude-opus-4-8' },
      part: 'core',
      keys: allKeys,
    });
    expect(plan[0]).toEqual({ provider: 'anthropic', model: 'claude-opus-4-8' });
    // anthropic default (sonnet) still appears once later as fallback; opus not duplicated
    expect(plan.filter((p) => p.provider === 'anthropic')).toEqual([
      { provider: 'anthropic', model: 'claude-opus-4-8' },
      { provider: 'anthropic', model: DEFAULT_MODELS.anthropic },
    ]);
    expect(plan).toHaveLength(CHAIN.length + 1); // chain + the extra opus attempt
  });

  it('override identical to the chain entry is not duplicated', () => {
    const plan = buildAttemptPlan({
      routing: { core: 'anthropic:claude-sonnet-4-6' },
      part: 'core',
      keys: allKeys,
    });
    expect(plan.filter((p) => p.provider === 'anthropic')).toHaveLength(1);
    expect(plan[0]).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
  });

  it('override pointing at an unconnected provider is ignored', () => {
    const onlyGoogle = { googleKey: 'g' };
    const plan = buildAttemptPlan({
      routing: { core: 'anthropic:claude-opus-4-8' },
      part: 'core',
      keys: onlyGoogle,
    });
    expect(ids(plan)).toEqual(['google']);
  });

  it('nothing connected → empty plan', () => {
    expect(buildAttemptPlan({ routing: { core: 'anthropic:x' }, part: 'core', keys: {} })).toEqual([]);
  });

  it('garbled override (no colon) is treated as default', () => {
    const plan = buildAttemptPlan({ routing: { core: 'garbage' }, part: 'core', keys: allKeys });
    expect(ids(plan)).toEqual(CHAIN);
  });

  it('respects a connected provider on a non-default configured model in the chain', () => {
    const plan = buildAttemptPlan({ keys: { ...allKeys, googleModel: 'gemini-2.5-pro' } });
    const g = plan.find((p) => p.provider === 'google');
    expect(g.model).toBe('gemini-2.5-pro');
  });

  // ── registry (OpenAI/Anthropic-compatible) providers ───────────────────────
  it('a connected registry provider is a usable fallback when nothing in the chain is connected', () => {
    const plan = buildAttemptPlan({ keys: { deepseekKey: 'sk-x' } });
    expect(plan).toEqual([{ provider: 'deepseek', model: 'deepseek-chat' }]);
  });

  it('a registry provider can be the per-part override and is tried first', () => {
    const keys = { ...allKeys, groqKey: 'gsk-x' };
    const plan = buildAttemptPlan({ routing: { core: 'groq:llama-3.3-70b-versatile' }, part: 'core', keys });
    expect(plan[0]).toEqual({ provider: 'groq', model: 'llama-3.3-70b-versatile' });
    // and groq also appears (once) as a registry fallback — de-duped on provider:model
    expect(plan.filter((p) => p.provider === 'groq')).toHaveLength(1);
  });

  it('keyless Ollama counts as connected only when enabled', () => {
    expect(isConnected('ollama', {})).toBe(false);
    expect(isConnected('ollama', { ollamaEnabled: true })).toBe(true);
    const plan = buildAttemptPlan({ keys: { ollamaEnabled: true, ollamaModel: 'llama3.1' } });
    expect(plan).toEqual([{ provider: 'ollama', model: 'llama3.1' }]);
  });

  it('chain providers still take precedence over registry fallbacks in order', () => {
    const plan = buildAttemptPlan({ keys: { ...allKeys, deepseekKey: 'sk-x' } });
    expect(ids(plan)).toEqual([...CHAIN, 'deepseek']);
  });
});
