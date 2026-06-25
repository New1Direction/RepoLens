import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OPENAI_CLIENT_ID,
  OPENAI_AUTHORIZE_URL,
  OPENAI_REDIRECT_URI,
  OPENAI_CREDENTIALS_KEY,
  OPENAI_OAUTH_ERROR_KEY,
  isOpenAITokenExpired,
  buildOpenAIAuthorizeUrl,
  isOpenAIOAuthCallbackUrl,
  getOpenAICredentials,
  saveOpenAICredentials,
  clearOpenAICredentials,
  exchangeOpenAICode,
  refreshOpenAIToken,
  mintOpenAIApiKey,
  waitForOpenAIOAuthResult,
} from '../src/oauth-openai.js';

let store;
beforeEach(() => {
  store = {};
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k) => {
          if (k == null) return { ...store };
          if (typeof k === 'string') return { [k]: store[k] };
          if (Array.isArray(k)) {
            const out = {};
            for (const key of k) if (key in store) out[key] = store[key];
            return out;
          }
          return {};
        }),
        set: vi.fn(async (obj) => {
          Object.assign(store, obj);
        }),
        remove: vi.fn(async (k) => {
          for (const key of [].concat(k)) delete store[key];
        }),
      },
    },
  };
  global.fetch = vi.fn();
});

/** Queue a single fetch response (ok 200 JSON by default). */
function mockFetchOnce({ ok = true, status = 200, json = {}, text = '' } = {}) {
  global.fetch.mockResolvedValueOnce({
    ok,
    status,
    json: async () => json,
    text: async () => text || JSON.stringify(json),
  });
}

describe('isOpenAITokenExpired', () => {
  it('is expired when there is no token or expiry', () => {
    expect(isOpenAITokenExpired(null)).toBe(true);
    expect(isOpenAITokenExpired({})).toBe(true);
    expect(isOpenAITokenExpired({ access_token: 'a' })).toBe(true); // no expires_at
  });

  it('is expired when within the refresh skew window', () => {
    const creds = { access_token: 'a', expires_at: Date.now() + 30_000 }; // 30s out, skew is 60s
    expect(isOpenAITokenExpired(creds)).toBe(true);
  });

  it('is fresh when comfortably in the future', () => {
    const creds = { access_token: 'a', expires_at: Date.now() + 3_600_000 };
    expect(isOpenAITokenExpired(creds)).toBe(false);
  });
});

describe('buildOpenAIAuthorizeUrl', () => {
  it('builds an auth.openai.com URL with PKCE + Codex params', () => {
    const href = buildOpenAIAuthorizeUrl({ challenge: 'CH', state: 'ST' });
    const u = new URL(href);
    expect(href.startsWith(OPENAI_AUTHORIZE_URL)).toBe(true);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe(OPENAI_CLIENT_ID);
    expect(u.searchParams.get('redirect_uri')).toBe(OPENAI_REDIRECT_URI);
    expect(u.searchParams.get('code_challenge')).toBe('CH');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBe('ST');
    expect(u.searchParams.get('scope')).toContain('openid');
    expect(u.searchParams.get('id_token_add_organizations')).toBe('true');
    expect(u.searchParams.get('codex_cli_simplified_flow')).toBe('true');
  });
});

describe('isOpenAIOAuthCallbackUrl', () => {
  it('matches the loopback callback on any port', () => {
    expect(isOpenAIOAuthCallbackUrl('http://localhost:1455/auth/callback?code=x&state=y')).toBe(true);
    expect(isOpenAIOAuthCallbackUrl('http://127.0.0.1:1455/auth/callback?code=x')).toBe(true);
    expect(isOpenAIOAuthCallbackUrl('http://localhost:9999/auth/callback')).toBe(true);
  });

  it('rejects other hosts, paths, and garbage', () => {
    expect(isOpenAIOAuthCallbackUrl('https://auth.openai.com/oauth/authorize?code=x')).toBe(false);
    expect(isOpenAIOAuthCallbackUrl('http://localhost:1455/other')).toBe(false);
    expect(isOpenAIOAuthCallbackUrl('https://github.com/auth/callback')).toBe(false);
    expect(isOpenAIOAuthCallbackUrl('not a url')).toBe(false);
    expect(isOpenAIOAuthCallbackUrl('')).toBe(false);
  });
});

