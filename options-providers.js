// options-providers.js — renders the "More model providers" section from the
// providers.js registry: one card per OpenAI-/Anthropic-compatible vendor, each
// with an independent key, model picker, endpoint override, and self-tests.
// DOM-only; all persistence is chrome.storage.local keyed by the provider id.

import {
  COMPAT_PROVIDERS,
  provKeyName,
  provModelName,
  provBaseName,
  provEnabledName,
  provProtoName,
  provVerName,
  compatStorageKeys,
  isCompatConnected,
} from './providers.js';
import { createPkcePair } from './oauth-pkce.js';
import {
  OPENAI_CREDENTIALS_KEY,
  OPENAI_OAUTH_ERROR_KEY,
  OPENAI_OAUTH_STATE_KEY,
  OPENAI_OAUTH_VERIFIER_KEY,
  buildOpenAIAuthorizeUrl,
  waitForOpenAIOAuthResult,
} from './oauth-openai.js';

const CUSTOM = '__custom__';

// Tiny DOM builder. `text` sets textContent (safe); listeners via on<Event>.
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids))
    if (kid != null) n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  return n;
}

const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);
const remove = (keys) => chrome.storage.local.remove(keys);

// A user-supplied endpoint may target any host; request that origin so MV3 lets us
// fetch it. Built-in vendor hosts are already declared, so this is a no-op for them.
// Must run from a user gesture (the Save click qualifies).
async function requestOrigin(url) {
  try {
    const origin = new URL(url).origin + '/*';
    await chrome.permissions.request({ origins: [origin] });
  } catch {
    /* invalid URL or already granted — the self-test will surface real failures */
  }
}

/** Provider-routing groups for the per-part picker (only providers with a model catalog). */
export function compatPartGroups() {
  return COMPAT_PROVIDERS.filter((p) => p.models.length).map((p) => ({
    provider: p.id,
    label: p.label,
    models: p.models,
  }));
}

export async function renderCompatProviders(host) {
  if (!host) return;
  const snapshot = await get([...compatStorageKeys(), OPENAI_CREDENTIALS_KEY]); // creds → "Connected (ChatGPT)" badge
  host.innerHTML = '';
  for (const p of COMPAT_PROVIDERS) host.appendChild(buildCard(p, snapshot));
}

/** True if any registry provider is currently connected (used to dismiss first-run nudges). */
export async function anyCompatConnected() {
  const snapshot = await get(compatStorageKeys());
  return COMPAT_PROVIDERS.some((p) => isCompatConnected(p.id, snapshot));
}

