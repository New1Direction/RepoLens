/** OpenAI OAuth — "Sign in with ChatGPT" (the same flow the Codex CLI performs).
 *
 * PKCE authorize → authorization_code exchange → refresh, plus a token-exchange
 * step that mints a usable OpenAI API key from the
 * id_token (`requested_token=openai-api-key`) — the documented, stable path the
 * `codex` CLI uses when an account has API access. Inference then runs through the
 * ordinary api.openai.com engine (background.js), so we reuse the proven OpenAI
 * call path rather than the moving ChatGPT-backend internal surface.
 *
 * The OAuth client is OpenAI's public Codex client; we never ship a secret and the
 * redirect lands on http://localhost:1455/auth/callback — background.js intercepts
 * that navigation (the local server the CLI would run doesn't exist in a browser).
 *
 * Hardened OAuth-credential patterns:
 * - Explicit 60s refresh skew
 * - Structured credential record
 * - In-flight refresh deduplication
 */

export const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const OPENAI_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
export const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
export const OPENAI_REDIRECT_URI = 'http://localhost:1455/auth/callback';
export const OPENAI_SCOPES = 'openid profile email offline_access';

export const OPENAI_OAUTH_VERIFIER_KEY = 'repolens_openai_oauth_verifier';
export const OPENAI_OAUTH_STATE_KEY = 'repolens_openai_oauth_state';
export const OPENAI_OAUTH_ERROR_KEY = 'repolens_openai_oauth_error';

export const OPENAI_REFRESH_SKEW_SECONDS = 60;
export const OPENAI_CREDENTIALS_KEY = 'openaiOauthCredentials'; // structured storage
export const OPENAI_API_KEY_NAME = 'openaiKey'; // the minted key shares the compat slot

/** Structured credential shape:
 * {
 *   access_token: string,
 *   refresh_token: string,
 *   id_token: string,    // used as subject_token to mint an API key
 *   expires_at: number,  // unix ms
 * }
 */

// In-flight refresh deduplication — prevents concurrent scan parts from each
// hammering the token endpoint when the access token has just expired.
let _openaiRefreshPromise = null;

export function isOpenAITokenExpired(creds, skewSeconds = OPENAI_REFRESH_SKEW_SECONDS) {
  if (!creds?.access_token || !creds?.expires_at) return true;
  const skewMs = Math.max(0, skewSeconds) * 1000;
  return Date.now() + skewMs >= creds.expires_at;
}

export async function getOpenAICredentials() {
  const data = await chrome.storage.local.get([OPENAI_CREDENTIALS_KEY]);
  const creds = data[OPENAI_CREDENTIALS_KEY];
  return creds && typeof creds === 'object' ? creds : null;
}

export async function saveOpenAICredentials(creds) {
  if (!creds) return;
  const structured = {
    access_token: creds.access_token || null,
    refresh_token: creds.refresh_token || null,
    id_token: creds.id_token || null,
    expires_at: creds.expires_at || null,
  };
  await chrome.storage.local.set({ [OPENAI_CREDENTIALS_KEY]: structured });
}

/** Clear OAuth state. Also drops the minted API key in the shared compat slot so
 *  a disconnected OpenAI provider stops counting as connected. */
export async function clearOpenAICredentials() {
  await chrome.storage.local.remove([OPENAI_CREDENTIALS_KEY, OPENAI_API_KEY_NAME]);
}

export function buildOpenAIAuthorizeUrl({ challenge, state }) {
  const authUrl = new URL(OPENAI_AUTHORIZE_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', OPENAI_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', OPENAI_REDIRECT_URI);
  authUrl.searchParams.set('scope', OPENAI_SCOPES);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  // Codex-specific authorize params: include org membership in the id_token and use
  // the simplified consent flow.
  authUrl.searchParams.set('id_token_add_organizations', 'true');
  authUrl.searchParams.set('codex_cli_simplified_flow', 'true');
  return authUrl.href;
}

/** True for the loopback redirect the CLI would catch (any port). The browser can't
 *  load it — background.js intercepts the navigation and reads ?code= from here. */
