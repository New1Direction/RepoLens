/** xAI Grok OAuth — device code flow (SuperGrok subscription). */

export const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
export const XAI_DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code';
export const XAI_TOKEN_URL = 'https://auth.x.ai/oauth2/token';
export const XAI_CHAT_PROXY = 'https://cli-chat-proxy.grok.com/v1/chat/completions';
export const XAI_SCOPES = 'openid profile email offline_access grok-cli:access';

export async function requestXaiDeviceCode() {
  const res = await fetch(XAI_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: XAI_CLIENT_ID,
      scope: XAI_SCOPES,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || `Device code request failed (${res.status})`);
  }

  return res.json();
}

export async function pollXaiDeviceToken(
  deviceCode,
  { intervalSec = 5, expiresInSec = 600, onPending } = {}
) {
  const interval = intervalSec * 1000;
  const deadline = Date.now() + expiresInSec * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const res = await fetch(XAI_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: XAI_CLIENT_ID,
      }),
    });

    if (res.ok) return res.json();

    const err = await res.json().catch(() => ({}));
    if (err.error === 'authorization_pending') {
      onPending?.();
      continue;
    }
    if (err.error === 'slow_down') {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    throw new Error(err.error_description || err.error || 'Token polling failed');
  }

  throw new Error('Device code expired — try again');
}

export async function storeXaiOAuthTokens(token) {
  const structured = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
  };
  await chrome.storage.local.set({
    xaiCredentials: structured,
    // Legacy flat keys for compatibility
    xaiKey: structured.access_token,
    xaiRefresh: structured.refresh_token,
    xaiExpiry: structured.expires_at,
  });
  return token.access_token;
}

export async function getXaiCredentials() {
  const data = await chrome.storage.local.get(['xaiCredentials', 'xaiKey', 'xaiRefresh', 'xaiExpiry']);
  if (data.xaiCredentials && typeof data.xaiCredentials === 'object') {
    return data.xaiCredentials;
  }
  if (data.xaiKey || data.xaiRefresh) {
    const legacy = {
      access_token: data.xaiKey || null,
      refresh_token: data.xaiRefresh || null,
      expires_at: data.xaiExpiry || null,
    };
    if (legacy.access_token || legacy.refresh_token) {
      await storeXaiOAuthTokens({
        access_token: legacy.access_token,
        refresh_token: legacy.refresh_token,
        expires_in: legacy.expires_at ? Math.max(0, Math.floor((legacy.expires_at - Date.now()) / 1000)) : 0,
      }).catch(() => {});
    }
    return legacy;
  }
  return null;
}

// In-flight refresh deduplication (matches Anthropic pattern)
let _xaiRefreshPromise = null;

export async function refreshXaiToken({ force = false } = {}) {
  if (_xaiRefreshPromise && !force) {
    return _xaiRefreshPromise;
  }

  _xaiRefreshPromise = (async () => {
    try {
      const creds = await getXaiCredentials();

      if (!force && creds?.access_token && creds?.expires_at && Date.now() < creds.expires_at - 60_000) {
        return creds.access_token;
      }

      if (!creds?.refresh_token) {
        await chrome.storage.local.remove(['xaiKey', 'xaiRefresh', 'xaiExpiry', 'xaiCredentials']);
        throw new Error('xAI token expired — please reconnect in Settings');
      }

      const res = await fetch(XAI_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: XAI_CLIENT_ID,
          refresh_token: creds.refresh_token,
        }),
      });

      if (!res.ok) {
        await chrome.storage.local.remove(['xaiKey', 'xaiRefresh', 'xaiExpiry', 'xaiCredentials']);
        throw new Error('xAI session expired — please reconnect in Settings');
      }

      const tokens = await res.json();
      await storeXaiOAuthTokens(tokens);
      return tokens.access_token;
    } finally {
      _xaiRefreshPromise = null;
    }
  })();

  return _xaiRefreshPromise;
}
