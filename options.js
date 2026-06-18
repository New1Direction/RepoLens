import { createPkcePair } from './oauth-pkce.js';
import {
  ANTHROPIC_ACCESS_KEY,
  ANTHROPIC_EXPIRY_KEY,
  ANTHROPIC_OAUTH_VERIFIER_KEY,
  ANTHROPIC_REFRESH_KEY,
  buildAnthropicAuthorizeUrl,
  clearAnthropicOAuthTokens,
  createAnthropicPkcePair,
  exchangeAnthropicCode,
  saveAnthropicOAuthTokens,
} from './oauth-anthropic.js';
import { pollXaiDeviceToken, requestXaiDeviceCode, storeXaiOAuthTokens } from './oauth-xai.js';
import { importFromVelesdb } from './migrate/velesdb-import.js';
import { SAFE_SETTING_KEYS, buildSettingsBackup, validateSettingsBackup } from './settings-backup.js';
import { PARTS, CATALOG, canonicalModel } from './models.js';
import { renderCompatProviders, compatPartGroups, anyCompatConnected } from './options-providers.js';
import { THEMES, initTheme, saveTheme } from './theme.js';
import { TONES, DEFAULT_TONE } from './tone.js';
import { listCached, removeCached, openCachedAnalysis } from './cache.js';

// ─── Core settings ───────────────────────────────────────────────────────────

const autoSaveInput = document.getElementById('autoSave');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

const CUSTOM = '__custom__';

const orModelSel = document.getElementById('openrouterModel');
const orCustomPanel = document.getElementById('custom-openrouter');
const orCustomInput = document.getElementById('openrouterModelCustom');

function syncOpenrouterCustom() {
  orCustomPanel.classList.toggle('open', orModelSel.value === CUSTOM);
}

const googleModelSel = document.getElementById('googleModel');
const googleCustomPanel = document.getElementById('custom-google');
const googleCustomInput = document.getElementById('googleModelCustom');

function syncGoogleCustom() {
  googleCustomPanel?.classList.toggle('open', googleModelSel.value === CUSTOM);
}

const nousModelSel = document.getElementById('nousModel');
const nousCustomPanel = document.getElementById('custom-nous');
const nousCustomInput = document.getElementById('nousModelCustom');

function syncNousCustom() {
  nousCustomPanel.classList.toggle('open', nousModelSel.value === CUSTOM);
}

chrome.storage.local.get(['autoSave'], ({ autoSave }) => {
  autoSaveInput.checked = autoSave !== false;
});

// ─── History (cached analyses) ───────────────────────────────────────────────
const historySearch = document.getElementById('historySearch');
const escH = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let historyItems = [];

async function loadHistory() {
  historyItems = await listCached();
  renderHistory();
}

function renderHistory() {
  const host = document.getElementById('history-list');
  if (!host) return;
  const q = (historySearch?.value || '').toLowerCase();
  const items = historyItems.filter((it) => !q || (it.repoId || '').toLowerCase().includes(q));
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
    row.querySelector('.hist-del').addEventListener('click', async () => {
      await removeCached(it.platform, it.repoId);
      loadHistory();
    });
    host.appendChild(row);
  }
}

historySearch?.addEventListener('input', renderHistory);
loadHistory();

// ─── Library link ────────────────────────────────────────────────────────────
document
  .getElementById('open-library-link')
  ?.addEventListener('click', () => openTab(chrome.runtime.getURL('library.html')));

// ─── Replay onboarding ────────────────────────────────────────────────────────
// Reset the onboarding flags and open the Library, where the first-run tour fires.
document.getElementById('replayOnboardingBtn')?.addEventListener('click', async () => {
  await chrome.storage.local.set({
    onboardingSeen: false,
    milestoneTourSeen: false,
    milestoneSnoozeAt10: false,
  });
  openTab(chrome.runtime.getURL('library.html'));
});

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

// ─── Interface: the "Vee" mascot toggle (default ON) ─────────────────────────
const mascotInput = document.getElementById('mascotEnabled');
chrome.storage.local.get('mascotEnabled', ({ mascotEnabled }) => {
  mascotInput.checked = mascotEnabled !== false;
});
mascotInput.addEventListener('change', () => {
  chrome.storage.local.set({ mascotEnabled: mascotInput.checked });
});