function buildCard(p, snapshot) {
  const card = el('div', { class: 'svc-card', id: `cc-card-${p.id}` });

  const dot = el('div', { class: 'svc-dot', id: `cc-dot-${p.id}` });
  const status = el('div', { class: 'svc-status', id: `cc-status-${p.id}` });
  const tag = el('span', {
    class: 'svc-tag',
    text: p.protocol === 'anthropic' ? 'Anthropic API' : 'OpenAI API',
  });
  const name = el('div', { class: 'svc-name' }, [p.label, tag]);
  const hint = el('div', { class: 'svc-hint', text: p.hint || '' });
  const btn = el('button', { class: 'svc-btn', id: `cc-btn-${p.id}` });
  const row = el('div', { class: 'svc-row' }, [
    el('div', { class: 'svc-left' }, [dot, el('div', {}, [name, status, hint])]),
    btn,
  ]);
  card.appendChild(row);

  // ── connect / key panel ──────────────────────────────────────────────────
  const panel = el('div', { class: 'token-panel', id: `cc-panel-${p.id}` });
  let protoSel, baseInput, keyInput, verInput;
  if (p.protocol === 'azure') {
    baseInput = el('input', { type: 'text', placeholder: 'https://<resource>.openai.azure.com' });
    baseInput.value = snapshot[provBaseName(p.id)] || '';
    verInput = el('input', { type: 'text', placeholder: `api-version (e.g. ${p.defaultApiVersion})` });
    verInput.value = snapshot[provVerName(p.id)] || p.defaultApiVersion || '';
    keyInput = el('input', { type: 'password', placeholder: 'Azure API key' });
    panel.append(
      el('p', {
        class: 'token-instruction',
        text: 'Resource endpoint, API version, and key. Set your deployment name as the Model below.',
      }),
      el('div', { class: 'cc-row' }, [baseInput]),
      el('div', { class: 'cc-row' }, [verInput]),
      el('div', { class: 'token-row' }, [keyInput, el('button', { text: 'Save', onclick: saveAzure })])
    );
  } else if (p.custom) {
    protoSel = el('select', { class: 'model-select' }, [
      el('option', { value: 'openai', text: 'OpenAI-compatible' }),
      el('option', { value: 'anthropic', text: 'Anthropic-compatible' }),
    ]);
    protoSel.value = snapshot[provProtoName(p.id)] === 'anthropic' ? 'anthropic' : 'openai';
    baseInput = el('input', { type: 'text', placeholder: 'https://host/v1  (base URL or full endpoint)' });
    baseInput.value = snapshot[provBaseName(p.id)] || '';
    keyInput = el('input', { type: 'password', placeholder: 'API key (optional for local)' });
    panel.append(
      el('p', { class: 'token-instruction', text: 'Point at any OpenAI- or Anthropic-compatible server.' }),
      el('div', { class: 'cc-row' }, [protoSel]),
      el('div', { class: 'cc-row' }, [baseInput]),
      el('div', { class: 'token-row' }, [keyInput, el('button', { text: 'Save', onclick: saveCustom })])
    );
  } else if (!p.keyless) {
    keyInput = el('input', { type: 'password', placeholder: p.keyHint || 'API key' });
    const docs = p.docsUrl
      ? el('a', {
          class: 'key-toggle',
          text: 'Get a key ↗',
          onclick: () => chrome.tabs.create({ url: p.docsUrl }),
        })
      : null;
    panel.append(
      el('p', {
        class: 'token-instruction',
        text: `Paste your ${p.label} API key. Stored only in this browser.`,
      }),
      el('div', { class: 'token-row' }, [keyInput, el('button', { text: 'Save', onclick: saveKey })]),
      docs
    );
  }
  // ── OpenAI only: "Sign in with ChatGPT" (Codex CLI OAuth), above the key field ──
  let openAiOAuthBtn = null;
  if (p.id === 'openai') {
    openAiOAuthBtn = el('button', { class: 'svc-btn', id: 'cc-openai-oauth', text: 'Sign in with ChatGPT' });
    const note = el('p', {
      class: 'token-instruction',
      text: 'Use your ChatGPT account — the same login the Codex CLI uses. Needs API access on your plan; if it’s not included, paste an API key below instead.',
    });
    panel.prepend(el('div', { class: 'cc-row' }, [openAiOAuthBtn]), note);
    openAiOAuthBtn.addEventListener('click', connectOpenAiOAuth);
  }

  if (panel.childNodes.length) card.appendChild(panel);

  // ── model row ────────────────────────────────────────────────────────────
  const modelRow = el('div', { class: 'model-row', id: `cc-model-row-${p.id}` });
  const modelSel = el('select', { class: 'model-select' });
  for (const m of p.models) {
    modelSel.appendChild(el('option', { value: m.value, text: `${m.recommended ? '★ ' : ''}${m.label}` }));
  }
  modelSel.appendChild(el('option', { value: CUSTOM, text: 'Custom…' }));
  const modelCustom = el('input', { type: 'text', placeholder: 'model id', style: 'display:none' });
  // reflect stored model
  const storedModel = snapshot[provModelName(p.id)] || '';
  if (storedModel && !p.models.some((m) => m.value === storedModel)) {
    modelSel.value = CUSTOM;
    modelCustom.value = storedModel;
    modelCustom.style.display = '';
  } else if (storedModel) {
    modelSel.value = storedModel;
  }
  modelSel.addEventListener('change', () => {
    if (modelSel.value === CUSTOM) {
      modelCustom.style.display = '';
      modelCustom.focus();
      return;
    }
    modelCustom.style.display = 'none';
    set({ [provModelName(p.id)]: modelSel.value });
  });
  modelCustom.addEventListener('change', () => {
    const v = modelCustom.value.trim();
    if (v) set({ [provModelName(p.id)]: v });
  });
  modelRow.append(el('span', { class: 'model-label', text: 'Model' }), modelSel, modelCustom);
  card.appendChild(modelRow);

  // ── advanced: endpoint override (built-ins only; custom + azure set base in their panel) ──
  if (!p.custom && p.protocol !== 'azure') {
    const ovInput = el('input', { type: 'text', placeholder: p.endpoint || 'endpoint URL' });
    ovInput.value = snapshot[provBaseName(p.id)] || '';
    const ovSave = el('button', {
      class: 'cc-test-btn',
      text: 'Save endpoint',
      onclick: async () => {
        const v = ovInput.value.trim();
        if (v) {
          await requestOrigin(v);
          await set({ [provBaseName(p.id)]: v });
        } else await remove(provBaseName(p.id));
      },
    });
    card.appendChild(
      el('details', { class: 'cc-adv' }, [
        el('summary', { text: 'Advanced — override endpoint' }),
        el('div', { class: 'cc-row' }, [ovInput, ovSave]),
      ])
    );
  }

  // ── self-tests ───────────────────────────────────────────────────────────
  const result = el('span', { class: 'cc-test-result' });
  const testConn = el('button', {
    class: 'cc-test-btn',
    text: 'Test connection',
    onclick: () => runTest('connection'),
  });
  const testFn = el('button', {
    class: 'cc-test-btn',
    text: 'Test function',
    onclick: () => runTest('function'),
  });
  card.appendChild(el('div', { class: 'cc-tests' }, [testConn, testFn, result]));

  // ── behaviour ──────────────────────────────────────────────────────────────
  function setState(connected, via) {
    dot.classList.toggle('on', connected);
    status.classList.toggle('on', connected);
    status.textContent = !connected
      ? 'Not connected'
      : via === 'chatgpt'
        ? 'Connected (ChatGPT)'
        : p.keyless
          ? 'Enabled (local)'
          : 'Connected (API key)';
    card.classList.toggle('connected', connected);
    btn.textContent = connected ? (p.keyless ? 'Disable' : 'Disconnect') : p.keyless ? 'Enable' : 'Connect';
    btn.classList.toggle('disconnect', connected);
    modelRow.classList.toggle('visible', connected);
    if (connected) panel.classList.remove('open');
  }

  // "Sign in with ChatGPT" — PKCE authorize in a new tab; background.js intercepts the
  // loopback redirect, exchanges the code, and mints an OpenAI API key into openaiKey.
  async function connectOpenAiOAuth() {
    const restore = () => {
      openAiOAuthBtn.disabled = false;
      openAiOAuthBtn.textContent = 'Sign in with ChatGPT';
    };
    try {
      openAiOAuthBtn.disabled = true;
      openAiOAuthBtn.textContent = 'Signing in…';
      const { verifier, challenge, state } = await createPkcePair();
      await set({ [OPENAI_OAUTH_VERIFIER_KEY]: verifier, [OPENAI_OAUTH_STATE_KEY]: state });
      await remove([OPENAI_OAUTH_ERROR_KEY]);
      chrome.tabs.create({ url: buildOpenAIAuthorizeUrl({ challenge, state }) });
      const oauthRes = await waitForOpenAIOAuthResult();
      await remove([OPENAI_OAUTH_VERIFIER_KEY, OPENAI_OAUTH_STATE_KEY, OPENAI_OAUTH_ERROR_KEY]);
      restore();
      if (oauthRes.error) throw new Error(oauthRes.error);
      result.className = 'cc-test-result ok';
      result.textContent = '✓ Signed in with ChatGPT';
      setState(true, 'chatgpt');
    } catch (e) {
      restore();
      result.className = 'cc-test-result err';
      result.textContent = `✗ ${e?.message || e}`;
    }
  }

  async function isOn() {
    // OpenAI can be connected via ChatGPT OAuth alone (creds set) before any call has
    // minted the shared key slot — treat that as connected so Disconnect always works.
    if (p.id === 'openai') {
      const s = await get([...compatStorageKeys(), OPENAI_CREDENTIALS_KEY]);
      return isCompatConnected(p.id, s) || !!s[OPENAI_CREDENTIALS_KEY]?.refresh_token;
    }
    return isCompatConnected(p.id, await get(compatStorageKeys()));
  }

  btn.addEventListener('click', async () => {
    if (await isOn()) {
      if (p.keyless) await remove(provEnabledName(p.id));
      else if (p.custom || p.protocol === 'azure')
        await remove([provBaseName(p.id), provKeyName(p.id)]); // endpoint marks these connected
      else if (p.id === 'openai')
        await remove([provKeyName(p.id), OPENAI_CREDENTIALS_KEY]); // minted key + ChatGPT session, together
      else await remove(provKeyName(p.id));
      setState(false);
      return;
    }
    if (p.keyless) {
      await set({ [provEnabledName(p.id)]: true });
      setState(true);
      return;
    }
    panel.classList.toggle('open');
  });

  async function saveKey() {
    const key = keyInput.value.trim();
    if (!key) return;
    await set({ [provKeyName(p.id)]: key });
    if (p.id === 'openai') await remove([OPENAI_CREDENTIALS_KEY]); // a pasted key ⇒ leave ChatGPT mode
    keyInput.value = '';
    setState(true);
  }

  async function saveCustom() {
    const base = baseInput.value.trim();
    if (!base) {
      baseInput.focus();
      return;
    }
    await requestOrigin(base); // custom hosts aren't pre-declared — ask for the origin
    const patch = { [provBaseName(p.id)]: base, [provProtoName(p.id)]: protoSel.value };
    const key = keyInput.value.trim();
    if (key) patch[provKeyName(p.id)] = key;
    await set(patch);
    keyInput.value = '';
    setState(isCompatConnected(p.id, await get(compatStorageKeys())));
  }

  async function saveAzure() {
    const base = baseInput.value.trim();
    if (!base) {
      baseInput.focus();
      return;
    }
    await requestOrigin(base); // the resource host isn't pre-declared
    const patch = {
      [provBaseName(p.id)]: base,
      [provVerName(p.id)]: verInput.value.trim() || p.defaultApiVersion,
    };
    const key = keyInput.value.trim();
    if (key) patch[provKeyName(p.id)] = key;
    await set(patch);
    keyInput.value = '';
    setState(isCompatConnected(p.id, await get(compatStorageKeys())));
  }

  async function runTest(kind) {
    result.className = 'cc-test-result';
    result.textContent = 'Testing…';
    testConn.disabled = testFn.disabled = true;
    try {
      const r = await chrome.runtime.sendMessage({ type: 'TEST_PROVIDER', provider: p.id });
      const pass = kind === 'connection' ? r?.connection : r?.function;
      result.classList.add(pass ? 'ok' : 'err');
      if (kind === 'connection')
        result.textContent = pass ? '✓ Endpoint reachable' : `✗ ${r?.detail || 'unreachable'}`;
      else result.textContent = pass ? '✓ Model followed the instruction' : `✗ ${r?.detail || 'no response'}`;
    } catch (e) {
      result.classList.add('err');
      result.textContent = `✗ ${e?.message || e}`;
    } finally {
      testConn.disabled = testFn.disabled = false;
    }
  }

  const initVia =
    p.id === 'openai' && snapshot[OPENAI_CREDENTIALS_KEY]?.refresh_token ? 'chatgpt' : undefined;
  setState(isCompatConnected(p.id, snapshot), initVia);
  return card;
}
