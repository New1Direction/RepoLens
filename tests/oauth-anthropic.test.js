import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ANTHROPIC_CLIENT_ID,
  ANTHROPIC_REDIRECT_URI,
  ANTHROPIC_TOKEN_URL,
  buildAnthropicAuthorizeUrl,
  exchangeAnthropicCode,
  parseAnthropicAuthCode,
  refreshAnthropicAccessToken,
  ANTHROPIC_ACCESS_KEY,
  ANTHROPIC_REFRESH_KEY,
  ANTHROPIC_EXPIRY_KEY,
} from '../oauth-anthropic.js';

let store;
beforeEach(() => {
  store = {};
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k) => {
          if (typeof k === 'string') return { [k]: store[k] };
          const out = {};
          for (const key of [].concat(k || [])) if (key in store) out[key] = store[key];
          return out;
        }),
        set: vi.fn(async (obj) => Object.assign(store, obj)),
        remove: vi.fn(async (k) => {
          for (const key of [].concat(k)) delete store[key];
        }),
      },
    },
  };
  global.fetch = vi.fn();
});

function mockFetchOnce({ ok = true, status = 200, json = {} } = {}) {
  global.fetch.mockResolvedValueOnce({ ok, status, json: async () => json });
}

describe('buildAnthropicAuthorizeUrl', () => {
  it('builds the Claude Code OAuth URL', () => {
    const href = buildAnthropicAuthorizeUrl({ verifier: 'VERIFIER', challenge: 'CHALLENGE' });
    const u = new URL(href);
    expect(u.origin + u.pathname).toBe('https://claude.ai/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe(ANTHROPIC_CLIENT_ID);
    expect(u.searchParams.get('redirect_uri')).toBe(ANTHROPIC_REDIRECT_URI);
    expect(u.searchParams.get('code_challenge')).toBe('CHALLENGE');
    expect(u.searchParams.get('state')).toBe('VERIFIER');
    expect(u.searchParams.get('scope')).toContain('user:inference');
  });
});

describe('parseAnthropicAuthCode', () => {
  it('accepts code#state and callback URLs', () => {
    expect(parseAnthropicAuthCode('CODE#STATE')).toEqual({ code: 'CODE', state: 'STATE' });
    expect(
      parseAnthropicAuthCode('https://console.anthropic.com/oauth/code/callback?code=C&state=S')
    ).toEqual({
      code: 'C',
      state: 'S',
    });
  });
});

describe('exchangeAnthropicCode', () => {
  it('posts the authorization code grant as JSON', async () => {
    mockFetchOnce({ json: { access_token: 'A', refresh_token: 'R', expires_in: 3600 } });
    const tokens = await exchangeAnthropicCode({ authCode: 'CODE#VER', verifier: 'VER' });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe(ANTHROPIC_TOKEN_URL);
    const body = JSON.parse(opts.body);
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('CODE');
    expect(body.state).toBe('VER');
    expect(body.code_verifier).toBe('VER');
    expect(tokens.access).toBe('A');
    expect(tokens.refresh).toBe('R');
  });

  it('rejects a state mismatch before calling the network', async () => {
    await expect(exchangeAnthropicCode({ authCode: 'CODE#BAD', verifier: 'VER' })).rejects.toThrow(/state/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('refreshAnthropicAccessToken', () => {
  it('returns a fresh cached access token', async () => {
    store[ANTHROPIC_ACCESS_KEY] = 'A';
    store[ANTHROPIC_EXPIRY_KEY] = Date.now() + 3_600_000;
    await expect(refreshAnthropicAccessToken()).resolves.toBe('A');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and stores the replacement', async () => {
    store[ANTHROPIC_ACCESS_KEY] = 'old';
    store[ANTHROPIC_REFRESH_KEY] = 'R';
    store[ANTHROPIC_EXPIRY_KEY] = Date.now() - 1000;
    mockFetchOnce({ json: { access_token: 'new', expires_in: 3600 } });
    await expect(refreshAnthropicAccessToken()).resolves.toBe('new');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.grant_type).toBe('refresh_token');
    expect(body.refresh_token).toBe('R');
    expect(store[ANTHROPIC_ACCESS_KEY]).toBe('new');
    expect(store[ANTHROPIC_REFRESH_KEY]).toBe('R');
  });
});