const animateIconInput = document.getElementById('animateIcon');
chrome.storage.local.get('animateIcon', ({ animateIcon }) => {
  animateIconInput.checked = animateIcon !== false; // default ON
});
animateIconInput.addEventListener('change', () => {
  chrome.storage.local.set({ animateIcon: animateIconInput.checked });
});

// Persist the user's OS reduced-motion preference so the service worker (which has
// no DOM / matchMedia) can honor it before animating the toolbar icon.
chrome.storage.local.set({
  reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
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
      host.querySelectorAll('.tone-chip').forEach((c) => c.classList.remove('active'));
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
      host.querySelectorAll('.theme-chip').forEach((c) => c.classList.remove('active'));
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
      const { imported, failed, total } = await importFromVelesdb(
        importUrlInput.value,
        ({ imported, total }) => {
          importStatus.textContent = `Importing… ${imported}/${total}`;
        }
      );
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

// ─── Settings backup (allowlisted keys only — never API keys / tokens) ─────────
const settingsExportBtn = document.getElementById('settingsExportBtn');
const settingsImportBtn = document.getElementById('settingsImportBtn');
const settingsFile = document.getElementById('settingsFile');
const settingsBackupStatus = document.getElementById('settingsBackupStatus');

function setSettingsStatus(msg, color) {
  if (!settingsBackupStatus) return;
  settingsBackupStatus.style.color = color || 'var(--text-sub)';
  settingsBackupStatus.textContent = msg || '';
}

settingsExportBtn?.addEventListener('click', async () => {
  try {
    const snapshot = await chrome.storage.local.get(SAFE_SETTING_KEYS);
    const backup = buildSettingsBackup(snapshot);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repolens-settings-${backup.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSettingsStatus('✓ Settings exported (API keys excluded).', '#4ade80');
  } catch (err) {
    setSettingsStatus(`✗ ${err?.message || 'Export failed'}`, '#f87171');
  }
});

settingsImportBtn?.addEventListener('click', () => settingsFile?.click());

settingsFile?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    setSettingsStatus('✗ That file is too large.', '#f87171');
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    setSettingsStatus('✗ That file isn’t valid JSON.', '#f87171');
    return;
  }
  const { ok, errors, value } = validateSettingsBackup(parsed);
  if (!ok) {
    setSettingsStatus(`✗ ${errors[0]}`, '#f87171');
    return;
  }
  if (!Object.keys(value).length) {
    setSettingsStatus('Nothing importable in that file.', 'var(--text-sub)');
    return;
  }
  await chrome.storage.local.set(value);
  setSettingsStatus('✓ Settings imported. Reloading…', '#4ade80');
  setTimeout(() => location.reload(), 700);
});

// ─── Models per scan part ──────────────────────────────────────────────────────
const partModelsHost = document.getElementById('part-models');
const liveCatalog = {};

const LIVE_MODEL_SOURCES = {
  google: {
    endpoint: (stored) =>
      stored.googleKey
        ? `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(stored.googleKey)}`
        : '',
    select: () => googleModelSel,
    customInput: () => googleCustomInput,
    storageKey: 'googleModel',
  },
  nous: {
    endpoint: 'https://inference-api.nousresearch.com/v1/models',
    select: () => nousModelSel,
    customInput: () => nousCustomInput,
    storageKey: 'nousModel',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/models',
    select: () => orModelSel,
    customInput: () => orCustomInput,
    storageKey: 'openrouterModel',
  },
};