describe('credential storage', () => {
  it('round-trips a structured record and returns null when absent', async () => {
    expect(await getOpenAICredentials()).toBeNull();
    await saveOpenAICredentials({ access_token: 'A', refresh_token: 'R', id_token: 'I', expires_at: 123 });
    const got = await getOpenAICredentials();
    expect(got).toEqual({ access_token: 'A', refresh_token: 'R', id_token: 'I', expires_at: 123 });
  });

  it('clears both the OAuth record and the minted key slot', async () => {
    store[OPENAI_CREDENTIALS_KEY] = { refresh_token: 'R' };
    store.openaiKey = 'sk-minted';
    await clearOpenAICredentials();
    expect(store[OPENAI_CREDENTIALS_KEY]).toBeUndefined();
    expect(store.openaiKey).toBeUndefined();
  });
});

describe('exchangeOpenAICode', () => {
  it('rejects a state mismatch (CSRF guard) before calling the network', async () => {
    await expect(
      exchangeOpenAICode({ code: 'c', state: 'a', verifier: 'v', storedState: 'b' })
    ).rejects.toThrow(/state mismatch/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('posts the authorization_code grant and stores creds with an absolute expiry', async () => {
    mockFetchOnce({ json: { access_token: 'A', refresh_token: 'R', id_token: 'I', expires_in: 3600 } });
    const before = Date.now();
    const creds = await exchangeOpenAICode({ code: 'CODE', state: 's', verifier: 'VER', storedState: 's' });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/oauth\/token$/);
    expect(opts.body.get('grant_type')).toBe('authorization_code');
    expect(opts.body.get('code')).toBe('CODE');
    expect(opts.body.get('code_verifier')).toBe('VER');
    expect(opts.body.get('client_id')).toBe(OPENAI_CLIENT_ID);

    expect(creds.access_token).toBe('A');
    expect(creds.id_token).toBe('I');
    expect(creds.expires_at).toBeGreaterThanOrEqual(before + 3600_000);
    expect((await getOpenAICredentials()).refresh_token).toBe('R');
  });

  it('throws a readable message when the exchange fails', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: { error: 'invalid_grant', error_description: 'bad code' },
    });
    await expect(
      exchangeOpenAICode({ code: 'x', state: 's', verifier: 'v', storedState: 's' })
    ).rejects.toThrow(/bad code/);
  });
});

