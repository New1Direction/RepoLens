import { describe, expect, it } from 'vitest';
import {
  isTruncatedOpenRouterResponse,
  OPENROUTER_SCAN_MAX_TOKENS,
  OPENROUTER_STRUCTURED_FREE_MODEL,
  openRouterScanBody,
} from '../src/openrouter.js';

describe('openRouterScanBody', () => {
  it('disables GLM reasoning and requires JSON-capable provider routes', () => {
    expect(openRouterScanBody(undefined, 'scan')).toEqual({
      model: OPENROUTER_STRUCTURED_FREE_MODEL,
      max_tokens: OPENROUTER_SCAN_MAX_TOKENS,
      messages: [{ role: 'user', content: 'scan' }],
      reasoning: { enabled: false },
      response_format: { type: 'json_object' },
      provider: { require_parameters: true },
    });
    expect(OPENROUTER_SCAN_MAX_TOKENS).toBe(8192);
  });

  it('does not impose JSON mode on a user-selected model', () => {
    expect(openRouterScanBody('vendor/model:free', 'scan')).toEqual({
      model: 'vendor/model:free',
      max_tokens: OPENROUTER_SCAN_MAX_TOKENS,
      messages: [{ role: 'user', content: 'scan' }],
    });
  });
});

describe('isTruncatedOpenRouterResponse', () => {
  it('recognizes a completion cut off by the provider', () => {
    expect(isTruncatedOpenRouterResponse({ choices: [{ finish_reason: 'length' }] })).toBe(true);
    expect(isTruncatedOpenRouterResponse({ choices: [{ finish_reason: 'stop' }] })).toBe(false);
  });
});