function normalizeLiveModel(provider, raw) {
  let value = String(raw?.id || raw?.name || '').trim();
  if (provider === 'google') {
    if (
      !Array.isArray(raw?.supportedGenerationMethods) ||
      !raw.supportedGenerationMethods.includes('generateContent')
    ) {
      return null;
    }
    value = value.replace(/^models\//, '');
  }
  if (!value) return null;

  // RepoLens sends text prompts and expects text back. Hide embedding/audio/image-only
  // entries, but keep multimodal models that can still return text.
  const inMods = raw?.architecture?.input_modalities;
  const outMods = raw?.architecture?.output_modalities;
  if (Array.isArray(inMods) && inMods.length && !inMods.includes('text')) return null;
  if (Array.isArray(outMods) && outMods.length && !outMods.includes('text')) return null;

  const aliases = [raw?.canonical_slug, raw?.name, ...(Array.isArray(raw?.aliases) ? raw.aliases : [])]
    .filter(Boolean)
    .map((x) => String(x).replace(/^models\//, ''));
  const rec = CATALOG[provider]?.models.find((m) => m.recommended)?.value;
  const canonicalRec = canonicalModel(provider, rec);
  return {
    value,
    label: String(raw?.displayName || raw?.name || value)
      .replace(/^models\//, '')
      .trim(),
    aliases,
    recommended: value === canonicalRec || aliases.includes(rec) || aliases.includes(canonicalRec),
  };
}

function liveOptionText(model) {
  const id = model.value && model.label !== model.value ? ` — ${model.value}` : '';
  return `${model.label}${id}${model.recommended ? ' — ★ Recommended' : ''}`;
}

function applyLiveModelList(provider, models, storedModel) {
  const cfg = LIVE_MODEL_SOURCES[provider];
  const sel = cfg.select();
  const customInput = cfg.customInput();
  const hasStoredModel = !!storedModel;
  const previous = storedModel || (sel.value === CUSTOM ? customInput.value.trim() : sel.value) || '';
  const canonicalPrevious = canonicalModel(provider, previous);
  const match = models.find(
    (m) =>
      m.value === canonicalPrevious || m.aliases.includes(previous) || m.aliases.includes(canonicalPrevious)
  );

  sel.textContent = '';
  for (const model of models) {
    const opt = document.createElement('option');
    opt.value = model.value;
    opt.textContent = liveOptionText(model);
    sel.appendChild(opt);
  }
  const custom = document.createElement('option');
  custom.value = CUSTOM;
  custom.textContent = 'Custom…';
  sel.appendChild(custom);

  if (match) {
    sel.value = match.value;
    customInput.value = '';
    if (previous && previous !== match.value) chrome.storage.local.set({ [cfg.storageKey]: match.value });
  } else if (hasStoredModel && previous && previous !== CUSTOM) {
    sel.value = CUSTOM;
    customInput.value = previous;
  } else {
    sel.value = models.find((m) => m.recommended)?.value || models[0]?.value || CUSTOM;
    customInput.value = '';
  }

  if (provider === 'google') syncGoogleCustom();
  if (provider === 'openrouter') syncOpenrouterCustom();
  if (provider === 'nous') syncNousCustom();
}

async function loadLiveModelCatalog(provider, stored = {}) {
  const cfg = LIVE_MODEL_SOURCES[provider];
  const endpoint = typeof cfg.endpoint === 'function' ? cfg.endpoint(stored) : cfg.endpoint;
  if (!endpoint) return [];
  const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${provider} models ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
  const seen = new Set();
  const models = rows
    .map((row) => normalizeLiveModel(provider, row))
    .filter((model) => model && !seen.has(model.value) && seen.add(model.value));
  if (!models.length) throw new Error(`${provider} returned no text models`);
  liveCatalog[provider] = models;
  return models;
}

async function loadLiveModelCatalogs() {
  const stored = await chrome.storage.local.get([
    'googleKey',
    ...Object.values(LIVE_MODEL_SOURCES).map((cfg) => cfg.storageKey),
  ]);
  await Promise.all(
    Object.keys(LIVE_MODEL_SOURCES).map(async (provider) => {
      try {
        const models = await loadLiveModelCatalog(provider, stored);
        if (models.length)
          applyLiveModelList(provider, models, stored[LIVE_MODEL_SOURCES[provider].storageKey]);
      } catch (err) {
        console.warn('[RepoLens] live model catalog failed', provider, err);
      }
    })
  );
  renderPartModels();
}

function canonicalPartRouting(value) {
  if (!value || value === 'default') return 'default';
  const i = value.indexOf(':');
  if (i <= 0) return value;
  const provider = value.slice(0, i);
  return `${provider}:${canonicalModel(provider, value.slice(i + 1))}`;
}

function buildPartSelect(part, current) {
  const currentValue = canonicalPartRouting(current);
  const sel = document.createElement('select');
  sel.className = 'model-select';
  sel.dataset.part = part.id;
  sel.style.width = '100%';

  const def = document.createElement('option');
  def.value = 'default';
  def.textContent = 'Default (smart fallback)';
  sel.appendChild(def);

  const groups = [
    ...Object.entries(CATALOG).map(([provider, { label, models }]) => ({
      provider,
      label,
      models: liveCatalog[provider] || models,
    })),
    ...compatPartGroups(), // OpenAI/Anthropic-compatible registry providers
  ];
  for (const { provider, label, models } of groups) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = `${provider}:${m.value}`;
      opt.textContent = liveCatalog[provider] ? liveOptionText(m) : `${m.recommended ? '★ ' : ''}${m.label}`;
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }

  sel.value = currentValue && currentValue !== 'default' ? currentValue : 'default';
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
loadLiveModelCatalogs();

// More providers (OpenAI/Anthropic-compatible registry) + dismiss the first-run
// nudge if one of them is the connected provider.
renderCompatProviders(document.getElementById('compat-providers'));
anyCompatConnected().then((on) => {
  if (on) {
    const gs = document.getElementById('getting-started');
    if (gs) gs.style.display = 'none';
  }
});

function showStatus(msg, color) {
  statusEl.textContent = msg;
  statusEl.style.color = color;
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 2200);
}

function openTab(url) {
  chrome.tabs.create({ url });
}

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
  const dot = document.getElementById(`dot-${service}`);
  const status = document.getElementById(`status-${service}`);
  const btn = document.getElementById(`btn-${service}`);
  const card = document.getElementById(`card-${service}`);
  const panel = document.getElementById(`panel-${service}`);
  const modelRow = document.getElementById(`model-row-${service}`);
  const toggle = document.getElementById(`toggle-${service}`);

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
  [
    'anthropicKey',
    ANTHROPIC_ACCESS_KEY,
    ANTHROPIC_REFRESH_KEY,
    ANTHROPIC_EXPIRY_KEY,
    'anthropicModel',
    'googleKey',
    'googleModel',
    'openrouterKey',
    'openrouterModel',
    'xaiKey',
    'xaiRefresh',
    'xaiCredentials',
    'xaiModel',
    'nousKey',
    'nousModel',
  ],
  (s) => {
    setConnected('anthropic', s.anthropicKey || s[ANTHROPIC_ACCESS_KEY] || s[ANTHROPIC_REFRESH_KEY], {
      method: s.anthropicKey ? 'apikey' : 'oauth',
    });
    setConnected('google', s.googleKey, { method: 'apikey' });
    setConnected('openrouter', s.openrouterKey, { method: 'oauth' });
    setConnected('xai', s.xaiKey || s.xaiRefresh, {
      method: s.xaiRefresh || (s.xaiCredentials && s.xaiCredentials.refresh_token) ? 'oauth' : 'apikey',
    });
    setConnected('nous', s.nousKey, { method: 'apikey' });

    // First run: walk the user in until any provider is connected.
    const anyProvider = !!(
      s.anthropicKey ||
      s[ANTHROPIC_ACCESS_KEY] ||
      s[ANTHROPIC_REFRESH_KEY] ||
      s.googleKey ||
      s.openrouterKey ||
      s.xaiKey ||
      s.xaiRefresh ||
      s.nousKey
    );
    const gettingStarted = document.getElementById('getting-started');
    if (gettingStarted) gettingStarted.style.display = anyProvider ? 'none' : '';

    if (s.anthropicModel) document.getElementById('anthropicModel').value = s.anthropicModel;
    if (s.googleModel) {
      const known = [...googleModelSel.options].some((o) => o.value === s.googleModel);
      if (known) {
        googleModelSel.value = s.googleModel;
      } else {
        googleModelSel.value = CUSTOM;
        googleCustomInput.value = s.googleModel;
      }
    }
    syncGoogleCustom();
    if (s.xaiModel) document.getElementById('xaiModel').value = s.xaiModel;

    if (s.openrouterModel) {
      const canonical = canonicalModel('openrouter', s.openrouterModel);
      if (canonical !== s.openrouterModel) chrome.storage.local.set({ openrouterModel: canonical });
      s.openrouterModel = canonical;
      const known = [...orModelSel.options].some((o) => o.value === s.openrouterModel);
      if (known) {
        orModelSel.value = s.openrouterModel;
      } else {
        orModelSel.value = CUSTOM;
        orCustomInput.value = s.openrouterModel;
      }
    }
    syncOpenrouterCustom();

    if (s.nousModel) {
      const canonical = canonicalModel('nous', s.nousModel);
      if (canonical !== s.nousModel) chrome.storage.local.set({ nousModel: canonical });
      s.nousModel = canonical;
      const known = [...nousModelSel.options].some((o) => o.value === s.nousModel);
      if (known) {
        nousModelSel.value = s.nousModel;
      } else {
        nousModelSel.value = CUSTOM;
        nousCustomInput.value = s.nousModel;
      }
    }
    syncNousCustom();
  }
);

document.getElementById('anthropicModel').addEventListener('change', (e) => {
  chrome.storage.local.set({ anthropicModel: e.target.value });
});

googleModelSel.addEventListener('change', () => {
  syncGoogleCustom();
  if (googleModelSel.value !== CUSTOM) chrome.storage.local.set({ googleModel: googleModelSel.value });
});

document.getElementById('save-google-model')?.addEventListener('click', () => {
  const v = googleCustomInput.value.trim().replace(/^models\//, '');
  if (!v) return;
  chrome.storage.local.set({ googleModel: v }, () => showStatus('✓ Model set: ' + v, '#4ade80'));
});

document.getElementById('xaiModel').addEventListener('change', (e) => {
  chrome.storage.local.set({ xaiModel: e.target.value });
});

// ─── OpenRouter model selector ───────────────────────────────────────────────

orModelSel.addEventListener('change', () => {
  syncOpenrouterCustom();
  if (orModelSel.value !== CUSTOM) {
    chrome.storage.local.set({ openrouterModel: canonicalModel('openrouter', orModelSel.value) });
  }
});

document.getElementById('save-openrouter-model').addEventListener('click', () => {
  const v = canonicalModel('openrouter', orCustomInput.value);
  if (!v) return;
  chrome.storage.local.set({ openrouterModel: v }, () => showStatus('✓ Model set: ' + v, '#4ade80'));
});

document
  .getElementById('link-openrouter')
  ?.addEventListener('click', () => openTab('https://openrouter.ai/models'));

// ─── Nous Research — model selector + API key ────────────────────────────────

nousModelSel.addEventListener('change', () => {
  syncNousCustom();
  if (nousModelSel.value !== CUSTOM) {
    chrome.storage.local.set({ nousModel: canonicalModel('nous', nousModelSel.value) });
  }
});

document.getElementById('save-nous-model').addEventListener('click', () => {
  const v = canonicalModel('nous', nousCustomInput.value);
  if (!v) return;
  chrome.storage.local.set({ nousModel: v }, () => showStatus('✓ Model set: ' + v, '#4ade80'));
});

document
  .getElementById('link-nous-models')
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

document
  .getElementById('link-nous')
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
    chrome.storage.local.remove(['xaiKey', 'xaiRefresh', 'xaiExpiry', 'xaiCredentials'], () =>
      setConnected('xai', null)
    );
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
    document
      .getElementById('xai-verify-link')
      .addEventListener('click', () => chrome.tabs.create({ url: verifyUrl }));
    chrome.tabs.create({ url: verifyUrl });

    document.getElementById('xai-copy-code').addEventListener('click', () => {
      navigator.clipboard.writeText(dc.user_code);
      document.getElementById('xai-copy-code').textContent = 'Copied!';
    });

    const pollStatus = document.getElementById('xai-poll-status');
    const token = await pollXaiDeviceToken(dc.device_code, {
      intervalSec: dc.interval || 5,
      expiresInSec: dc.expires_in,
      onPending: () => {
        pollStatus.textContent = '● Still waiting…';
      },
    });

    const accessToken = await storeXaiOAuthTokens(token);
    panel.innerHTML =
      '<p class="token-instruction" style="color:#4ade80">✓ Connected to Grok via SuperGrok</p>';
    setConnected('xai', accessToken, { method: 'oauth' });
  } catch (err) {
    setButtonBusy(btn, false);
    showStatus('✗ xAI: ' + err.message, '#f87171');
  }
});

