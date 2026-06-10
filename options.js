import { createPkcePair } from './oauth-pkce.js';
import {
  ANTHROPIC_OAUTH_ERROR_KEY,
  ANTHROPIC_OAUTH_STATE_KEY,
  ANTHROPIC_OAUTH_VERIFIER_KEY,
  buildAnthropicAuthorizeUrl,
  waitForAnthropicOAuthResult,
} from './oauth-anthropic.js';
import {
  pollXaiDeviceToken,
  requestXaiDeviceCode,
  storeXaiOAuthTokens,
} from './oauth-xai.js';
import { importFromVelesdb } from './migrate/velesdb-import.js';
import { PARTS, CATALOG } from './models.js';
import { THEMES, initTheme, saveTheme } from './theme.js';
import { TONES, DEFAULT_TONE } from './tone.js';
import { listCached, removeCached, openCachedAnalysis } from './cache.js';

// ─── Core settings ───────────────────────────────────────────────────────────

const autoSaveInput = document.getElementById('autoSave');
const saveBtn       = document.getElementById('save');
const statusEl      = document.getElementById('status');

const orModelSel    = document.getElementById('openrouterModel');
const orCustomPanel = document.getElementById('custom-openrouter');
const orCustomInput = document.getElementById('openrouterModelCustom');

function syncOpenrouterCustom() {
  orCustomPanel.classList.toggle('open', orModelSel.value === '__custom__');
}

const nousModelSel   = document.getElementById('nousModel');
const nousCustomPanel = document.getElementById('custom-nous');
const nousCustomInput = document.getElementById('nousModelCustom');

function syncNousCustom() {
  nousCustomPanel.classList.toggle('open', nousModelSel.value === '__custom__');
}

chrome.storage.local.get(['autoSave'], ({ autoSave }) => {
  autoSaveInput.checked = autoSave !== false;
});

// ─── History (cached analyses) ───────────────────────────────────────────────
const historySearch = document.getElementById('historySearch');
const escH = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let historyItems = [];

async function loadHistory() {
  historyItems = await listCached();
  renderHistory();
}

function renderHistory() {
  const host = document.getElementById('history-list');
  if (!host) return;
  const q = (historySearch?.value || '').toLowerCase();
  const items = historyItems.filter(it => !q || (it.repoId || '').toLowerCase().includes(q));
  if (!items.length) {
    host.innerHTML = `<div class="hist-empty">${historyItems.length ? 'No matches.' : "Nothing analyzed yet — scan a repo and it'll show up here."}</div>`;
    return;
  }
  host.innerHTML = '';
  for (const it of items) {
    const date = it.cachedAt ? new Date(it.cachedAt).toLocaleDateString() : '';
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = `<button class="hist-open">${escH(it.repoId)}</button><span class="hist-meta">${escH(it.platform || '')} · ${escH(date)}</span><button class="hist-del" title="Remove from history">×</button>`;
    row.querySelector('.hist-open').addEventListener('click', () => openCachedAnalysis(it));
    row.querySelector('.hist-del').addEventListener('click', async () => { await removeCached(it.platform, it.repoId); loadHistory(); });
    host.appendChild(row);
  }
}

historySearch?.addEventListener('input', renderHistory);
loadHistory();

// ─── Library link ────────────────────────────────────────────────────────────
document.getElementById('open-library-link')
  ?.addEventListener('click', () => openTab(chrome.runtime.getURL('library.html')));

// ─── Delay between AI calls (paces bursts; read live by background.js) ────────
const aiGap = document.getElementById('aiGap');
const aiGapLabel = document.getElementById('aiGapLabel');
const fmtGap = (ms) => (ms <= 0 ? 'Off' : (ms / 1000).toFixed(1) + 's');
chrome.storage.local.get('aiGapMs', ({ aiGapMs }) => {
  const v = Number.isFinite(aiGapMs) ? aiGapMs : 1200;
  aiGap.value = v;
  aiGapLabel.textContent = fmtGap(v);
});
aiGap.addEventListener('input', () => {
  const v = Number(aiGap.value);
  aiGapLabel.textContent = fmtGap(v);
  chrome.storage.local.set({ aiGapMs: v });
});

