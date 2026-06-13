import { describe, it, expect } from 'vitest';
import { categorizeError, rankErrors } from '../errors.js';

describe('categorizeError', () => {
  it('classifies auth failures as fixable, not retryable', () => {
    const a = categorizeError(new Error('Anthropic session expired — please reconnect in Settings'), 'Anthropic');
    expect(a.kind).toBe('auth');
    expect(a.retryable).toBe(false);
    expect(a.fixable).toBe(true);
    expect(a.userMessage).toMatch(/reconnect/i);
    expect(categorizeError({ status: 401 }).kind).toBe('auth');
    expect(categorizeError('invalid x-api-key').kind).toBe('auth');
  });
  it('classifies rate limits as retryable', () => {
    expect(categorizeError(new Error('429 Too Many Requests')).kind).toBe('rate_limit');
    expect(categorizeError('rate limit exceeded').retryable).toBe(true);
    expect(categorizeError({ status: 429 }).retryable).toBe(true);
  });
  it('classifies 5xx and network errors as retryable', () => {
    expect(categorizeError({ status: 503 }).kind).toBe('server');
    expect(categorizeError('Service Unavailable').retryable).toBe(true);
    expect(categorizeError('Failed to fetch').kind).toBe('network');
    expect(categorizeError('overloaded').retryable).toBe(true);
  });
  it('classifies an unknown model as a fixable not_found', () => {
    const r = categorizeError(new Error('model claude-x does not exist'), 'Anthropic');
    expect(r.kind).toBe('not_found');
    expect(r.userMessage).toMatch(/valid model/i);
  });
  it('names the provider in the message', () => {
    expect(categorizeError({ status: 429 }, 'Gemini').userMessage).toMatch(/Gemini/);
  });
  it('falls back to unknown for opaque errors', () => {
    const r = categorizeError(new Error('weirdness'));
    expect(r.kind).toBe('unknown');
    expect(r.retryable).toBe(false);
  });
});

describe('rankErrors', () => {
  it('surfaces the most actionable (fixable) failure over transient ones', () => {
    const ranked = rankErrors([
      { provider: 'Nous', error: new Error('429 rate limit') },
      { provider: 'Anthropic', error: new Error('session expired — reconnect in Settings') },
      { provider: 'Gemini', error: new Error('503 unavailable') },
    ]);
    expect(ranked.kind).toBe('auth');
    expect(ranked.userMessage).toMatch(/Anthropic/);
  });
  it('keeps a transient message when nothing is user-fixable', () => {
    const ranked = rankErrors([
      { provider: 'Nous', error: new Error('429 rate limit') },
      { provider: 'Gemini', error: new Error('503 unavailable') },
    ]);
    expect(ranked.kind).toBe('rate_limit');
  });
  it('handles an empty list with a connect-a-provider prompt', () => {
    expect(rankErrors([]).kind).toBe('none');
    expect(rankErrors([]).userMessage).toMatch(/open Settings/i);
  });
  it('accepts raw errors as well as {provider,error} items', () => {
    expect(rankErrors([new Error('429 rate limit')]).kind).toBe('rate_limit');
  });
});