document
  .getElementById('toggle-xai')
  ?.addEventListener('click', () => document.getElementById('panel-xai').classList.toggle('open'));

document.getElementById('link-xai')?.addEventListener('click', () => openTab('https://console.x.ai'));

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

document
  .getElementById('link-aistudio')
  ?.addEventListener('click', () => openTab('https://aistudio.google.com/app/apikey'));

document.getElementById('save-google').addEventListener('click', () => {
  const key = document.getElementById('googleKey').value.trim();
  if (!key) return;
  chrome.storage.local.set({ googleKey: key }, () => {
    document.getElementById('googleKey').value = '';
    setConnected('google', key, { method: 'apikey' });
    loadLiveModelCatalogs();
  });
});

// ─── Anthropic — Claude OAuth or Console API key ─────────────────────────────

document.getElementById('btn-anthropic').addEventListener('click', () => {
  chrome.storage.local.get(['anthropicKey', ANTHROPIC_ACCESS_KEY, ANTHROPIC_REFRESH_KEY], async (s) => {
    if (s.anthropicKey || s[ANTHROPIC_ACCESS_KEY] || s[ANTHROPIC_REFRESH_KEY]) {
      await chrome.storage.local.remove(['anthropicKey']);
      await clearAnthropicOAuthTokens();
      setConnected('anthropic', null);
      return;
    }
    document.getElementById('panel-anthropic').classList.toggle('open');
  });
});