// ─── Skills ──────────────────────────────────────────────────────────────────
const sktpgInput = document.getElementById('sktpgEnabled');
chrome.storage.local.get('sktpgEnabled', ({ sktpgEnabled }) => {
  sktpgInput.checked = sktpgEnabled !== false; // default ON for first run
});
sktpgInput.addEventListener('change', () => {
  chrome.storage.local.set({ sktpgEnabled: sktpgInput.checked });
});

// ─── Voice / tone ────────────────────────────────────────────────────────────
chrome.storage.local.get('tone', ({ tone }) => renderTonePicker(tone || DEFAULT_TONE));

function renderTonePicker(current) {
  const host = document.getElementById('tone-picker');
  if (!host) return;
  host.innerHTML = '';
  for (const t of TONES) {
    const chip = document.createElement('div');
    chip.className = 'tone-chip' + (t.key === current ? ' active' : '');
    chip.innerHTML = `${t.label}<span class="tone-blurb">${t.blurb}</span>`;
    chip.addEventListener('click', () => {
      chrome.storage.local.set({ tone: t.key });
      host.querySelectorAll('.tone-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
    host.appendChild(chip);
  }
}

// ─── Theme ─────────────────────────────────────────────────────────────────
initTheme().then(renderThemePicker);

function renderThemePicker() {
  const host = document.getElementById('theme-picker');
  if (!host) return;
  const current = document.documentElement.getAttribute('data-theme') || 'midnight';
  host.innerHTML = '';
  for (const t of THEMES) {
    const chip = document.createElement('div');
    chip.className = 'theme-chip' + (t.key === current ? ' active' : '');
    chip.innerHTML = `<span class="dot" style="background:${t.swatch}"></span>${t.label}`;
    chip.addEventListener('click', async () => {
      await saveTheme(t.key);
      host.querySelectorAll('.theme-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
    host.appendChild(chip);
  }
}

saveBtn.addEventListener('click', () => {
  const autoSave = autoSaveInput.checked;
  chrome.storage.local.set({ autoSave }, () => showStatus('✓ Saved', '#4ade80'));
});

// One-time import: pull a running VelesDB's saved repos into the built-in store.
const importBtn = document.getElementById('importBtn');
const importUrlInput = document.getElementById('importUrl');
const importStatus = document.getElementById('importStatus');
if (importBtn) {
  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true;
    importStatus.style.color = 'var(--text-sub)';
    importStatus.textContent = 'Connecting to VelesDB…';
    try {
      const { imported, failed, total } = await importFromVelesdb(importUrlInput.value, ({ imported, total }) => {
        importStatus.textContent = `Importing… ${imported}/${total}`;
      });
      importStatus.style.color = '#4ade80';
      importStatus.textContent =
        total === 0
          ? 'No repos found at that VelesDB.'
          : `✓ Imported ${imported} repo${imported === 1 ? '' : 's'}${failed ? ` (${failed} failed)` : ''}.`;
    } catch (err) {
      importStatus.style.color = '#f87171';
      importStatus.textContent = `✗ ${err.message || 'Could not reach VelesDB'}`;
    } finally {
      importBtn.disabled = false;
    }
  });
}

// ─── Models per scan part ──────────────────────────────────────────────────────
const partModelsHost = document.getElementById('part-models');

function buildPartSelect(part, current) {
  const sel = document.createElement('select');
  sel.className = 'model-select';
  sel.dataset.part = part.id;
  sel.style.width = '100%';

  const def = document.createElement('option');
  def.value = 'default';
  def.textContent = 'Default (smart fallback)';
  sel.appendChild(def);

  for (const [provider, { label, models }] of Object.entries(CATALOG)) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = `${provider}:${m.value}`;
      opt.textContent = `${m.recommended ? '★ ' : ''}${m.label}`;
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }

  sel.value = current && current !== 'default' ? current : 'default';
  if (!sel.value) sel.value = 'default'; // current pointed at a model no longer in the catalog
  return sel;
}

async function renderPartModels() {
  if (!partModelsHost) return;
  const { partRouting = {} } = await chrome.storage.local.get('partRouting');
  partModelsHost.innerHTML = '';
  for (const part of PARTS) {
    const label = document.createElement('label');
    label.textContent = part.label;
    label.style.cssText = 'display:block;margin:14px 0 6px';

    const sel = buildPartSelect(part, partRouting[part.id]);
    sel.addEventListener('change', async () => {
      const { partRouting: cur = {} } = await chrome.storage.local.get('partRouting');
      const next = { ...cur };
      if (sel.value === 'default') delete next[part.id];
      else next[part.id] = sel.value;
      await chrome.storage.local.set({ partRouting: next });
      showStatus(`✓ ${part.label} → ${sel.options[sel.selectedIndex].textContent}`, '#4ade80');
    });

    partModelsHost.appendChild(label);
    partModelsHost.appendChild(sel);
  }
}
renderPartModels();

function showStatus(msg, color) {
  statusEl.textContent    = msg;
  statusEl.style.color    = color;
  statusEl.style.display  = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 2200);
}

function openTab(url) { chrome.tabs.create({ url }); }

// ─── Service card helpers ─────────────────────────────────────────────────────

function authMethodLabel(method) {
  if (method === 'oauth') return 'Connected (OAuth)';
  if (method === 'apikey') return 'Connected (API key)';
  return 'Connected';
}

function setButtonBusy(btn, busy, busyLabel = 'Connecting…') {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) {
    btn.dataset.prevLabel = btn.textContent;
    btn.textContent = busyLabel;
  } else if (btn.dataset.prevLabel) {
    btn.textContent = btn.dataset.prevLabel;
    delete btn.dataset.prevLabel;
  }
}

function setConnected(service, key, { method } = {}) {
  const dot    = document.getElementById(`dot-${service}`);
  const status = document.getElementById(`status-${service}`);
  const btn    = document.getElementById(`btn-${service}`);
  const card   = document.getElementById(`card-${service}`);
  const panel  = document.getElementById(`panel-${service}`);
  const modelRow = document.getElementById(`model-row-${service}`);
  const toggle   = document.getElementById(`toggle-${service}`);

  setButtonBusy(btn, false);

  if (key) {
    dot.classList.add('on');
    status.textContent = authMethodLabel(method);
    status.classList.add('on');
    btn.textContent = 'Disconnect';
    btn.classList.add('disconnect');
    card.classList.add('connected');
    panel?.classList.remove('open');
    modelRow?.classList.add('visible');
    if (toggle) toggle.style.display = 'none';
  } else {
    dot.classList.remove('on');
    status.textContent = 'Not connected';
    status.classList.remove('on');
    btn.textContent = 'Connect';
    btn.classList.remove('disconnect');
    card.classList.remove('connected');
    modelRow?.classList.remove('visible');
    if (toggle) toggle.style.display = '';
  }
}

chrome.storage.local.get(
  ['anthropicKey', 'anthropicRefresh', 'anthropicCredentials', 'anthropicModel', 'googleKey', 'googleModel', 'openrouterKey', 'openrouterModel', 'xaiKey', 'xaiRefresh', 'xaiCredentials', 'xaiModel', 'nousKey', 'nousModel'],
  (s) => {
    // Detect OAuth using both legacy flat keys and the new Hermes-hardened structured storage
    const hasAnthropicOAuth = s.anthropicRefresh ||
      (s.anthropicCredentials && s.anthropicCredentials.refresh_token);
    setConnected('anthropic', s.anthropicKey, { method: hasAnthropicOAuth ? 'oauth' : 'apikey' });
    setConnected('google', s.googleKey, { method: 'apikey' });
    setConnected('openrouter', s.openrouterKey, { method: 'oauth' });
    setConnected('xai', s.xaiKey || s.xaiRefresh, { method: s.xaiRefresh || (s.xaiCredentials && s.xaiCredentials.refresh_token) ? 'oauth' : 'apikey' });
    setConnected('nous', s.nousKey, { method: 'apikey' });

    // First run: walk the user in until any provider is connected.
    const anyProvider = !!(s.anthropicKey || s.googleKey || s.openrouterKey || s.xaiKey || s.xaiRefresh || s.nousKey);
    const gettingStarted = document.getElementById('getting-started');
    if (gettingStarted) gettingStarted.style.display = anyProvider ? 'none' : '';

    if (s.anthropicModel) document.getElementById('anthropicModel').value = s.anthropicModel;
    if (s.googleModel) document.getElementById('googleModel').value = s.googleModel;
    if (s.xaiModel) document.getElementById('xaiModel').value = s.xaiModel;

    if (s.openrouterModel) {
      const known = [...orModelSel.options].some(o => o.value === s.openrouterModel);
      if (known) {
        orModelSel.value = s.openrouterModel;
      } else {
        orModelSel.value = '__custom__';
        orCustomInput.value = s.openrouterModel;
      }
    }
    syncOpenrouterCustom();

    // Heal the legacy bare slug that an earlier build saved — the API wants the
    // OpenRouter-catalog id for Step 3.7.
    if (s.nousModel === 'Step-3.7-Flash' || s.nousModel === 'step-3.7-flash') {
      s.nousModel = 'stepfun/step-3.7-flash';
      chrome.storage.local.set({ nousModel: s.nousModel });
    }
    if (s.nousModel) {
      const known = [...nousModelSel.options].some(o => o.value === s.nousModel);
      if (known) {
        nousModelSel.value = s.nousModel;
      } else {
        nousModelSel.value = '__custom__';
        nousCustomInput.value = s.nousModel;
      }
    }
    syncNousCustom();
  }
);

document.getElementById('anthropicModel').addEventListener('change', (e) => {
  chrome.storage.local.set({ anthropicModel: e.target.value });
});

document.getElementById('googleModel').addEventListener('change', (e) => {
  chrome.storage.local.set({ googleModel: e.target.value });
});

document.getElementById('xaiModel').addEventListener('change', (e) => {
  chrome.storage.local.set({ xaiModel: e.target.value });
});

// ─── OpenRouter model selector ───────────────────────────────────────────────

orModelSel.addEventListener('change', () => {
  syncOpenrouterCustom();
  if (orModelSel.value !== '__custom__') {
    chrome.storage.local.set({ openrouterModel: orModelSel.value });
  }
});

document.getElementById('save-openrouter-model').addEventListener('click', () => {
  const v = orCustomInput.value.trim();
  if (!v) return;
  chrome.storage.local.set({ openrouterModel: v }, () => showStatus('✓ Model set: ' + v, '#4ade80'));
});

document.getElementById('link-openrouter')
  ?.addEventListener('click', () => openTab('https://openrouter.ai/models'));

// ─── Nous Research — model selector + API key ────────────────────────────────

nousModelSel.addEventListener('change', () => {
  syncNousCustom();
  if (nousModelSel.value !== '__custom__') {
    chrome.storage.local.set({ nousModel: nousModelSel.value });
  }
});

document.getElementById('save-nous-model').addEventListener('click', () => {
  const v = nousCustomInput.value.trim();
  if (!v) return;
  chrome.storage.local.set({ nousModel: v }, () => showStatus('✓ Model set: ' + v, '#4ade80'));
});

document.getElementById('link-nous-models')
  ?.addEventListener('click', () => openTab('https://portal.nousresearch.com'));

document.getElementById('btn-nous').addEventListener('click', () => {
  chrome.storage.local.get('nousKey', ({ nousKey }) => {
    if (nousKey) {
      chrome.storage.local.remove('nousKey', () => setConnected('nous', null));
      return;
    }
    document.getElementById('panel-nous').classList.toggle('open');
  });
});

document.getElementById('link-nous')
  ?.addEventListener('click', () => openTab('https://portal.nousresearch.com'));

document.getElementById('save-nous').addEventListener('click', () => {
  const key = document.getElementById('nousKey').value.trim();
  if (!key) return;
  chrome.storage.local.set({ nousKey: key }, () => {
    document.getElementById('nousKey').value = '';
    setConnected('nous', key, { method: 'apikey' });
  });
});

// ─── xAI Grok — Device Code OAuth (SuperGrok subscription) ─────────────────

document.getElementById('btn-xai').addEventListener('click', async () => {
  const btn = document.getElementById('btn-xai');
  const { xaiKey, xaiRefresh } = await chrome.storage.local.get(['xaiKey', 'xaiRefresh']);
  if (xaiKey || xaiRefresh) {
    chrome.storage.local.remove(['xaiKey', 'xaiRefresh', 'xaiExpiry', 'xaiCredentials'], () => setConnected('xai', null));
    return;
  }

  try {
    setButtonBusy(btn, true);

    const dc = await requestXaiDeviceCode();
    const panel = document.getElementById('panel-xai-device');
    panel.classList.add('open');
    panel.innerHTML = `
      <p class="token-instruction" style="margin-bottom:12px">
        Go to <a id="xai-verify-link" style="color:#818cf8;cursor:pointer;text-decoration:underline">${dc.verification_uri}</a>
        and enter this code:
      </p>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <code style="background:#1a1a2e;padding:10px 16px;border-radius:6px;font-size:18px;font-weight:700;color:#818cf8;letter-spacing:2px;user-select:all">${dc.user_code}</code>
        <button id="xai-copy-code" class="svc-btn" style="font-size:11px">Copy</button>
      </div>
      <p style="font-size:11px;color:#475569">Waiting for you to authorize… expires in ${Math.floor(dc.expires_in / 60)} min</p>
      <div id="xai-poll-status" style="font-size:11px;color:#818cf8;margin-top:8px">● Polling…</div>
    `;

    const verifyUrl = dc.verification_uri_complete || dc.verification_uri;
    document.getElementById('xai-verify-link').addEventListener('click', () => chrome.tabs.create({ url: verifyUrl }));
    chrome.tabs.create({ url: verifyUrl });

    document.getElementById('xai-copy-code').addEventListener('click', () => {
      navigator.clipboard.writeText(dc.user_code);
      document.getElementById('xai-copy-code').textContent = 'Copied!';
    });

    const pollStatus = document.getElementById('xai-poll-status');
    const token = await pollXaiDeviceToken(dc.device_code, {
      intervalSec: dc.interval || 5,
      expiresInSec: dc.expires_in,
      onPending: () => { pollStatus.textContent = '● Still waiting…'; },
    });

    const accessToken = await storeXaiOAuthTokens(token);
    panel.innerHTML = '<p class="token-instruction" style="color:#4ade80">✓ Connected to Grok via SuperGrok</p>';
    setConnected('xai', accessToken, { method: 'oauth' });
  } catch (err) {
    setButtonBusy(btn, false);
    showStatus('✗ xAI: ' + err.message, '#f87171');
  }
});

document.getElementById('toggle-xai')
  ?.addEventListener('click', () => document.getElementById('panel-xai').classList.toggle('open'));

document.getElementById('link-xai')
  ?.addEventListener('click', () => openTab('https://console.x.ai'));

document.getElementById('save-xai')?.addEventListener('click', () => {
  const key = document.getElementById('xaiKey').value.trim();
  if (!key) return;
  chrome.storage.local.set({ xaiKey: key }, () => {
    chrome.storage.local.remove(['xaiRefresh', 'xaiExpiry', 'xaiCredentials'], () => {
      document.getElementById('xaiKey').value = '';
      setConnected('xai', key, { method: 'apikey' });
    });
  });
});

// ─── Google AI — API key panel ────────────────────────────────────────────────

document.getElementById('btn-google').addEventListener('click', () => {
  chrome.storage.local.get('googleKey', ({ googleKey }) => {
    if (googleKey) {
      chrome.storage.local.remove('googleKey', () => setConnected('google', null));
      return;
    }
    document.getElementById('panel-google').classList.toggle('open');
  });
});

document.getElementById('link-aistudio')
  ?.addEventListener('click', () => openTab('https://aistudio.google.com/app/apikey'));

document.getElementById('save-google').addEventListener('click', () => {
  const key = document.getElementById('googleKey').value.trim();
  if (!key) return;
  chrome.storage.local.set({ googleKey: key }, () => {
    document.getElementById('googleKey').value = '';
    setConnected('google', key, { method: 'apikey' });
  });
});

// ─── Anthropic — OAuth via PKCE + webNavigation callback ─────────────────────

document.getElementById('btn-anthropic').addEventListener('click', async () => {
  const btn = document.getElementById('btn-anthropic');
  const { anthropicKey } = await chrome.storage.local.get('anthropicKey');
  if (anthropicKey) {
    // Clear both structured (Hermes-hardened) and legacy flat keys
    chrome.storage.local.remove(
      ['anthropicKey', 'anthropicRefresh', 'anthropicExpiry', 'anthropicCredentials'],
      () => setConnected('anthropic', null)
    );
    return;
  }

  try {
    setButtonBusy(btn, true);

    const { verifier, challenge, state } = await createPkcePair();
    await chrome.storage.local.set({
      [ANTHROPIC_OAUTH_VERIFIER_KEY]: verifier,
      [ANTHROPIC_OAUTH_STATE_KEY]: state,
    });
    await chrome.storage.local.remove([ANTHROPIC_OAUTH_ERROR_KEY]);

    chrome.tabs.create({ url: buildAnthropicAuthorizeUrl({ challenge, state }) });

    const result = await waitForAnthropicOAuthResult();
    await chrome.storage.local.remove([
      ANTHROPIC_OAUTH_VERIFIER_KEY,
      ANTHROPIC_OAUTH_STATE_KEY,
      ANTHROPIC_OAUTH_ERROR_KEY,
    ]);

    if (result.error) throw new Error(result.error);
    setConnected('anthropic', result.key, { method: 'oauth' });
  } catch (err) {
    setButtonBusy(btn, false);
    showStatus('✗ Anthropic: ' + err.message, '#f87171');
  }
});

document.getElementById('toggle-anthropic')
  ?.addEventListener('click', () => document.getElementById('panel-anthropic').classList.toggle('open'));

document.getElementById('link-anthropic')
  ?.addEventListener('click', () => openTab('https://console.anthropic.com/settings/keys'));

document.getElementById('save-anthropic')?.addEventListener('click', () => {
  const key = document.getElementById('anthropicApiKey').value.trim();
  if (!key) return;
  chrome.storage.local.set({ anthropicKey: key }, () => {
    chrome.storage.local.remove(['anthropicRefresh', 'anthropicExpiry', 'anthropicCredentials'], () => {
      document.getElementById('anthropicApiKey').value = '';
      setConnected('anthropic', key, { method: 'apikey' });
    });
  });
});

// ─── OpenRouter — OAuth via chrome.identity ──────────────────────────────────

document.getElementById('btn-openrouter').addEventListener('click', async () => {
  const btn = document.getElementById('btn-openrouter');
  const { openrouterKey } = await chrome.storage.local.get('openrouterKey');
  if (openrouterKey) {
    chrome.storage.local.remove('openrouterKey', () => setConnected('openrouter', null));
    return;
  }

  try {
    setButtonBusy(btn, true);

    const { verifier, challenge } = await createPkcePair();
    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(redirectUrl)}` +
      `&code_challenge=${challenge}&code_challenge_method=S256`;

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (url) => {
        if (chrome.runtime.lastError || !url) {
          reject(new Error(chrome.runtime.lastError?.message || 'Authorization cancelled'));
        } else {
          resolve(url);
        }
      });
    });

    const code = new URL(responseUrl).searchParams.get('code');
    if (!code) throw new Error('No authorization code returned');

    const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || err.error || `Token exchange failed (${res.status})`);
    }
    const { key } = await res.json();
    if (!key) throw new Error('OpenRouter returned no key');

    chrome.storage.local.set({ openrouterKey: key }, () => setConnected('openrouter', key, { method: 'oauth' }));
  } catch (err) {
    setButtonBusy(btn, false);
    showStatus('✗ OpenRouter: ' + err.message, '#f87171');
  }
});