export function isOpenAIOAuthCallbackUrl(urlString) {
  try {
    const url = new URL(urlString);
    const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return isLoopback && url.pathname === '/auth/callback';
  } catch {
    return false;
  }
}

export async function exchangeOpenAICode({ code, state, verifier, storedState }) {
  if (state !== storedState) {
    throw new Error('State mismatch — possible CSRF');
  }

  const res = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: OPENAI_REDIRECT_URI,
      client_id: OPENAI_CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    throw new Error(await tokenErrorMessage(res, 'Sign-in failed'));
  }

  const tokens = await res.json();
  const creds = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    id_token: tokens.id_token,
    expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
  };
  await saveOpenAICredentials(creds);
  return creds;
}

export async function refreshOpenAIToken({ force = false } = {}) {
  if (_openaiRefreshPromise && !force) {
    return _openaiRefreshPromise;
  }

  _openaiRefreshPromise = (async () => {
    try {
      const creds = await getOpenAICredentials();

      if (!force && creds && !isOpenAITokenExpired(creds)) {
        return creds;
      }

      if (!creds?.refresh_token) {
        await clearOpenAICredentials();
        throw new Error('OpenAI session expired — please reconnect in Settings');
      }

      const res = await fetch(OPENAI_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: OPENAI_CLIENT_ID,
          refresh_token: creds.refresh_token,
          scope: OPENAI_SCOPES,
        }),
      });

      if (!res.ok) {
        await clearOpenAICredentials();
        throw new Error('OpenAI session expired — please reconnect in Settings');
      }

      const tokens = await res.json();
      const newCreds = {
        access_token: tokens.access_token,
        // Some refresh responses omit a rotated refresh/id token — keep the prior one.
        refresh_token: tokens.refresh_token || creds.refresh_token,
        id_token: tokens.id_token || creds.id_token,
        expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
      };
      await saveOpenAICredentials(newCreds);
      return newCreds;
    } finally {
      _openaiRefreshPromise = null;
    }
  })();

  return _openaiRefreshPromise;
}

/** Token-exchange the id_token for a usable OpenAI API key (sk-…). This is the
 *  documented Codex path; it requires the account to have API access. The returned
 *  key is what inference uses against api.openai.com. */
export async function mintOpenAIApiKey(idToken) {
  if (!idToken) throw new Error('No id_token to exchange — please reconnect in Settings');

  const res = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: OPENAI_CLIENT_ID,
      requested_token: 'openai-api-key',
      subject_token: idToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    }),
  });

  if (!res.ok) {
    // The common cause is a ChatGPT plan without API platform access.
    const detail = await tokenErrorMessage(res, '');
    throw new Error(
      detail
        ? `Couldn't enable API access for this ChatGPT account: ${detail}`
        : "This ChatGPT plan doesn't include API access — paste an OpenAI API key instead."
    );
  }

  const data = await res.json();
  const key = data.access_token;
  if (!key) throw new Error('OpenAI returned no API key from the token exchange');
  return key;
}

/** Best-effort human message from an OAuth token-endpoint error body. */
async function tokenErrorMessage(res, fallback) {
  const body = await res.text().catch(() => '');
  try {
    const e = JSON.parse(body);
    return e.error_description || e.error || fallback || `Token request failed (${res.status})`;
  } catch {
    return (body && body.slice(0, 160)) || fallback || `Token request failed (${res.status})`;
  }
}

/** Poll storage until background.js finishes the callback exchange + key mint. */
export async function waitForOpenAIOAuthResult({ timeoutMs = 300_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await chrome.storage.local.get([OPENAI_API_KEY_NAME, OPENAI_OAUTH_ERROR_KEY]);
    if (s[OPENAI_API_KEY_NAME]) return { key: s[OPENAI_API_KEY_NAME] };
    if (s[OPENAI_OAUTH_ERROR_KEY]) return { error: s[OPENAI_OAUTH_ERROR_KEY] };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { error: 'Timed out — finish signing in and try Connect again' };
}
