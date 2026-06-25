// Anthropic subscription OAuth (Claude Pro/Max), adapted from the Claude Code / pi flow.
// This is separate from Console API keys: OAuth tokens are bearer tokens and require
// Anthropic's Claude Code beta headers when calling the Messages API.

import { base64url } from './oauth-pkce.js';

const decode = (s) => atob(s);
export const ANTHROPIC_CLIENT_ID = decode('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl');
export const ANTHROPIC_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
export const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
export const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
export const ANTHROPIC_SCOPES = 'org:create_api_key user:profile user:inference';

export const ANTHROPIC_ACCESS_KEY = 'anthropicAccess';
export const ANTHROPIC_REFRESH_KEY = 'anthropicRefresh';
export const ANTHROPIC_EXPIRY_KEY = 'anthropicExpiry';
export const ANTHROPIC_OAUTH_VERIFIER_KEY = 'anthropicOAuthVerifier';

export async function createAnthropicPkcePair() {
  const verifierArr = new Uint8Array(32);
  crypto.getRandomValues(verifierArr);
  const verifier = base64url(verifierArr);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export function buildAnthropicAuthorizeUrl({ verifier, challenge }) {
  const params = new URLSearchParams({
    code: 'true',
    client_id: ANTHROPIC_CLIENT_ID,
    response_type: 'code',
    redirect_uri: ANTHROPIC_REDIRECT_URI,
    scope: ANTHROPIC_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // Claude's CLI flow echoes the verifier back as the state value. The callback
    // page shows users a pasteable `code#state` string.
    state: verifier,
  });
  return `${ANTHROPIC_AUTHORIZE_URL}?${params.toString()}`;
}

export function parseAnthropicAuthCode(input, fallbackState = '') {
  const raw = String(input || '').trim();
  if (!raw) return { code: '', state: '' };
  try {
    const url = new URL(raw);
    const code = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || (url.hash ? url.hash.slice(1) : '') || fallbackState;
    return { code, state };
  } catch {
    const [code, state] = raw.split('#');
    return { code: (code || '').trim(), state: (state || fallbackState || '').trim() };
  }
}

function expiresAt(expiresInSec) {
  const sec = Number(expiresInSec) || 3600;
  return Date.now() + sec * 1000 - 5 * 60 * 1000;
}

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch with retry on 429 rate-limit. Anthropic's token endpoint throttles
 *  aggressively — a single retry with backoff prevents false failures. */
async function fetchWithRetry(url, opts, { maxRetries = 2, baseDelayMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.status !== 429) return res;
      // Rate limited — read retry hint and back off
      const retryAfter = res.headers.get('retry-after');
      const delay = retryAfter ? Math.max(1000, Number(retryAfter) * 1000) : baseDelayMs * 2 ** attempt;
      if (attempt < maxRetries) {
        await _sleep(Math.min(delay, 30000));
        continue;
      }
      return res; // last attempt — let the caller handle the 429
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await _sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Token request failed after retries');
}

async function parseTokenResponse(res, context) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(`${context} failed: Rate limited. Please try again in a minute.`);
    }
    const detail =
      json.error_description || json.error?.message || json.error || json.message || `${res.status}`;
    throw new Error(`${context} failed: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`);
  }
  if (!json.access_token) throw new Error(`${context} failed: Anthropic returned no access token`);
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: expiresAt(json.expires_in),
  };
}

export async function exchangeAnthropicCode({ authCode, verifier }) {
  const { code, state } = parseAnthropicAuthCode(authCode, verifier);
  if (!code) throw new Error('Paste the Claude authorization code first.');
  if (state && state !== verifier) throw new Error('Claude sign-in state mismatch. Start the sign-in again.');

  const res = await fetchWithRetry(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: ANTHROPIC_CLIENT_ID,
      code,
      state: state || verifier,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  return parseTokenResponse(res, 'Claude token exchange');
}

export function isAnthropicTokenExpired(expires) {
  return !expires || Number(expires) <= Date.now() + 60_000;
}

export async function saveAnthropicOAuthTokens(tokens) {
  const patch = {
    [ANTHROPIC_ACCESS_KEY]: tokens.access,
    [ANTHROPIC_EXPIRY_KEY]: tokens.expires,
  };
  if (tokens.refresh) patch[ANTHROPIC_REFRESH_KEY] = tokens.refresh;
  await chrome.storage.local.set(patch);
  return tokens.access;
}

export async function clearAnthropicOAuthTokens() {
  await chrome.storage.local.remove([
    ANTHROPIC_ACCESS_KEY,
    ANTHROPIC_REFRESH_KEY,
    ANTHROPIC_EXPIRY_KEY,
    ANTHROPIC_OAUTH_VERIFIER_KEY,
    'anthropicCredentials', // legacy cleanup
  ]);
}

let refreshInFlight = null;

export async function refreshAnthropicAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const s = await chrome.storage.local.get([
      ANTHROPIC_ACCESS_KEY,
      ANTHROPIC_REFRESH_KEY,
      ANTHROPIC_EXPIRY_KEY,
    ]);
    if (s[ANTHROPIC_ACCESS_KEY] && !isAnthropicTokenExpired(s[ANTHROPIC_EXPIRY_KEY])) {
      return s[ANTHROPIC_ACCESS_KEY];
    }
    if (!s[ANTHROPIC_REFRESH_KEY]) {
      await clearAnthropicOAuthTokens();
      throw new Error('Claude sign-in expired — reconnect Anthropic in Settings.');
    }

    const res = await fetchWithRetry(ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: ANTHROPIC_CLIENT_ID,
        refresh_token: s[ANTHROPIC_REFRESH_KEY],
      }),
    });
    const tokens = await parseTokenResponse(res, 'Claude token refresh');
    if (!tokens.refresh) tokens.refresh = s[ANTHROPIC_REFRESH_KEY];
    await saveAnthropicOAuthTokens(tokens);
    return tokens.access;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