document
  .getElementById('toggle-anthropic')
  ?.addEventListener('click', () => document.getElementById('panel-anthropic').classList.toggle('open'));

document
  .getElementById('link-anthropic')
  ?.addEventListener('click', () => openTab('https://console.anthropic.com/settings/keys'));

document.getElementById('anthropic-oauth-start')?.addEventListener('click', async () => {
  const btn = document.getElementById('anthropic-oauth-start');
  try {
    setButtonBusy(btn, true, 'Opening…');
    const { verifier, challenge } = await createAnthropicPkcePair();
    await chrome.storage.local.set({ [ANTHROPIC_OAUTH_VERIFIER_KEY]: verifier });
    openTab(buildAnthropicAuthorizeUrl({ verifier, challenge }));
    showStatus('Paste the Claude code here after approving sign-in.', '#818cf8');
    document.getElementById('anthropicOAuthCode')?.focus();
  } catch (err) {
    showStatus('✗ Claude sign-in: ' + (err?.message || err), '#f87171');
  } finally {
    setButtonBusy(btn, false);
  }
});

document.getElementById('save-anthropic-oauth')?.addEventListener('click', async () => {
  const input = document.getElementById('anthropicOAuthCode');
  const authCode = input.value.trim();
  if (!authCode) return;
  try {
    const s = await chrome.storage.local.get(ANTHROPIC_OAUTH_VERIFIER_KEY);
    const verifier = s[ANTHROPIC_OAUTH_VERIFIER_KEY];
    if (!verifier) throw new Error('Start Claude sign-in first.');
    const tokens = await exchangeAnthropicCode({ authCode, verifier });
    await saveAnthropicOAuthTokens(tokens);
    await chrome.storage.local.remove(['anthropicKey', ANTHROPIC_OAUTH_VERIFIER_KEY]);
    input.value = '';
    setConnected('anthropic', tokens.access, { method: 'oauth' });
    showStatus('✓ Connected to Claude', '#4ade80');
  } catch (err) {
    showStatus('✗ Claude sign-in: ' + (err?.message || err), '#f87171');
  }
});

document.getElementById('save-anthropic')?.addEventListener('click', async () => {
  const key = document.getElementById('anthropicApiKey').value.trim();
  if (!key) return;
  await chrome.storage.local.set({ anthropicKey: key });
  await clearAnthropicOAuthTokens();
  document.getElementById('anthropicApiKey').value = '';
  setConnected('anthropic', key, { method: 'apikey' });
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
    const authUrl =
      `https://openrouter.ai/auth?callback_url=${encodeURIComponent(redirectUrl)}` +
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

    chrome.storage.local.set({ openrouterKey: key }, () =>
      setConnected('openrouter', key, { method: 'oauth' })
    );
  } catch (err) {
    setButtonBusy(btn, false);
    showStatus('✗ OpenRouter: ' + err.message, '#f87171');
  }
});