describe('refreshOpenAIToken', () => {
  it('returns the cached creds without a network call when still fresh', async () => {
    store[OPENAI_CREDENTIALS_KEY] = {
      access_token: 'A',
      refresh_token: 'R',
      id_token: 'I',
      expires_at: Date.now() + 3_600_000,
    };
    const creds = await refreshOpenAIToken();
    expect(creds.access_token).toBe('A');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refreshes when expired and preserves the prior refresh/id token if omitted', async () => {
    store[OPENAI_CREDENTIALS_KEY] = {
      access_token: 'old',
      refresh_token: 'R',
      id_token: 'OLD_ID',
      expires_at: Date.now() - 1000,
    };
    mockFetchOnce({ json: { access_token: 'new', expires_in: 3600 } }); // no rotated refresh/id token
    const creds = await refreshOpenAIToken();

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.body.get('grant_type')).toBe('refresh_token');
    expect(opts.body.get('refresh_token')).toBe('R');
    expect(creds.access_token).toBe('new');
    expect(creds.refresh_token).toBe('R'); // carried over
    expect(creds.id_token).toBe('OLD_ID'); // carried over
  });

  it('dedups concurrent refreshes into a single network call', async () => {
    store[OPENAI_CREDENTIALS_KEY] = {
      access_token: 'old',
      refresh_token: 'R',
      id_token: 'I',
      expires_at: Date.now() - 1000,
    };
    mockFetchOnce({ json: { access_token: 'new', expires_in: 3600 } }); // only one response queued
    const [a, b] = await Promise.all([refreshOpenAIToken(), refreshOpenAIToken()]);
    expect(a.access_token).toBe('new');
    expect(b.access_token).toBe('new');
    expect(global.fetch).toHaveBeenCalledTimes(1); // the second call rode the in-flight promise
  });

  it('throws and clears credentials when there is no refresh token', async () => {
    store[OPENAI_CREDENTIALS_KEY] = { access_token: 'a', expires_at: Date.now() - 1000 };
    store.openaiKey = 'sk-stale';
    await expect(refreshOpenAIToken()).rejects.toThrow(/reconnect/i);
    expect(store[OPENAI_CREDENTIALS_KEY]).toBeUndefined();
    expect(store.openaiKey).toBeUndefined();
  });

  it('clears credentials when the token endpoint rejects the refresh', async () => {
    store[OPENAI_CREDENTIALS_KEY] = { access_token: 'a', refresh_token: 'R', expires_at: Date.now() - 1000 };
    mockFetchOnce({ ok: false, status: 401, json: { error: 'invalid_grant' } });
    await expect(refreshOpenAIToken()).rejects.toThrow(/session expired/i);
    expect(store[OPENAI_CREDENTIALS_KEY]).toBeUndefined();
  });
});

describe('mintOpenAIApiKey', () => {
  it('token-exchanges the id_token for an API key', async () => {
    mockFetchOnce({ json: { access_token: 'sk-minted-123' } });
    const key = await mintOpenAIApiKey('THE_ID_TOKEN');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/oauth\/token$/);
    expect(opts.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(opts.body.get('requested_token')).toBe('openai-api-key');
    expect(opts.body.get('subject_token')).toBe('THE_ID_TOKEN');
    expect(opts.body.get('subject_token_type')).toBe('urn:ietf:params:oauth:token-type:id_token');
    expect(key).toBe('sk-minted-123');
  });

  it('throws a plan-API-access message when the exchange is rejected', async () => {
    mockFetchOnce({ ok: false, status: 400, json: {} });
    await expect(mintOpenAIApiKey('I')).rejects.toThrow(/API access/i);
  });

  it('throws when no id_token is provided', async () => {
    await expect(mintOpenAIApiKey('')).rejects.toThrow(/reconnect/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws when the response carries no key', async () => {
    mockFetchOnce({ json: { not_a_key: true } });
    await expect(mintOpenAIApiKey('I')).rejects.toThrow(/no API key/i);
  });
});

describe('waitForOpenAIOAuthResult', () => {
  it('resolves with ok once OAuth credentials appear', async () => {
    store[OPENAI_CREDENTIALS_KEY] = {
      access_token: 'acc',
      refresh_token: 'ref',
      id_token: 'id',
      expires_at: Date.now() + 3600000,
    };
    const r = await waitForOpenAIOAuthResult({ timeoutMs: 1000, intervalMs: 10 });
    expect(r).toEqual({ ok: true });
  });

  it('resolves with an error when the callback recorded one', async () => {
    store[OPENAI_OAUTH_ERROR_KEY] = 'ChatGPT sign-in error: access_denied';
    const r = await waitForOpenAIOAuthResult({ timeoutMs: 1000, intervalMs: 10 });
    expect(r.error).toMatch(/access_denied/);
  });

  it('resolves with a timeout error when nothing appears in time', async () => {
    const r = await waitForOpenAIOAuthResult({ timeoutMs: 40, intervalMs: 10 });
    expect(r.error).toMatch(/timed out/i);
  });
});
