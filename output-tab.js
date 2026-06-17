import { findSimilar, getEgoGraph, getLibraryIndex, listCollections, saveCollection } from './store.js';
import { egoGraphSvg } from './graph.js';
import { esc, paras, formatStars } from './format.js';
import { formatTokens } from './estimate.js';
import { THEMES, initTheme, saveTheme } from './theme.js';
import { SYSTEMS_FRAMEWORKS } from './systems.js';
import { IDEATE_FRAMEWORKS } from './ideate.js';
import { HEURISTICS_FRAMEWORKS } from './heuristics.js';
import { toMarkdown, toHtml, toScaffold, toSlackPost, slugify } from './exporter.js';
import { lineageSvg, loopSvg } from './diagram.js';
import { explainerFor, SCAN_EXPLAINERS } from './explainers.js';
import { deriveFit, firstSentence, verdictCopyText } from './verdict.js';
import { pingRunner } from './runner.js';
import { emptyLens, runOf } from './lens-runs.js';
import { spine, flow, ranked, matrix2x2, optionMatrix } from './layouts.js';
import { guideFor } from './lens-guide.js';
import { categorizeError, errorActions } from './errors.js';
import { renderMascot, setMascotState, setMascotFromFit } from './mascot.js';
import { DOCS_GRADES } from './docs-quality.js';
import { MAINT_BANDS, BUS_FACTORS } from './maintenance.js';
import { bucketFor, bucketLabel, checkLibraryCompat } from './license-compat.js';
import { allLicenses } from './store.js';
import { DECISIONS, DECISION_META } from './decision-log.js';
import { saveDecision, getDecision, clearDecision } from './store.js';
import { encodeShareCard } from './share-card.js';
import { FITS_VERDICTS } from './fits-stack.js';
import { initPalette } from './palette.js';
import { toggleRepoInCollection, collectionContains, sortedCollections, COLLECTION_COLORS } from './collections.js';
import { detectPlatform } from './url-detector.js';
import { listSnapshots } from './store.js';
import { hashId } from './scene.js';
import { buildBlueprintScene } from './blueprint-adapter.js';
import { mountCanvas } from './canvas-engine.js';
import { buildTour } from './tour.js';
import { startTour } from './tour-runner.js';
import { toCanvasSvg, toExcalidraw } from './canvas-export.js';
import { getScene, saveScene } from './store.js';
import { snapshotTrend, sparkline } from './snapshots.js';
import { introStageB, COPY } from './onboarding.js';
import { startCoachmark } from './coachmark.js';
import { clearDemoEverywhere, isDemo } from './demo-repo.js';
import { ACTS, TAB_LABELS, actForTab, tabsForAct } from './output-acts.js';

// Apply the saved theme ASAP (before render) to minimise flash.
initTheme();
// Mirror the OS reduced-motion preference into storage for the service worker.
chrome.storage.local.set({ reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches });

function renderThemeSwitcher() {
  const host = document.getElementById('theme-switcher');
  if (!host) return;
  const current = document.documentElement.getAttribute('data-theme') || 'midnight';
  host.innerHTML = '';
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.className = 'swatch' + (t.key === current ? ' active' : '');
    b.style.background = t.swatch;
    b.title = t.label;
    b.setAttribute('aria-label', t.label);
    b.addEventListener('click', async () => {
      await saveTheme(t.key);
      host.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      b.classList.add('active');
    });
    host.appendChild(b);
  }
}

const params = new URLSearchParams(location.search);
const sessionKey = params.get('key');

const loading = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMsg = document.getElementById('error-msg');
const main = document.getElementById('main-content');

// Mascot ("Vee") — opt-in (default on), decorative, reduced-motion-safe. The
// module never touches storage, so the on/off gate lives here.
let mascotOn = false;
let headerVee = null;
async function isMascotEnabled() {
  try { const { mascotEnabled } = await chrome.storage.local.get('mascotEnabled'); return mascotEnabled !== false; }
  catch { return true; }
}
function veeToVerdict() {
  if (mascotOn && headerVee && lastData) setMascotFromFit(headerVee, deriveFit(lastData).level);
}

const FETCH_PHRASES = [
  'Pulling the README…',
  'Grabbing the metadata…',
];

const THINK_PHRASES = [
  'Mapping the architecture…',
  'Reading between the lines…',
  'Weighing the trade-offs…',
  'Sizing up the ecosystem…',
  'Scanning for red flags…',
  'Finding the entry points…',
  'Checking the health signals…',
  'Building your breakdown…',
  'Almost there…',
];

// Lead with the provider actually being used (not a hardcoded "Claude").
function thinkPhrases(provider) {
  return [`Asking ${provider || 'the model'} to read this…`, ...THINK_PHRASES];
}

function setLoadingMsg(msg) {
  const el = document.getElementById('loading-msg');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => { el.textContent = msg; el.style.opacity = '1'; }, 150);
}

function setLoadingName(name) {
  const el = document.getElementById('loading-name');
  if (el && !el.textContent) el.textContent = name;
}

async function waitForData() {
  const deadline = Date.now() + 90_000;
  let phraseIndex = 0;
  let lastStatus = null;
  let cycleTimer = null;
  let pollMs = 150; // adaptive: start fast, back off when idle

  const startCycling = (phrases) => {
    if (cycleTimer) clearInterval(cycleTimer);
    phraseIndex = 0;
    setLoadingMsg(phrases[0]);
    cycleTimer = setInterval(() => {
      phraseIndex = (phraseIndex + 1) % phrases.length;
      setLoadingMsg(phrases[phraseIndex]);
    }, 2800);
  };

  try {
    while (true) {
      if (Date.now() > deadline) throw new Error('Analysis timed out — please try again.');
      const stored = await chrome.storage.session.get(sessionKey);
      const data = stored[sessionKey];

      if (!data) { await sleep(150); continue; }

      if (data.loading) {
        let changed = false;
        if (data.repoId) setLoadingName(data.repoId);
        if (data.statusMsg) {
          if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
          setLoadingMsg(data.statusMsg);
          if (data.status !== lastStatus) { lastStatus = data.status; changed = true; }
        } else if (data.status !== lastStatus) {
          lastStatus = data.status;
          changed = true;
          if (data.status === 'thinking') startCycling(thinkPhrases(data.provider));
          else startCycling(FETCH_PHRASES);
        }
        // Progress bar: fetching=15%, quickData ready=40%, thinking=55-90% (animated)
        const bar = document.getElementById('loading-bar');
        if (bar) {
          const pct = data.status === 'thinking'
            ? (data.quickData ? 55 : 40)
            : 15;
          bar.style.width = pct + '%';
          if (data.status === 'thinking') {
            bar.style.transition = 'width 25s cubic-bezier(.1,0,.4,1)';
            if (changed) bar.style.width = '92%'; // crawl toward 92 over 25s
          }
        }
        if (data.quickData) renderQuickVerdict(data.quickData);
        // Back off when idle; snap back to fast when something changes.
        if (changed) pollMs = 150;
        else pollMs = Math.min(pollMs * 1.4, 600);
        await sleep(pollMs);
        continue;
      }

      return data;
    }
  } finally {
    if (cycleTimer) clearInterval(cycleTimer);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function renderQuickVerdict(qd) {
  const host = document.getElementById('quick-verdict');
  if (!host || !qd?.repoId) return;
  const fmtStars = (n) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n || 0);
  const pills = [
    qd.language ? `<span style="font:600 10px ui-monospace,monospace;background:var(--surface-alt);border:1px solid var(--border);border-radius:20px;padding:2px 8px;color:var(--text-sub)">${esc(qd.language)}</span>` : '',
    qd.stars ? `<span style="font:600 10px ui-monospace,monospace;background:var(--surface-alt);border:1px solid var(--border);border-radius:20px;padding:2px 8px;color:var(--text-sub)">${fmtStars(qd.stars)} ★</span>` : '',
    qd.license && qd.license !== 'Unknown' ? `<span style="font:600 10px ui-monospace,monospace;background:var(--surface-alt);border:1px solid var(--border);border-radius:20px;padding:2px 8px;color:var(--text-sub)">${esc(qd.license)}</span>` : '',
  ].filter(Boolean).join('');
  host.innerHTML = `
    <div style="font:700 10px/1 ui-monospace,monospace;letter-spacing:1px;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px">Quick Info</div>
    <div style="font:700 13px var(--font);color:var(--text);margin-bottom:4px">${esc(qd.repoId)}</div>
    ${qd.description ? `<div style="font:400 12px var(--font);color:var(--text-sub);line-height:1.5;margin-bottom:10px">${esc(qd.description)}</div>` : ''}
    ${pills ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${pills}</div>` : ''}
    <div style="margin-top:10px;font:400 11px var(--font);color:var(--text-faint)">Full analysis is running…</div>`;
  host.style.display = 'block';
}

async function initOutputPalette(data) {
  const commands = [
    // Navigation
    { section: 'Navigation', name: 'Verdict', description: 'Overall fit + score', shortcut: 'V', action: () => show(9) },
    { name: 'ELI5', description: 'Plain-English summary', shortcut: 'E', action: () => show(0) },
    { name: 'Technical', description: 'Architecture & internals', action: () => show(1) },
    { name: 'Use Cases', description: "Who it's for", action: () => show(2) },
    { name: 'Skip If', description: 'When to avoid it', action: () => show(3) },
    { name: 'Enables', description: 'What it unlocks', action: () => show(4) },
    { name: 'Pros / Cons', description: 'Trade-off breakdown', action: () => show(5) },
    { name: 'Alternatives', description: 'Comparable tools', action: () => show(6) },
    { name: 'Health', description: 'Repo vitality signals', shortcut: 'H', action: () => show(7) },
    { name: 'Red Flags', description: 'Risks and warnings', action: () => show(8) },
    { name: 'Tech Stack', description: 'Dependencies & languages', action: () => show(15) },
    { name: 'Similar', description: 'From your library', action: () => show(16) },
    { name: 'Synergies', description: 'Works-well-with analysis', action: () => show(18) },
    { name: 'Versus', description: 'Side-by-side comparison', action: () => show(17) },
    { name: 'Connections', description: 'Dependency graph', action: () => show(19) },
    { name: 'Combine', description: 'What you can build together', action: () => show(20) },
    // On-demand lenses
    { section: 'Lenses', name: 'Run Deep Dive', description: 'Full strategic analysis', action: () => { show(10); startDeepDive(data); } },
    { name: 'Run Docs Quality', description: 'Documentation score', action: () => { show(21); startDocsQuality(data); } },
    { name: 'Run Maintenance', description: 'Long-term upkeep signal', action: () => { show(22); startMaintenance(data); } },
    { name: 'Run License Check', description: 'License compatibility', action: () => show(23) },
    { name: 'Run Since Last Scan', description: 'What changed since you last looked', action: () => show(24) },
    { name: 'Run Fits MY Stack?', description: 'Match against your tech stack', action: () => { show(25); startFitsStack(data); } },
    { name: 'Ask This Repo', description: 'Ask a specific question about this repo', action: () => show(26) },
    { name: 'Run All Lenses', description: 'Fire every on-demand lens', action: () => runAllLenses() },
    // Actions
    { section: 'Actions', name: 'Add to Board', description: 'Save this repo to a collection', action: () => document.getElementById('add-to-board')?.click() },
    { name: 'Open Library', description: 'Browse your saved repos', action: () => chrome.tabs.create({ url: chrome.runtime.getURL('library.html') }) },
    { name: 'Batch Scan', description: 'Scan multiple repos at once', action: () => chrome.tabs.create({ url: chrome.runtime.getURL('batch.html') }) },
    { name: 'Run Fresh Scan', description: 'Bypass cache and re-analyse this repo', shortcut: 'F', action: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true })) },
    { name: 'Open Repo Source', description: 'Open the GitHub / npm / PyPI page', shortcut: 'O', action: () => { if (lastData) { const url = repoSourceUrl(lastData.platform, lastData.repoId); if (url) chrome.tabs.create({ url }); } } },
    { name: 'Share Verdict Card', description: 'Generate a shareable verdict card', action: () => document.getElementById('v-share')?.click() },
    { name: 'Copy URL', description: 'Copy the repo source URL', shortcut: 'U', action: () => document.getElementById('copy-url')?.click() },
    { name: 'Copy Markdown', description: 'Copy this analysis as MD', shortcut: 'M', action: () => document.getElementById('copy-md')?.click() },
    { name: 'Copy Slack Post', description: 'Copy compact summary for Slack/Discord', action: () => copySlackBtn?.click() },
    { name: 'Export Scaffold', description: 'Download CLAUDE.md scaffold', action: () => document.getElementById('export-scaffold')?.click() },
    { name: 'Export HTML', description: 'Download self-contained report', action: () => document.getElementById('export-html')?.click() },
    { name: 'Open Settings', description: 'Configure API keys and providers', action: () => chrome.runtime.openOptionsPage() },
    { name: 'Open Guide', description: 'Feature overview and keyboard shortcuts', action: () => document.getElementById('open-guide')?.click() },
    { name: "What's New", description: 'Release notes and recent features', action: () => chrome.tabs.create({ url: chrome.runtime.getURL('whats-new.html') }) },
  ];

  // Append recent repos from library as jump targets (opens library pre-searched to that repo)
  const allCommands = [...commands];
  try {
    const idx = await getLibraryIndex();
    if (idx.size) {
      const recentCmds = [...idx.values()]
        .sort((a, b) => (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0))
        .slice(0, 8)
        .filter((r) => r.repoId !== data.repoId)
        .map((r, i) => ({
          section: i === 0 ? 'Recent repos' : undefined,
          name: r.repoId,
          description: r.blurb || r.category || 'Open in library',
          action: () => chrome.tabs.create({ url: chrome.runtime.getURL(`library.html#search=${encodeURIComponent(r.repoId)}`) }),
        }));
      allCommands.push(...recentCmds);
    }
  } catch (_) {}

  initPalette(allCommands);
  document.getElementById('open-palette')?.addEventListener('click', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  });
}

// Stage B of the Vee intro: if the Library handed off (`onboardingStage:'verdict'`),
// continue the coachmark over this repo's Verdict + Blueprint, then tear the demo down.
async function maybeContinueOnboarding(d) {
  const { onboardingStage } = await chrome.storage.local.get('onboardingStage');
  if (onboardingStage !== 'verdict') return;
  if (!isDemo(d)) return; // Stage B only continues over the seeded demo, never a real repo
  await chrome.storage.local.remove('onboardingStage');
  // Immutable copy before injecting the before-hook on the Blueprint/Canvas step.
  const steps = introStageB().map((s) => ({ ...s }));
  // onboarding.js is pure and can't reference show(); inject the tab switch here.
  // The Blueprint step is the one targeting the Canvas tab ([data-tab="27"]).
  const blueprintStep = steps.find((s) => s.copyKey === 'blueprint');
  if (blueprintStep) blueprintStep.before = () => show(27);
  startCoachmark({
    steps,
    copy: COPY,
    onExit: async () => {
      await clearDemoEverywhere();
      await chrome.storage.local.set({ onboardingSeen: true });
    },
  });
}

async function init() {
  mascotOn = await isMascotEnabled();
  if (mascotOn) renderMascot(document.getElementById('loading-vee'), 'scanning');

  if (!sessionKey) {
    loading.style.display = 'none';
    errorMsg.textContent = 'No session key — please re-run the analysis by clicking the extension icon.';
    if (mascotOn) renderMascot(document.getElementById('error-vee'), 'error');
    errorState.style.display = 'flex';
    return;
  }
  const data = await waitForData();
  loading.style.display = 'none';

  if (data.error) {
    errorMsg.textContent = data.error;
    // Show a specific recovery hint below the error message.
    const canRetry = Boolean(data.platform && data.repoId);
    if (canRetry) retryContext = { platform: data.platform, repoId: data.repoId };
    const kind = data.errorKind || categorizeError(data.error).kind;
    const actions = errorActions(kind, canRetry);
    const HINTS = {
      none: 'Add an API key in Settings → it only takes 30 seconds.',
      auth: 'Your API key was rejected. Regenerate it from the provider\'s console, then paste it in Settings.',
      rate_limit: 'You\'ve hit the rate limit. Wait a minute and retry — or switch to a different provider in Settings.',
      not_found: 'The model name is unrecognised. Open Settings and pick a valid model from the dropdown.',
      network: 'Can\'t reach the provider. Check your internet connection, then retry.',
      server: 'The provider is temporarily down. Retry in a few seconds.',
      timeout: 'The provider took too long. Retry, or pick a faster model/provider in Settings.',
    };
    const hint = HINTS[kind];
    let hintEl = document.getElementById('error-hint');
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.id = 'error-hint';
      hintEl.style.cssText = 'font-size:12px;color:var(--text-muted);text-align:center;max-width:360px;line-height:1.6;margin-top:-4px';
      errorMsg.insertAdjacentElement('afterend', hintEl);
    }
    hintEl.textContent = hint || '';
    if (settingsBtn) settingsBtn.style.display = actions.settings ? '' : 'none';
    if (retryBtn) retryBtn.style.display = actions.retry ? '' : 'none';
    const pasteForm = document.getElementById('paste-url-form');
    if (pasteForm) {
      pasteForm.style.display = 'flex';
      // Pre-fill if clipboard has a recognized URL (silent — no browser prompt shown).
      navigator.clipboard?.readText?.().then((txt) => {
        const trimmed = (txt || '').trim();
        if (detectPlatform(trimmed)) {
          const inp = document.getElementById('paste-url-input');
          if (inp && !inp.value) inp.value = trimmed;
        }
      }).catch(() => {});
    }
    if (mascotOn) renderMascot(document.getElementById('error-vee'), 'error');
    errorState.style.display = 'flex';
    return;
  }

  lastData = data;
  renderPage(data);
  await maybeContinueOnboarding(data);
  main.style.display = 'block';
  const fitEmoji = { strong: '✅', solid: '✓', care: '⚠️', risky: '🔴' }[deriveFit(data).level] || '';
  document.title = `${fitEmoji} ${data.repoId} — RepoLens`;
  initOutputPalette(data);

  // Restore tab: URL hash takes priority (explicit intent), then per-repo memory.
  const hashTab = SLUG_TO_TAB[location.hash.slice(1)];
  if (hashTab != null) {
    show(hashTab, { updateHash: false });
  } else if (data.repoId) {
    chrome.storage.local.get(`repolens_tab_${data.repoId}`).then((res) => {
      const stored = res[`repolens_tab_${data.repoId}`];
      if (stored != null && stored !== 9) show(stored, { updateHash: true });
    }).catch(() => {});
  }

  // Header logo becomes Vee, reacting to the verdict (one-shot pop/squint on mount).
  if (mascotOn) {
    const logoSlot = document.getElementById('logo-vee');
    if (logoSlot) {
      logoSlot.style.background = 'none';
      headerVee = renderMascot(logoSlot, 'idle');
      setMascotFromFit(headerVee, deriveFit(data).level);
    }
  }

  watchSaveStatus(data);
  loadLibraryComparison(data);
  getLibraryIndex().then(m => {
    const btn = document.getElementById('open-library');
    if (btn && m.size > 0) btn.title = `Browse your ${m.size} analyzed repo${m.size === 1 ? '' : 's'}`;
  }).catch(() => {});
  renderThemeSwitcher();
  renderDeepDive(data);
  renderFrameworkLens(data, SYSTEMS_CFG);
  renderFrameworkLens(data, IDEATE_CFG);
  renderFrameworkLens(data, PRIORITIZE_CFG);
  renderSktpg(data);
  renderDocsQuality(data);
  renderMaintenance(data);
  renderLicenseCompat(data);
  renderDiff(data);
  renderFitsStack(data);
  renderAskRepo(data);
  renderTechStack(data);
  renderSimilar(data);
  renderVersus(data);
  renderSynergies(data);
  renderCombinator(data);
  renderCacheBanner(data);
}

function renderCacheBanner(d) {
  const banner = document.getElementById('cache-banner');
  if (!banner) return;
  if (!d.cached) { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  const span = banner.querySelector('span');
  if (!span) return;
  if (d.saved_at) {
    const ageMs = Date.now() - new Date(d.saved_at).getTime();
    const ageDays = Math.floor(ageMs / 86_400_000);
    const ageLabel = ageDays === 0 ? 'today' : ageDays === 1 ? 'yesterday' : `${ageDays} days ago`;
    const stale = ageDays >= 7;
    span.textContent = stale
      ? `⚠ Cached analysis from ${ageLabel} — repo may have changed`
      : `⚡ Loaded from cache · scanned ${ageLabel}`;
    banner.classList.toggle('stale-banner', stale);
  } else {
    span.textContent = '⚡ Loaded from cache — analysis reused, no AI call.';
  }
}

document.getElementById('rerun-fresh')?.addEventListener('click', async () => {
  const d = lastData;
  if (!d) return;
  try { await chrome.runtime.sendMessage({ type: 'RERUN', sessionKey, platform: d.platform, repoId: d.repoId }); }
  catch { /* reload anyway */ }
  location.reload();
});

// ─── Synergies tab — complementary repos (library-grounded, on-demand) ────────

function startSynergies(d) {
  chrome.runtime.sendMessage({ type: 'SYNERGIES', sessionKey, platform: d.platform, repoId: d.repoId });
  renderSynergies({ ...d, synergies: { status: 'running' } }); // optimistic
}

function renderSynergies(d) {
  const host = document.getElementById('t18');
  if (!host) return;
  const syn = d.synergies;

  if (!syn || !syn.status) {
    host.innerHTML = `<div class="dd-cta">
      <h3>Synergies — Pairs Well With</h3>
      <p>Repos that <i>compose</i> with <b>${esc(d.repoId)}</b> — tools you'd use alongside it, not instead of it. Grounded in your library (★), plus a few notable complements worth adding.</p>
      <button class="dd-run" id="syn-run">Find Synergies</button>
    </div>`;
    document.getElementById('syn-run')?.addEventListener('click', () => startSynergies(d));
    return;
  }

  if (syn.status === 'error') {
    host.innerHTML = `<div class="dd-cta"><h3>Synergies failed</h3><p>${esc(syn.error || 'Something went wrong.')}</p><button class="dd-run" id="syn-run">Try again</button></div>`;
    document.getElementById('syn-run')?.addEventListener('click', () => startSynergies(d));
    return;
  }

  if (syn.status !== 'done') {
    host.innerHTML = `<div class="dd-progress"><span class="dot"></span>Finding what pairs with ${esc(d.repoId)}…</div>`;
    return;
  }

  const items = syn.result?.synergies || [];
  if (!items.length) { host.innerHTML = '<p class="atom-purpose">No synergies surfaced.</p>'; return; }
  host.innerHTML = `<div class="dd-section-title first">Pairs well with</div>${items.map(s => `<div class="idea-card">
    <div class="head"><span class="title">${esc(s.repoId)}</span>${s.category ? `<span class="idea-badge">${esc(s.category)}</span>` : ''}${s.in_library ? '<span class="flag-pill green">★ in library</span>' : '<span class="flag-pill yellow">suggested</span>'}</div>
    <div class="body">${esc(s.synergy)}</div>
  </div>`).join('')}`;
}

// ─── Similar Repos tab (from your library; no AI call) ────────────────

async function renderSimilar(d) {
  const host = document.getElementById('t16');
  if (!host) return;
  host.innerHTML = '<div class="dd-progress"><span class="dot"></span>Finding similar repos in your library…</div>';
  let similar = [];
  try { similar = await findSimilar(d); } catch { similar = []; }
  if (!similar.length) {
    host.innerHTML = `<div class="dd-cta"><h3>Similar Repos</h3><p>Repos you've already analysed that are close to <b>${esc(d.repoId)}</b> — by language and category, pulled from your library — show up here. Analyse a few more and they'll appear.</p></div>`;
    return;
  }
  host.innerHTML = `<div class="dd-section-title first">From your library</div>${similar.map(s => `<div class="idea-card">
    <div class="head"><span class="title">${esc(s.repoId)}</span></div>
    ${s.eli5 ? `<div class="body">${esc(s.eli5)}</div>` : ''}
    ${s.compare_hooks ? `<div class="body" style="color:var(--text-muted);font-style:italic">${esc(s.compare_hooks)}</div>` : ''}
  </div>`).join('')}`;
}

// ─── Connections tab — walkable semantic ego-graph (local graph engine) ─────

const CN_LEGEND = `<div class="cn-legend">
  <span><i class="cn-l-alt"></i>alternative</span>
  <span><i class="cn-l-syn"></i>synergy</span>
  <span><i class="cn-l-vs"></i>versus</span>
  <span><i class="cn-l-idea"></i>idea</span>
</div>`;

function cnCrumbs(trail) {
  return `<div class="cn-crumbs">${trail.map((t, i) => {
    const name = t.split('/').pop() || t;
    return `<span class="cn-crumb${i === trail.length - 1 ? ' current' : ''}" data-crumb="${i}">${esc(name)}</span>`;
  }).join('<span class="cn-sep">›</span>')}</div>`;
}

function cnWireCrumbs(host, d, trail) {
  host.querySelectorAll('.cn-crumb').forEach((el) => {
    el.addEventListener('click', () => {
      const i = Number(el.dataset.crumb);
      if (i < trail.length - 1) cnDraw(host, d, trail.slice(0, i + 1));
    });
  });
}

async function cnDraw(host, d, trail) {
  const repoId = trail[trail.length - 1];
  host.innerHTML = cnCrumbs(trail) + '<div class="dd-progress"><span class="dot"></span>Mapping connections…</div>';
  let graph = null;
  try { graph = await getEgoGraph(repoId); } catch { graph = null; }

  if (!graph || !graph.neighbors.length) {
    host.innerHTML = cnCrumbs(trail) + `<div class="dd-cta"><h3>Connections</h3>
      <p>No connections yet for <b>${esc(repoId)}</b> — run <b>Synergies</b> or <b>Versus</b>, or analyse one of its alternatives, to start building the map.</p></div>`;
    cnWireCrumbs(host, d, trail);
    return;
  }

  host.innerHTML = cnCrumbs(trail) + CN_LEGEND + `<div class="cn-stage">${egoGraphSvg(graph.center, graph.neighbors, graph.edges)}</div>`;
  cnWireCrumbs(host, d, trail);

  host.querySelectorAll('.cn-node').forEach((g) => {
    const id = g.dataset.node;
    const nb = graph.neighbors.find(n => String(n.id) === id);
    if (!nb) return; // center node — already focused
    g.addEventListener('click', () => {
      if (nb.kind === 'idea') {
        let panel = host.querySelector('.cn-idea-detail');
        if (!panel) { panel = document.createElement('div'); panel.className = 'cn-idea-detail'; host.appendChild(panel); }
        panel.innerHTML = `<b>${esc(nb.name)}</b> — ${esc(nb.pitch || 'a pinned idea')}`;
      } else if (nb.repoId) {
        cnDraw(host, d, [...trail, nb.repoId]); // walk: re-center on the analyzed repo
      } else {
        window.open(`https://github.com/search?q=${encodeURIComponent(nb.name)}&type=repositories`, '_blank', 'noopener');
      }
    });
  });
}

function renderConnections(d) {
  const host = document.getElementById('t19');
  if (!host || !d?.repoId) return;
  cnDraw(host, d, [d.repoId]);
}

// ─── Canvas tab — interactive Blueprint built from Deep Dive atoms + lineage ──
// Mounts lazily on tab open (like Connections) and only once per page: until the
// Deep Dive has run, it shows a CTA; once atoms exist it builds/loads the scene,
// wires the engine, a guided tour, and SVG/.excalidraw export.
async function renderCanvas(d) {
  const hostWrap = document.querySelector('#t27 .canvas-host');
  if (!hostWrap || hostWrap.dataset.mounted === '1') return;   // mount once per page
  const dd = d && d.deepDive;
  if (!dd || !dd.atoms || !dd.atoms.length) {
    // No atoms yet — show the CTA and leave the guard UNclaimed so a later Deep Dive
    // (B-3) can re-render this same host into a real Blueprint.
    hostWrap.innerHTML = '<div class="dd-cta">Run <b>Deep Dive</b> first — the Blueprint is built from its atoms &amp; lineage.</div>';
    return;
  }
  // Claim the guard synchronously, before the first await — otherwise two concurrent
  // calls (tab switch + a storage event) both pass the check above, then both mount,
  // leaking a second engine. Reset it on failure so a failed render can retry.
  hostWrap.dataset.mounted = '1';
  try {
    return await mountBlueprint(hostWrap, d, dd);
  } catch (err) {
    delete hostWrap.dataset.mounted;
    throw err;
  }
}

async function mountBlueprint(hostWrap, d, dd) {
  const sceneId = 'repo:' + hashId(d.repoId);
  let scene = await getScene(sceneId);
  if (!scene) {
    scene = buildBlueprintScene({ deepDive: dd, repoId: d.repoId, title: d.repoId, scanAt: d.saved_at || null });
    await saveScene(scene);
  }
  const api = mountCanvas(hostWrap, scene, { onChange: (s) => saveScene(s).catch(() => {}) });

  const bar = document.createElement('div');
  bar.className = 'canvas-export-bar';
  const tourBtn = document.createElement('button'); tourBtn.textContent = '▶ Guided Tour';
  let activeTour = null;
  tourBtn.onclick = () => {
    if (activeTour) activeTour.exit();   // tear down a prior tour first — don't stack cards/listeners on re-launch
    activeTour = startTour({ host: hostWrap, engine: api, steps: buildTour(api.getScene(), { roots: (dd.lineage && dd.lineage.roots) || [] }), autoplay: false });
  };
  const exEx = document.createElement('button'); exEx.textContent = '.excalidraw';
  exEx.onclick = () => download(`${slugify(d.repoId)}.excalidraw`, 'application/json', toExcalidraw(api.getScene()));
  const exSvg = document.createElement('button'); exSvg.textContent = 'SVG';
  exSvg.onclick = () => download(`${slugify(d.repoId)}.svg`, 'image/svg+xml', toCanvasSvg(api.getScene()));
  bar.append(tourBtn, exEx, exSvg);
  hostWrap.appendChild(bar);

  const legend = document.createElement('div'); legend.className = 'canvas-legend';
  for (const [k, lab] of [['entrypoint', 'Entry'], ['subsystem', 'Core'], ['module', 'Module'], ['data', 'Data'], ['concept', 'Concept']]) {
    const sw = document.createElement('span'); sw.className = `lg lg-${k}`; sw.textContent = lab; legend.appendChild(sw);
  }
  hostWrap.appendChild(legend);
}

// Anchor-download helper (no equivalent named helper exists in this module).
function download(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Combinator tab — fuse complementary library repos into new project ideas ─
function startCombinator(d) {
  const mode = document.querySelector('input[name="cb-mode"]:checked')?.value || 'repo';
  const wildness = (Number(document.getElementById('cb-wildness')?.value) || 0) / 100;
  chrome.runtime.sendMessage({ type: 'COMBINATOR', sessionKey, platform: d.platform, repoId: d.repoId, mode, wildness });
  renderCombinator({ ...d, combinator: { status: 'running', results: [], mode, wildness } }); // optimistic
}

function comboCard(c, idx) {
  const clamp = (n) => Math.max(0, Math.min(5, Number(n) || 0));
  const dots = (n) => '●'.repeat(clamp(n)) + '○'.repeat(5 - clamp(n));
  const chips = (c.repoIds || []).map(r => `<span class="cb-chip">${esc(r)}</span>`).join('');
  const contribs = (c.contributions || []).map(x => `<div class="cb-contrib"><b>${esc(x.repoId)}</b> — ${esc(x.role)}</div>`).join('');
  return `<div class="cb-card">
    <div class="cb-head"><span class="cb-title">${esc(c.title || 'Untitled combo')}</span></div>
    <div class="cb-pitch">${esc(c.pitch || '')}</div>
    <div class="cb-chips">${chips}</div>
    ${contribs}
    <div class="cb-meta"><span>novelty <span class="cb-dots">${dots(c.novelty)}</span></span><span>feasibility <span class="cb-dots">${dots(c.feasibility)}</span></span><button class="cb-pin" data-idx="${idx}" title="Pin to your idea graph">★ pin</button></div>
    ${c.first_step ? `<div class="cb-first"><b>First step:</b> ${esc(c.first_step)}</div>` : ''}
  </div>`;
}

function retagLine(d) {
  const rt = d.retag;
  if (rt && rt.status === 'running') return `<div class="cb-retag-prog"><span class="dot"></span>Re-tagging library… ${rt.done || 0}/${rt.total || '?'}</div>`;
  if (rt && rt.status === 'done') return `<div class="cb-retag-prog done">✓ Re-tagged ${rt.total || 0} repos with AI</div>`;
  return `<div class="cb-retag-hint">Tags are auto-derived. <button class="cb-retag" id="cb-retag">Re-tag library with AI →</button></div>`;
}

function renderCombinator(d) {
  const host = document.getElementById('t20');
  if (!host) return;
  const cb = d.combinator;

  if (!cb || !cb.status) {
    host.innerHTML = `<div class="dd-cta">
      <h3>Combine — fuse repos into new ideas</h3>
      <p>Pulls complementary repos from your library — different roles, same neighbourhood — and invents concrete projects, scored on novelty and feasibility.</p>
      <div class="cb-modes">
        <label class="cb-radio"><input type="radio" name="cb-mode" value="repo" checked> From <b>${esc(d.repoId.split('/').pop() || d.repoId)}</b></label>
        <label class="cb-radio"><input type="radio" name="cb-mode" value="library"> Across the whole library</label>
      </div>
      <label class="cb-wild">wildness <input type="range" id="cb-wildness" min="0" max="100" value="0"><span class="cb-wild-hint">higher = more surprising, less obvious</span></label>
      <button class="dd-run" id="cb-run">Find combinations</button>
      ${retagLine(d)}
    </div>`;
    document.getElementById('cb-run')?.addEventListener('click', () => startCombinator(d));
    document.getElementById('cb-retag')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'TAG_LIBRARY', sessionKey });
      renderCombinator({ ...d, combinator: undefined }); // stay on CTA; retag progress shows via onChanged
    });
    return;
  }
  if (cb.status === 'error') {
    host.innerHTML = `<div class="dd-cta"><h3>Combine failed</h3><p>${esc(cb.error || 'Something went wrong.')}</p><button class="dd-run" id="cb-run">Back</button></div>`;
    document.getElementById('cb-run')?.addEventListener('click', () => renderCombinator({ ...d, combinator: undefined }));
    return;
  }

  const results = cb.results || [];
  const running = cb.status !== 'done';
  if (!results.length && running) {
    host.innerHTML = `<div class="dd-progress"><span class="dot"></span>Combining ${esc(d.repoId)} with your library…${cb.total ? ` (0/${cb.total})` : ''}</div>`;
    return;
  }
  if (!results.length) {
    host.innerHTML = `<div class="dd-cta"><h3>No combinations yet</h3><p>Analyse a few more repos (so there's a library to combine with), then try again.</p><button class="dd-run" id="cb-run">Back</button></div>`;
    document.getElementById('cb-run')?.addEventListener('click', () => renderCombinator({ ...d, combinator: undefined }));
    return;
  }
  const usedLabel = (cb.mode === 'library' ? 'across the library' : 'from this repo') + (cb.wildness ? ` · wildness ${Math.round(cb.wildness * 100)}%` : '');
  host.innerHTML =
    `<div class="cb-bar"><span class="cb-used">${esc(usedLabel)}</span><button class="cb-change" id="cb-change">↻ change</button></div>` +
    results.map((c, i) => comboCard(c, i)).join('') +
    (running ? `<div class="dd-progress"><span class="dot"></span>generating… (${results.length}/${cb.total || '?'})</div>` : '');
  document.getElementById('cb-change')?.addEventListener('click', () => renderCombinator({ ...d, combinator: undefined }));
  host.querySelectorAll('.cb-pin').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = results[Number(btn.dataset.idx)];
      if (!c) return;
      chrome.runtime.sendMessage({ type: 'PIN_IDEA', sessionKey, idea: { title: c.title, pitch: c.pitch, sources: c.repoIds, novelty: c.novelty, feasibility: c.feasibility } });
      btn.textContent = '★ pinned'; btn.disabled = true; btn.classList.add('pinned');
    });
  });
}

// ─── Tech Stack tab (populated from the scan) ─────────────────────────────────

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Rust: '#dea584',
  Go: '#00ADD8', Java: '#b07219', Ruby: '#701516', 'C++': '#f34b7d', C: '#555555',
  'C#': '#178600', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051',
  HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Dart: '#00B4AB', Scala: '#c22d40',
  'Objective-C': '#438eff', Lua: '#000080', Elixir: '#6e4a7e', Haskell: '#5e5086',
};
const langColor = (name) => LANG_COLORS[name] || '#64748b';

function renderTechStack(d) {
  const host = document.getElementById('t15');
  if (!host) return;
  const ts = d.tech_stack || { built_with: [], key_dependencies: [] };
  const langs = d.languages || [];
  const deps = d.dependencies || [];
  const verByName = Object.fromEntries(deps.map(x => [x.name, x.version]));

  const comp = langs.length ? `
    <div class="dd-section-title first">Composition</div>
    <div class="comp-bar">${langs.map(l => `<div class="comp-seg" style="width:${l.pct}%;background:${langColor(l.name)}" title="${esc(l.name)} ${l.pct}%"></div>`).join('')}</div>
    <div class="comp-legend">${langs.map(l => `<span><i style="background:${langColor(l.name)}"></i>${esc(l.name)} ${l.pct}%</span>`).join('')}</div>` : '';

  const built = ts.built_with?.length ? `
    <div class="dd-section-title${comp ? '' : ' first'}">Built With</div>
    <div class="ts-pills">${ts.built_with.map(b => `<span class="ts-pill">${esc(b)}</span>`).join('')}</div>` : '';

  const keyDeps = ts.key_dependencies?.length ? `
    <div class="dd-section-title">Key Dependencies</div>
    ${ts.key_dependencies.map(k => { const v = verByName[k.name]; return `<div class="dep-row"><span class="dep-name">${esc(k.name)}${v ? ` <span class="dep-ver">${esc(v)}</span>` : ''}</span><span class="dep-purpose">${esc(k.purpose)}</span></div>`; }).join('')}` : '';

  const fullList = deps.length ? `
    <div class="ts-more" id="ts-more">▸ Show all ${deps.length} dependencies</div>
    <div class="ts-full" id="ts-full">${deps.map(x => `<div class="dep-row"><span class="dep-name">${esc(x.name)}</span><span class="dep-ver">${esc(x.version)}</span></div>`).join('')}</div>` : '';

  if (!comp && !built && !keyDeps && !fullList) { host.innerHTML = '<p class="atom-purpose">No tech-stack data available for this source.</p>'; return; }
  host.innerHTML = comp + built + keyDeps + fullList;

  document.getElementById('ts-more')?.addEventListener('click', () => {
    const full = document.getElementById('ts-full');
    const more = document.getElementById('ts-more');
    const open = full.classList.toggle('open');
    more.textContent = `${open ? '▾ Hide' : '▸ Show all'} ${deps.length} dependencies`;
  });
}

const HL_TAB = {
  eli5: 0, technical: 1, use_cases: 2, skip_if: 3, enables: 4,
  pros: 5, cons: 5, alternatives: 6, health: 7, red_flags: 8,
  start_here: 9, tech_stack: 15,
};
const HL_GLYPH = { risk: '⚠', insight: '◆', opportunity: '➤' };
const HL_LABEL = {
  0: 'ELI5', 1: 'Technical', 2: 'Use Cases', 3: 'Skip If', 4: 'Enables',
  5: 'Pros / Cons', 6: 'Alternatives', 7: 'Health', 8: 'Red Flags',
  9: 'Verdict', 15: 'Tech Stack',
};

// The "✨ Worth noting" callout: the core scan's most notable/actionable findings,
// pinned below the header with a badge dot on each source tab. Clicking jumps there.
function renderHighlights(d) {
  const host = document.getElementById('highlights');
  if (!host) return;
  const items = d.highlights || [];
  document.querySelectorAll('.tab-badge').forEach(b => b.remove()); // clear prior badges on re-render
  if (!items.length) { host.innerHTML = ''; return; }

  const rows = items.map((h) => {
    const tabId = HL_TAB[h.tab];
    const hasJump = tabId != null;
    const jump = hasJump ? `<span class="hl-jump">${esc(HL_LABEL[tabId] || '')} →</span>` : '';
    const cls = `hl-${h.severity}` + (hasJump ? ' clickable' : '');
    return `<div class="hl-row ${cls}"${hasJump ? ` data-jump="${tabId}"` : ''}>
      <span class="hl-glyph">${HL_GLYPH[h.severity] || '◆'}</span>
      <span><span class="hl-text">${esc(h.text)}</span>${h.why ? ` <span class="hl-why">${esc(h.why)}</span>` : ''}</span>
      ${jump}
    </div>`;
  }).join('');
  host.innerHTML = `<div class="hl-callout"><div class="hl-head">✨ WORTH NOTING</div>${rows}</div>`;

  const badged = new Set();
  for (const h of items) {
    const tabId = HL_TAB[h.tab];
    if (tabId == null || badged.has(tabId)) continue;
    badged.add(tabId);
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn && !btn.querySelector('.tab-badge')) {
      const dot = document.createElement('span');
      dot.className = 'tab-badge';
      btn.appendChild(dot);
    }
  }

  host.querySelectorAll('.hl-row.clickable').forEach(row => {
    row.addEventListener('click', () => show(Number(row.dataset.jump)));
  });
}

async function renderHistory(d) {
  const host = document.getElementById('scan-history');
  if (!host || !d || !d.repoId) return;
  const trend = snapshotTrend(await listSnapshots(d.repoId));
  if (!trend) { host.innerHTML = ''; return; }
  const svg = sparkline(trend.series, { metric: 'health', width: 160, height: 30 }) || '';
  const sign = trend.healthDelta > 0 ? '+' : '';
  const healthLine = trend.series.map((s) => (s.health == null ? '–' : s.health)).join(' → ');
  const fitLine = trend.series.map((s) => esc(s.fit)).join(' → ');
  const arrow = trend.fitDirection === 'up' ? '↑' : trend.fitDirection === 'down' ? '↓' : '';
  const resolved = trend.flagsResolved.length ? `−${trend.flagsResolved.length} resolved` : '';
  const added = trend.flagsNew.length ? `+${trend.flagsNew.length} new` : '';
  const flags = [resolved, added].filter(Boolean).join(' · ') || 'no flag changes';
  host.innerHTML = `<div class="sh-card sh-fit-${esc(trend.fitTo)}">
    <div class="sh-head">History · ${trend.count} scans${trend.daysSpan ? ` · ${trend.daysSpan}d` : ''}</div>
    <div class="sh-row"><span class="sh-k">Health</span><span class="sh-v">${svg} ${esc(healthLine)} ${trend.healthDelta != null ? `<b>(${sign}${trend.healthDelta})</b>` : ''}</span></div>
    <div class="sh-row"><span class="sh-k">Fit</span><span class="sh-v">${fitLine} <span class="sh-arrow">${arrow}</span></span></div>
    <div class="sh-row"><span class="sh-k">Flags</span><span class="sh-v">${esc(flags)}</span></div>
  </div>`;
}

function renderPage(d) {
  renderHeader(d);
  renderTabs(d);
  renderHighlights(d);
  renderHistory(d);
}

// ─── Deep Dive tab ────────────────────────────────────────────────────────────

const DD_STAGES = ['fetching', 'atoms', 'lineage', 'feynman'];
const DD_STAGE_LABELS = {
  fetching: 'Fetching source',
  atoms: 'Atomic deconstruction',
  lineage: 'Mapping causal lineage',
  feynman: 'Feynman validation',
};

function ddProgressHtml(status) {
  const idx = DD_STAGES.indexOf(status);
  const step = idx + 1;
  const total = DD_STAGES.length;
  const label = DD_STAGE_LABELS[status] || 'Working';
  const pct = Math.round((step / total) * 100);
  const dots = DD_STAGES.map((s, i) =>
    `<span class="dd-step-dot${i < step ? ' done' : i === step - 1 ? ' active' : ''}"></span>`
  ).join('');
  return `<div class="dd-progress">
    <div class="dd-step-track">${dots}</div>
    <div class="dd-step-label"><span class="dot"></span>${label}…</div>
    <div class="dd-step-bar"><div class="dd-step-fill" style="width:${pct}%"></div></div>
    <div class="dd-step-count">Step ${step} of ${total}</div>
  </div>`;
}

function startDeepDive(d) {
  chrome.runtime.sendMessage({ type: 'DEEP_DIVE', sessionKey, platform: d.platform, repoId: d.repoId });
  renderDeepDive({ ...d, deepDive: { status: 'fetching' } }); // optimistic
}

function factsPanel(f) {
  const langs = (f.languages || []).slice(0, 6);
  const maxCode = Math.max(1, ...langs.map(l => l.code || 0));
  const bars = langs.map(l => `<div class="df-lang"><span class="df-lname">${esc(l.name)}</span><span class="df-bar"><i style="width:${Math.round((l.code || 0) / maxCode * 100)}%;background:${langColor(l.name)}"></i></span><span class="df-loc">${l.code || 0}</span></div>`).join('');
  const dg = f.depGraph || {};
  // Prefer transitive totals (from lockfiles) when present, else direct manifest counts.
  const depCounts = ['npm', 'cargo', 'pip', 'go']
    .map(k => [k, (dg[k] || {}).total || ((f.dependencies && f.dependencies[k]) || []).length, (dg[k] || {}).total])
    .filter(([, n]) => n)
    .map(([k, n, total]) => `${k} ${n}${total ? ' total' : ''}`).join(' · ');
  const arch = f.architecture || {};
  const meta = [
    f.license ? `license: ${esc(f.license.spdx)}` : '',
    f.manifests && f.manifests.length ? `manifests: ${esc(f.manifests.join(', '))}` : '',
    depCounts ? `deps: ${esc(depCounts)}` : '',
    `tests: ${f.tests && f.tests.present ? '✓' : '—'}`,
    `CI: ${f.ci && f.ci.present ? '✓' : '—'}`,
    arch.monorepo ? 'monorepo' : '',
    arch.containerized ? 'containerized' : '',
    (f.secrets || []).length ? `<span class="df-warn">⚠ ${f.secrets.length} secret flags</span>` : '',
  ].filter(Boolean).map(s => `<span>${s}</span>`).join('');
  return `<div class="df-panel">
    <div class="df-head">✓ Measured facts <span class="df-sub">real checkout · ${f.fileCount || 0} files</span></div>
    <div class="df-langs">${bars}</div>
    <div class="df-meta">${meta}</div>
  </div>`;
}

// Ping the deeper-scan runner and reflect its status in the Deep Dive CTA. Best-effort.
async function updateRunnerPill() {
  const el = document.getElementById('dd-runner');
  if (!el) return;
  const { runnerUrl } = await chrome.storage.local.get('runnerUrl');
  const s = await pingRunner(runnerUrl);
  el.className = 'dd-runner ' + (s.ok ? 'on' : 'off');
  el.innerHTML = s.ok
    ? `<span class="dot-on"></span>Deeper-scan runner online${s.docker ? ' · Docker ready' : ''} — Deep Dive will use measured facts.`
    : `<span class="dot-off"></span>Runner offline — Deep Dive falls back to the README. Start it for measured facts: <code>cargo run --release -- serve</code>`;
}

function renderDeepDive(d) {
  const host = document.getElementById('t10');
  if (!host) return;
  const dd = d.deepDive;

  // Vee thinks while a deep dive is in flight, then settles back to the verdict.
  if (headerVee) {
    const inFlight = dd && dd.status && dd.status !== 'done' && dd.status !== 'error';
    if (inFlight) setMascotState(headerVee, 'thinking');
    else veeToVerdict();
  }

  if (!dd || !dd.status) {
    host.innerHTML = `<div class="dd-cta">
      <h3>Deep Dive</h3>
      <p>A rigorous three-stage read of the source. <b>Atomic Deconstruction</b> chunks the repo into its core semantic units, <b>Causal Lineage</b> maps how they depend on and enable each other, and the <b>Feynman Protocol</b> explains it from scratch, flags gaps and assumptions, and self-tests its own understanding.</p>
      <p class="dd-phase">GitHub repos are analysed from real source; other platforms fall back to the README.</p>
      <button class="dd-run" id="dd-run">Run Deep Dive</button>
      <div class="dd-runner" id="dd-runner"><span class="dot-off"></span>Checking deeper-scan runner…</div>
    </div>`;
    document.getElementById('dd-run')?.addEventListener('click', () => startDeepDive(d));
    updateRunnerPill();
    return;
  }

  if (dd.status === 'error') {
    host.innerHTML = `<div class="dd-cta"><h3>Deep Dive failed</h3><p>${esc(dd.error || 'Something went wrong.')}</p><button class="dd-run" id="dd-run">Try again</button></div>`;
    document.getElementById('dd-run')?.addEventListener('click', () => startDeepDive(d));
    return;
  }

  if (dd.status !== 'done') {
    host.innerHTML = ddProgressHtml(dd.status);
    return;
  }

  const atoms = dd.atoms || [];
  const links = dd.lineage?.links || [];
  const fey = dd.feynman || {};
  const nameById = Object.fromEntries(atoms.map(a => [a.id, a.name]));

  const atomsHtml = atoms.map(a => `<div class="atom-card">
    <div class="atom-head"><span class="atom-name">${esc(a.name)}</span><span class="atom-kind">${esc(a.kind)}</span></div>
    <div class="atom-purpose">${esc(a.purpose)}</div>
    ${a.files?.length ? `<div class="atom-files">${a.files.map(esc).join(' · ')}</div>` : ''}
  </div>`).join('');

  const linksHtml = links.length
    ? links.map(l => `<div class="lin-row">
        <span class="lin-from">${esc(nameById[l.from] || l.from)}</span>
        <span class="lin-rel">${esc(l.relation)}</span>
        <span class="lin-to">${esc(nameById[l.to] || l.to)}</span>
        ${l.why ? `<span class="lin-why">${esc(l.why)}</span>` : ''}
      </div>`).join('')
    : '<p class="atom-purpose">No links identified.</p>';

  const listBlock = (title, items) => items?.length
    ? `<div class="dd-section-title">${title}</div><ul class="dd-list">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '';
  const questionsBlock = fey.questions?.length
    ? `<div class="dd-section-title">Test Yourself</div>${fey.questions.map(q => `<div class="dd-q"><div class="q">${esc(q.q)}</div><div class="a">${esc(q.a)}</div></div>`).join('')}`
    : '';
  const confBlock = fey.confidence?.length
    ? `<div class="dd-section-title">Confidence</div>${fey.confidence.map(c => `<div class="conf-row"><span class="conf-level conf-${esc(c.level)}">${esc(c.level)}</span><span>${esc(c.claim)}${c.note ? ` — <span style="color:var(--text-muted)">${esc(c.note)}</span>` : ''}</span></div>`).join('')}`
    : '';

  host.innerHTML = `
    ${dd.facts ? factsPanel(dd.facts) : ''}
    <div class="dd-section-title first">Atomic Units</div>
    ${atomsHtml}
    <div class="dd-section-title">Causal Lineage</div>
    ${lineageSvg(atoms, links)}
    ${linksHtml}
    <div class="dd-section-title">Feynman Validation</div>
    <p class="dd-explain">${esc(fey.explanation || '')}</p>
    ${listBlock('Gaps', fey.gaps)}
    ${listBlock('Assumptions', fey.assumptions)}
    ${questionsBlock}
    ${confBlock}
  `;
}

// ─── Generic framework-lens shell (chip bar + guidance + primitive body) ──────
// cfg: { tabId, slot, type, title, intro, frameworks:[{key,label,blurb}], bodyFor(fw,result) }
function renderFrameworkLens(d, cfg) {
  const host = document.getElementById('t' + cfg.tabId);
  if (!host) return;
  const lens = d[cfg.slot] || emptyLens();
  const active = lens.active || '';
  const run = runOf(lens, active);

  const chip = (f) => {
    const r = runOf(lens, f.key);
    const cls = !r ? 'todo'
      : r.status === 'error' ? 'err'
      : r.status === 'done' ? 'done'
      : 'busy';
    const actCls = f.key === active ? ' active' : '';
    const mark = r?.status === 'done' ? '✓ ' : r?.status === 'error' ? '✕ ' : '';
    const tail = !r ? ' +' : '';
    return `<button class="lens-chip ${cls}${actCls}" data-fw="${f.key}" title="${esc(f.blurb)}">${mark}${esc(f.label)}${tail}</button>`;
  };
  const unrun = cfg.frameworks.filter(f => !runOf(lens, f.key)).map(f => f.key);
  const runAll = unrun.length > 1 ? `<button class="lens-chip runall" data-runall="1">▶ Run all</button>` : '';
  const chipBar = `<div class="lens-chips">${cfg.frameworks.map(chip).join('')}${runAll}</div>`;

  const g = guideFor(active);
  const guide = g ? `<details class="lens-guide"><summary>How to use · Common misconceptions</summary>
    <div class="lens-guide-grid">
      <div class="lens-guide-col"><div class="lens-guide-h use">How to use it</div><div style="font-size:12px;color:var(--text-sub);line-height:1.5">${esc(g.howToUse)}</div></div>
      <div class="lens-guide-col"><div class="lens-guide-h mis">Common misconceptions</div><ul>${g.misconceptions.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>
    </div></details>` : '';

  let body;
  if (!active || !run) {
    body = `<div class="dd-cta"><h3>${esc(cfg.title)}</h3><p>${esc(cfg.intro)}</p></div>`;
  } else if (run.status === 'error') {
    body = `<div class="dd-cta"><h3>${esc(cfg.title)} failed</h3><p>${esc(run.error || 'Something went wrong.')}</p><button class="lens-chip" data-fw="${esc(active)}">Try again</button></div>`;
  } else if (run.status !== 'done') {
    const label = cfg.frameworks.find(f => f.key === active)?.label || 'framework';
    body = `<div class="dd-progress"><span class="dot"></span>Working — ${esc(label)}…</div>`;
  } else {
    body = cfg.bodyFor(active, run.result || {});
  }

  host.innerHTML = chipBar + guide + `<div class="lens-body">${body}</div>`;

  host.querySelectorAll('.lens-chip[data-fw]').forEach(c => c.addEventListener('click', () => {
    const fw = c.dataset.fw;
    const existing = runOf(lens, fw);
    if (existing && existing.status === 'done') {
      renderFrameworkLens({ ...d, [cfg.slot]: { ...lens, active: fw } }, cfg); // view it locally
    } else {
      chrome.runtime.sendMessage({ type: cfg.type, sessionKey, platform: d.platform, repoId: d.repoId, frameworks: [fw] });
    }
  }));
  host.querySelector('.lens-chip[data-runall]')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: cfg.type, sessionKey, platform: d.platform, repoId: d.repoId, frameworks: unrun });
  });
}

const SCAMPER_INITIAL = { 'Put to another use': 'P' };
const ideaBody = (fw, r) => {
  if (fw === 'scamper') return spine((r.items || []).map(i => ({ marker: SCAMPER_INITIAL[i.lens] || (i.lens || '?')[0], label: i.lens, body: i.idea })));
  if (fw === 'lateral') return flow([
    { label: 'Provocation', body: r.provocation },
    { label: 'The Leap', body: r.leap },
    ...(r.ideas || []).map((x, i) => ({ label: `Radical idea ${i + 1}`, body: x })),
  ]);
  if (fw === 'morph') return optionMatrix(r.dimensions, r.combinations);
  // triz
  const header = `<div class="lk-flow-node lk-bottleneck"><div class="lk-flow-label">Contradiction</div><div class="lk-flow-body">Improve ${esc(r.contradiction?.improving || '')} — without worsening ${esc(r.contradiction?.worsening || '')}</div></div>`;
  return header + spine((r.principles || []).map(p => ({ marker: '#' + (p.number ?? ''), label: p.name, body: p.application })))
    + (r.idea ? `<div class="lk-flow-note" style="margin-top:10px">Resolution: ${esc(r.idea)}</div>` : '');
};

const sysBody = (fw, r) => {
  if (fw === 'pdca') return flow([
    { label: 'Plan', body: r.plan }, { label: 'Do', body: r.do }, { label: 'Check', body: r.check }, { label: 'Act', body: r.act },
  ]);
  if (fw === 'dmaic') return spine([
    { marker: 'D', label: 'Define', body: r.define },
    { marker: 'M', label: 'Measure', body: (r.measure || []).join(' · ') },
    { marker: 'A', label: 'Analyze', body: r.analyze },
    { marker: 'I', label: 'Improve', body: (r.improve || []).join(' · ') },
    { marker: 'C', label: 'Control', body: (r.control || []).join(' · ') },
  ]);
  if (fw === 'loops') {
    return (r.loops || []).map(l => `<div class="loop-card ${l.type === 'balancing' ? 'balancing' : 'reinforcing'}">
      <div class="loop-head"><span class="loop-name">${esc(l.name)}</span><span class="loop-type">${esc(l.type)}</span></div>
      ${loopSvg(l.cycle, l.type)}
      <div class="loop-cycle">${(l.cycle || []).map(esc).join(' → ')}${l.cycle?.length ? ' ↺' : ''}</div>
      <div class="loop-effect">${esc(l.effect)}</div></div>`).join('') || '<p class="atom-purpose">No loops identified.</p>';
  }
  // toc
  return flow([
    { label: 'The Constraint', body: `${r.bottleneck?.name || ''} — ${r.bottleneck?.why || ''}`, kind: 'bottleneck' },
    { label: 'Exploit it', body: (r.exploit || []).join(' · ') },
    { label: 'Then, the next constraint', body: `${r.next_bottleneck?.name || ''} — ${r.next_bottleneck?.why || ''}` },
  ]);
};

const PCT = (s) => { const m = String(s || '').match(/(\d+)/); return m ? Number(m[1]) : 0; };
const priBody = (fw, r) => {
  if (fw === 'eisenhower') return matrix2x2({
    axes: { x: 'Urgent →' },
    cells: [
      { label: 'Do', sub: 'Important · Urgent', items: r.do },
      { label: 'Schedule', sub: 'Important · Not urgent', items: r.schedule },
      { label: 'Delegate', sub: 'Urgent · Not important', items: r.delegate },
      { label: 'Eliminate', sub: 'Neither', items: r.eliminate },
    ],
  });
  // pareto
  return ranked((r.vital_few || []).map(v => ({ label: v.factor, weight: PCT(v.share), body: v.impact })))
    + (r.trivial_many ? `<div class="lk-flow-note" style="margin-top:10px">The trivial many: ${esc(r.trivial_many)}</div>` : '');
};

const SYSTEMS_CFG = { tabId: 11, slot: 'systems', type: 'SYSTEMS', title: 'Systems Analysis',
  intro: 'View the repo as a system in motion. Pick a framework chip to run it — each is its own report. Run as many as you like.',
  frameworks: SYSTEMS_FRAMEWORKS, bodyFor: sysBody };
const IDEATE_CFG = { tabId: 12, slot: 'ideate', type: 'IDEATE', title: 'Creative Generation',
  intro: 'Invent features or bypass a constraint. Pick a framework chip to run it — each is its own set of ideas. Run as many as you like.',
  frameworks: IDEATE_FRAMEWORKS, bodyFor: ideaBody };
const PRIORITIZE_CFG = { tabId: 13, slot: 'prioritize', type: 'PRIORITIZE', title: 'Prioritization',
  intro: "Decide what's even worth solving. Pick a heuristic chip to run it — each is its own triage. Run as many as you like.",
  frameworks: HEURISTICS_FRAMEWORKS, bodyFor: priBody };

// ─── SKTPG — one-tap directional-intelligence skill (on by default) ───────────

let sktpgEnabled = true; // overridden from chrome.storage.local below; default ON
let lastData = null;     // most recent session data, for Run-all + keyboard

function applySktpgVisibility() {
  const btn = document.getElementById('tab-sktpg');
  if (btn) btn.style.display = sktpgEnabled ? '' : 'none';
}
chrome.storage.local.get('sktpgEnabled', ({ sktpgEnabled: e }) => {
  sktpgEnabled = e !== false; // undefined (fresh install) → on
  applySktpgVisibility();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'sktpgEnabled' in changes) {
    sktpgEnabled = changes.sktpgEnabled.newValue !== false;
    applySktpgVisibility();
  }
});

function startSktpg(d) {
  chrome.runtime.sendMessage({ type: 'SKTPG', sessionKey, platform: d.platform, repoId: d.repoId });
  renderSktpg({ ...d, sktpg: { status: 'fetching' } }); // optimistic
}

function renderSktpg(d) {
  applySktpgVisibility();
  const host = document.getElementById('t14');
  if (!host) return;
  if (!sktpgEnabled) { host.innerHTML = ''; return; }
  const sk = d.sktpg;

  if (!sk || !sk.status) {
    host.innerHTML = `<div class="dd-cta">
      <h3>SKTPG — Directional Intelligence</h3>
      <p>Skate where the puck is going. Reads this repo for where it's <i>heading</i>: a reference-class base rate, weak signals, hype vs real motion, the bottleneck shift, a 6–18 month forecast, a pre-mortem, and what to do before consensus.</p>
      <button class="dd-run" id="sk-run">Run SKTPG</button>
    </div>`;
    document.getElementById('sk-run')?.addEventListener('click', () => startSktpg(d));
    return;
  }

  if (sk.status === 'error') {
    host.innerHTML = `<div class="dd-cta"><h3>SKTPG failed</h3><p>${esc(sk.error || 'Something went wrong.')}</p><button class="dd-run" id="sk-run">Try again</button></div>`;
    document.getElementById('sk-run')?.addEventListener('click', () => startSktpg(d));
    return;
  }

  if (sk.status !== 'done') {
    host.innerHTML = `<div class="dd-progress"><span class="dot"></span>Reading the signals — SKTPG…</div>`;
    return;
  }

  host.innerHTML = renderSktpgResult(sk.result || {});
}

const BAND_COLOR = { Noise: '#7e7e7e', Interesting: '#60a5fa', Watchlist: '#fbbf24', Actionable: '#4ade80', Urgent: '#f87171' };

function renderSktpgResult(r) {
  const ev = (lvl) => `<span class="ev ev-${String(lvl || 'unknown').toLowerCase()}">${esc(lvl || 'Unknown')}</span>`;
  const t = r.thesis || {}, sc = r.score || { value: 0, band: 'Noise' };
  const color = BAND_COLOR[sc.band] || 'var(--accent)';
  const br = r.base_rate || {}, bn = r.bottleneck || {}, fc = r.forecast || {};
  const fcard = (step, txt) => `<div class="pdca-card"><div class="step">${step}</div><div class="txt">${esc(txt || '')}</div></div>`;
  const section = (title, html) => html ? `<div class="dd-section-title">${title}</div>${html}` : '';

  const weak = (r.weak_signals || []).map(w => `<div class="sk-row"><span class="main">${esc(w.signal)}</span>${ev(w.evidence)}<span class="sub">${esc(w.why)}${w.forces_next ? ` → <i>${esc(w.forces_next)}</i>` : ''}</span></div>`).join('');
  const hype = (r.hype_vs_motion || []).map(h => `<div class="sk-row"><span class="idea-badge">${esc(h.verdict)}</span><span class="main">${esc(h.claim)}</span><span class="sub">${esc(h.evidence)}</span></div>`).join('');
  const obvious = (r.becomes_obvious || []).length ? `<ul class="dd-list">${r.becomes_obvious.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const actions = (r.actions || []).map(a => `<div class="sk-row"><span class="idea-badge">${esc(a.timeframe)}</span><span class="main">${esc(a.action)}</span><span class="sub">${esc(a.why_now)}</span></div>`).join('');
  const premortem = (r.premortem || []).map(p => `<div class="sk-row"><span class="flag-pill ${p.survives ? 'green' : 'red'}">${p.survives ? 'survives' : 'unaddressed'}</span><span class="main">${esc(p.kill_path)}</span><span class="sub">Likelihood: ${esc(p.likelihood)}</span></div>`).join('');
  const tracking = (r.tracking || []).map(t2 => `<div class="sk-row"><span class="flag-pill ${esc(t2.flag)}">${esc(t2.flag)}</span><span class="main">${esc(t2.signal)}</span><span class="sub">${esc(t2.why)}</span></div>`).join('');

  return `
    <div class="sktpg-thesis">
      ${t.becoming ? `<div class="line"><b>This is becoming:</b> ${esc(t.becoming)}</div>` : ''}
      ${t.forced_next ? `<div class="line"><b>Forces next:</b> ${esc(t.forced_next)}</div>` : ''}
      ${t.opportunity ? `<div class="line"><b>Non-obvious opportunity:</b> ${esc(t.opportunity)}</div>` : ''}
      ${t.before_consensus ? `<div class="line"><b>Do before consensus:</b> ${esc(t.before_consensus)}</div>` : ''}
      ${t.wrong_if ? `<div class="line"><b>Wrong if:</b> ${esc(t.wrong_if)}</div>` : ''}
    </div>
    <div class="score-wrap">
      <span class="score-num">${sc.value}</span>
      <div class="score-track"><div class="score-fill" style="width:${sc.value}%;background:${color}"></div></div>
      <span class="score-band" style="color:${color};border:1px solid ${color}55">${esc(sc.band)}</span>
    </div>
    <div class="dd-section-title">Reference Class & Base Rate</div>
    <div class="sys-bottleneck"><div class="name">${esc(br.reference_class)} ${ev(br.evidence)}</div><div class="why">Base rate: ${esc(br.rate)} · Starting prior: ${esc(br.prior)} · Usual cause of death: ${esc(br.cause_of_death)}</div></div>
    ${section('Weak Signals', weak)}
    ${section('Hype vs Real Motion', hype)}
    <div class="dd-section-title">Bottleneck Shift</div>
    <div class="sys-bottleneck"><div class="name">Now: ${esc(bn.current)}</div><div class="why">Weakening: ${esc(bn.weakening)} · Next bottleneck: ${esc(bn.next)} · Who profits: ${esc(bn.who_profits)}</div></div>
    <div class="dd-section-title">6–18 Month Forecast</div>
    <div class="pdca-grid">${fcard('Base case', fc.base)}${fcard('Bull case', fc.bull)}${fcard('Bear case', fc.bear)}${fcard('Wild card', fc.wildcard)}</div>
    ${section('What Becomes Obvious Later', obvious)}
    ${section('Action Map', actions)}
    ${section('Pre-mortem — Kill-paths', premortem)}
    ${section('Tracking Signals', tracking)}
  `;
}

// ─── Docs Quality — on-demand documentation score ────────────────────────────

function startDocsQuality(d) {
  chrome.runtime.sendMessage({ type: 'DOCS_QUALITY', sessionKey, platform: d.platform, repoId: d.repoId });
  renderDocsQuality({ ...d, docsQuality: { status: 'fetching' } });
}

function renderDocsQuality(d) {
  const host = document.getElementById('t21');
  if (!host) return;
  const dq = d.docsQuality;

  if (!dq) {
    host.innerHTML = `<div class="dd-cta">
      <h3>Docs Quality</h3>
      <p>Score this repo's documentation: README completeness, quickstart, code examples, API reference, changelog, and contributing guide. Answers: "can I use this without reading the source?"</p>
      <button class="dd-run" id="dq-run">Run Docs Quality</button>
    </div>`;
    document.getElementById('dq-run')?.addEventListener('click', () => startDocsQuality(d));
    return;
  }

  if (dq.status === 'error') {
    host.innerHTML = `<div class="dd-cta"><h3>Docs Quality failed</h3><p>${esc(dq.error || 'Something went wrong.')}</p><button class="dd-run" id="dq-run">Try again</button></div>`;
    document.getElementById('dq-run')?.addEventListener('click', () => startDocsQuality(d));
    return;
  }

  if (dq.status !== 'done') {
    host.innerHTML = `<div class="dd-progress"><span class="dot"></span>Scoring the documentation…</div>`;
    return;
  }

  host.innerHTML = renderDocsQualityResult(dq.result || {});
}

function renderDocsQualityResult(r) {
  const grade = DOCS_GRADES.includes(r.grade) ? r.grade : 'F';
  const score = Math.max(0, Math.min(100, Math.round(r.score || 0)));
  const verdict = r.overall_verdict || 'no';
  const verdictLabel = { yes: '✓ Usable without source', partially: '~ Partially self-documenting', no: '✗ Requires reading the source' }[verdict] || verdict;

  const barColor = (s) => {
    if (s >= 75) return 'var(--ok)';
    if (s >= 50) return 'var(--warn)';
    return 'var(--bad)';
  };

  const sections = (r.sections || []).map(s => `
    <div class="dq-section-row">
      <div class="dq-section-name">${esc(s.name)}</div>
      <div class="dq-bar-track"><div class="dq-bar-fill" style="width:${s.score}%;background:${barColor(s.score)}"></div></div>
      <div class="dq-section-score">${s.score}</div>
    </div>
    ${s.verdict ? `<div class="dq-section-verdict">${esc(s.verdict)}</div>` : ''}
  `).join('');

  const strengths = (r.strengths || []).length
    ? `<ul>${r.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '<p style="color:var(--text-muted);font-size:12px">—</p>';

  const gaps = (r.gaps || []).length
    ? `<ul>${r.gaps.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '<p style="color:var(--text-muted);font-size:12px">—</p>';

  return `
    <div class="dq-header">
      <div class="dq-grade ${grade}">${esc(grade)}</div>
      <div class="dq-meta">
        <div class="dq-score-line">${score} / 100</div>
        <span class="dq-verdict-chip ${verdict}">${esc(verdictLabel)}</span>
      </div>
    </div>
    ${r.summary ? `<p class="dq-summary">${esc(r.summary)}</p>` : ''}
    <div class="dd-section-title first">Section breakdown</div>
    ${sections}
    <div class="dq-lists">
      <div class="dq-list-card">
        <div class="dq-list-title strengths">Strengths</div>
        ${strengths}
      </div>
      <div class="dq-list-card">
        <div class="dq-list-title gaps">Gaps</div>
        ${gaps}
      </div>
    </div>
  `;
}

// ─── Maintenance & Abandonment — on-demand health scan ───────────────────────

function startMaintenance(d) {
  chrome.runtime.sendMessage({ type: 'MAINTENANCE', sessionKey, platform: d.platform, repoId: d.repoId });
  renderMaintenance({ ...d, maintenance: { status: 'fetching' } });
}

function renderMaintenance(d) {
  const host = document.getElementById('t22');
  if (!host) return;
  const m = d.maintenance;

  if (!m) {
    host.innerHTML = `<div class="dd-cta">
      <h3>Maintenance Health</h3>
      <p>Check commit recency, contributor bus-factor, CI presence, and open-issue trends — signals a README can't fake. Returns: Active / Slowing / Stale / Abandoned.</p>
      <button class="dd-run" id="maint-run">Run Maintenance Scan</button>
    </div>`;
    document.getElementById('maint-run')?.addEventListener('click', () => startMaintenance(d));
    return;
  }

  if (m.status === 'error') {
    host.innerHTML = `<div class="dd-cta"><h3>Maintenance scan failed</h3><p>${esc(m.error || 'Something went wrong.')}</p><button class="dd-run" id="maint-run">Try again</button></div>`;
    document.getElementById('maint-run')?.addEventListener('click', () => startMaintenance(d));
    return;
  }

  if (m.status !== 'done') {
    host.innerHTML = `<div class="dd-progress"><span class="dot"></span>Checking maintenance signals…</div>`;
    return;
  }

  host.innerHTML = renderMaintenanceResult(m.result || {});
}

function renderMaintenanceResult(r) {
  const band = MAINT_BANDS.includes(r.band) ? r.band : 'unknown';
  const bandLabel = { active: 'Active', slowing: 'Slowing', stale: 'Stale', abandoned: 'Abandoned', unknown: 'Unknown' }[band] || band;
  const busFactor = BUS_FACTORS.includes(r.bus_factor) ? r.bus_factor : 'unknown';
  const busLabel = { safe: '✓ Safe bus factor', concentrated: '⚠ Concentrated', solo: '⚠ Solo maintainer', unknown: 'Bus factor unknown' }[busFactor] || busFactor;
  const days = r.days_since_push != null ? `${r.days_since_push}d since last push` : '';

  const watchItems = (r.watch_list || []).map(w =>
    `<div class="maint-watch-item"><span class="maint-watch-icon">⚠</span><span>${esc(w)}</span></div>`
  ).join('');

  return `
    <div class="maint-header">
      <span class="maint-band ${band}">${esc(bandLabel)}</span>
      <span class="maint-bus">${esc(busLabel)}</span>
      ${days ? `<span class="maint-days">${esc(days)}</span>` : ''}
    </div>
    ${r.summary ? `<p class="maint-summary">${esc(r.summary)}</p>` : ''}
    ${watchItems ? `<div class="maint-watch-title">Watch list</div>${watchItems}` : ''}
  `;
}

// ─── License Compatibility — instant deterministic SPDX check ─────────────────

function renderLicenseCompat(d) {
  const host = document.getElementById('t23');
  if (!host) return;

  const currentLicense = d.license || 'Unknown';
  const bucket = bucketFor(currentLicense);

  host.innerHTML = `<div class="dd-progress"><span class="dot"></span>Checking your library…</div>`;

  allLicenses().then((libraryRepos) => {
    const { currentBucket, concerns, summary, totalChecked } = checkLibraryCompat(currentLicense, libraryRepos);

    const statusIcon = (s) => s === 'conflict' ? '✗' : '⚠';

    const concernRows = concerns.map(c => `
      <div class="lc-concern-row">
        <div class="lc-concern-status" style="color:${c.status === 'conflict' ? 'var(--bad-ink)' : 'var(--warn-ink)'}">${statusIcon(c.status)}</div>
        <div class="lc-concern-body">
          <div class="lc-concern-repo">${esc(c.repoId)}</div>
          <div class="lc-concern-lic">${esc(c.license)}</div>
          <div class="lc-concern-note">${esc(c.note)}</div>
        </div>
      </div>`).join('');

    const noIssues = !concerns.length && totalChecked > 0
      ? `<p class="lc-all-ok">✓ ${esc(currentLicense)} is compatible with all ${totalChecked} library repo${totalChecked === 1 ? '' : 's'} with known licenses.</p>`
      : '';

    host.innerHTML = `
      <div class="lc-compat-header">
        <span class="lc-bucket-chip ${currentBucket}">${esc(currentLicense)}</span>
        <span style="font-size:13px;color:var(--text-sub)">${esc(bucketLabel(currentBucket))}</span>
      </div>
      <p class="lc-compat-summary">${esc(summary)}</p>
      ${noIssues}
      ${concernRows}
      ${totalChecked === 0 ? '<p style="color:var(--text-muted);font-size:12px">No repos with known licenses in your library yet — scan a few repos first.</p>' : ''}
    `;
  }).catch(() => {
    host.innerHTML = `<p style="color:var(--text-muted)">Could not load library licenses.</p>`;
  });
}

// ─── Diff Since I Last Looked — zero-token snapshot comparison ───────────────

function renderDiff(d) {
  const host = document.getElementById('t24');
  if (!host) return;
  const diff = d.diff;

  if (!diff) {
    host.innerHTML = `<div class="diff-first-scan">
      <p class="diff-first-icon">📸</p>
      <p class="diff-first-title">Snapshot saved</p>
      <p class="diff-first-body">Next time you scan this repo, RepoLens will diff fit score, health, stars, and flags against this baseline — so you can see what changed at a glance.</p>
      <button class="diff-rescan-btn" id="diff-rescan-now">Rescan now →</button>
    </div>`;
    document.getElementById('diff-rescan-now')?.addEventListener('click', async () => {
      if (!lastData) return;
      try { await chrome.runtime.sendMessage({ type: 'RERUN', sessionKey, platform: lastData.platform, repoId: lastData.repoId }); }
      catch { /* reload anyway */ }
      location.reload();
    });
    return;
  }

  const age = diff.days_since_prev != null
    ? `<span class="diff-age">Compared to your scan ${diff.days_since_prev === 0 ? 'today' : diff.days_since_prev === 1 ? 'yesterday' : `${diff.days_since_prev} days ago`}</span>`
    : '';

  const badge = (dir, text) =>
    `<span class="diff-badge ${dir}">${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='} ${esc(String(text))}</span>`;

  const starRow = (() => {
    const { before, after, delta, direction } = diff.star_delta;
    const sign = direction === 'up' ? '+' : '';
    return `<div class="diff-row">
      <div class="diff-label">Stars</div>
      <div class="diff-delta">${before.toLocaleString()} → ${after.toLocaleString()}</div>
      ${badge(direction, sign + delta.toLocaleString())}
    </div>`;
  })();

  const healthRow = (() => {
    const { before, after, delta, direction } = diff.health_delta;
    const sign = direction === 'up' ? '+' : '';
    if (before === 0 && after === 0) return '';
    return `<div class="diff-row">
      <div class="diff-label">Health score</div>
      <div class="diff-delta">${before} → ${after}</div>
      ${badge(direction, sign + delta)}
    </div>`;
  })();

  const fitRow = (() => {
    const { before, after, changed, direction } = diff.fit_delta;
    if (!before || !before) return '';
    const label = { strong: 'Strong fit', solid: 'Solid', care: 'Use with care', risky: 'Risky' };
    return `<div class="diff-row">
      <div class="diff-label">Verdict</div>
      <div class="diff-delta">${esc(label[before] || before)} → ${esc(label[after] || after)}</div>
      ${changed ? badge(direction, direction === 'up' ? 'Improved' : 'Declined') : badge('same', 'No change')}
    </div>`;
  })();

  const versionRow = (() => {
    if (!diff.version_delta || !diff.version_delta.changed) return '';
    const { before, after } = diff.version_delta;
    return `<div class="diff-row">
      <div class="diff-label">Version</div>
      <div class="diff-delta">${esc(before || '—')} → ${esc(after || '—')}</div>
      ${badge('up', 'Bumped')}
    </div>`;
  })();

  const newFlagsHtml = diff.new_flags.length
    ? `<div class="diff-flags">
        <div class="section-title" style="margin-bottom:10px">New flags since last scan</div>
        ${diff.new_flags.map(t => `<div class="diff-flag-row"><span class="diff-flag-sign">⚠</span><span style="color:var(--bad-ink);font-size:13px">${esc(t)}</span></div>`).join('')}
      </div>` : '';

  const removedFlagsHtml = diff.removed_flags.length
    ? `<div class="diff-flags">
        <div class="section-title" style="margin-bottom:10px">Flags resolved since last scan</div>
        ${diff.removed_flags.map(t => `<div class="diff-flag-row"><span class="diff-flag-sign">✓</span><span style="color:var(--ok-ink);font-size:13px">${esc(t)}</span></div>`).join('')}
      </div>` : '';

  host.innerHTML = `
    <div class="diff-header">
      <div class="section-title" style="margin:0">Since I Last Looked</div>
      ${age}
    </div>
    ${starRow}${healthRow}${fitRow}${versionRow}
    ${newFlagsHtml}${removedFlagsHtml}
    ${!diff.new_flags.length && !diff.removed_flags.length ? '<p style="font-size:12px;color:var(--text-muted);margin-top:16px">No flag changes between scans.</p>' : ''}
  `;
}

// ─── Fits MY Stack? — library-grounded fit verdict ────────────────────────────

function startFitsStack(d) {
  chrome.runtime.sendMessage({ type: 'FITS_STACK', sessionKey, platform: d.platform, repoId: d.repoId });
  renderFitsStack({ ...d, fitsStack: { status: 'fetching' } });
}

function renderFitsStack(d) {
  const host = document.getElementById('t25');
  if (!host) return;
  const fs = d.fitsStack;

  if (!fs) {
    host.innerHTML = `<div class="dd-cta">
      <h3>Fits MY Stack?</h3>
      <p>Checks whether this repo slots in naturally, introduces a paradigm shift, or conflicts with what you already use — grounded in your library's actual tools and patterns.</p>
      <button class="dd-run" id="fs-run">Run Fits MY Stack?</button>
    </div>`;
    document.getElementById('fs-run')?.addEventListener('click', () => startFitsStack(d));
    return;
  }

  if (fs.status === 'error') {
    host.innerHTML = `<div class="dd-cta"><h3>Analysis failed</h3><p>${esc(fs.error || 'Something went wrong.')}</p><button class="dd-run" id="fs-run">Try again</button></div>`;
    document.getElementById('fs-run')?.addEventListener('click', () => startFitsStack(d));
    return;
  }

  if (fs.status !== 'done') {
    host.innerHTML = `<div class="dd-progress"><span class="dot"></span>Checking your library for context…</div>`;
    return;
  }

  host.innerHTML = renderFitsStackResult(fs.result || {});
}

function renderFitsStackResult(r) {
  const verdict = FITS_VERDICTS.includes(r.verdict) ? r.verdict : 'new-paradigm';
  const verdictLabel = { 'slots-in': '✓ Slots in', 'new-paradigm': '⟳ New paradigm', 'conflict': '✗ Conflict' }[verdict] || verdict;

  const integrations = (r.integrations || []).length
    ? `<div class="fs-section">How it interacts with your stack</div><ul class="fs-list">${r.integrations.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '';

  const risks = (r.risks || []).length
    ? `<div class="fs-section">Risks &amp; friction</div><ul class="fs-list">${r.risks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '';

  const rec = r.recommendation
    ? `<div class="fs-recommendation">${esc(r.recommendation)}</div>`
    : '';

  return `
    <span class="fs-verdict-chip ${verdict}">${esc(verdictLabel)}</span>
    <p class="fs-summary">${esc(r.summary || '')}</p>
    ${integrations}
    ${risks}
    ${rec}
  `;
}

// ─── Versus — head-to-head comparison tab ─────────────────────────────────────

function startVersus(d, competitor) {
  const c = (competitor || '').trim();
  if (!c) return;
  chrome.runtime.sendMessage({ type: 'VERSUS', sessionKey, platform: d.platform, repoId: d.repoId, competitor: c });
  renderVersus({ ...d, versus: { status: 'fetching', a: d.repoId, b: c } }); // optimistic
}

async function loadVersusChips(d) {
  const host = document.getElementById('vs-chips');
  if (!host) return;
  let similar = [];
  try { similar = await findSimilar(d); } catch { /* empty */ }
  if (!similar.length) return;
  host.innerHTML = `<span style="color:var(--text-muted);font-size:11px;align-self:center">from your library:</span>` +
    similar.map(s => `<span class="vs-chip" data-repo="${esc(s.repoId)}">${esc(s.repoId)}</span>`).join('');
  host.querySelectorAll('.vs-chip').forEach(c => c.addEventListener('click', () => {
    const input = document.getElementById('vs-input');
    if (input) input.value = c.dataset.repo;
  }));
}

// ─── Ask This Repo ─────────────────────────────────────────────────────────────

function getAskSuggestions(d) {
  const sugs = [];
  // Context-specific first
  if (d.alternatives?.length) {
    const alt = d.alternatives[0];
    const altName = (alt.name || alt).toString().split('/').pop();
    sugs.push(`How does this compare to ${altName}?`);
  }
  if (d.red_flags?.length) sugs.push('What are the main risks of using this?');
  if (d.health?.score != null && d.health.score < 65) sugs.push('Is the project still actively maintained?');
  if (d.license && d.license !== 'Unknown') sugs.push(`What restrictions does the ${d.license} license impose?`);
  if (d.capabilities?.length) sugs.push(`Does it support ${d.capabilities[0]}?`);
  if (d.language && d.language !== 'Unknown') sugs.push(`Is the code idiomatic ${d.language}?`);
  // Universal fallbacks
  sugs.push('What are the main trade-offs?');
  sugs.push('How hard is it to integrate into an existing project?');
  sugs.push('Is it production-ready?');
  sugs.push('What is the learning curve like?');
  sugs.push('Does it have good documentation?');
  // Deduplicate and cap
  return [...new Set(sugs)].slice(0, 6);
}

async function renderAskRepo(d) {
  const host = document.getElementById('t26');
  if (!host) return;
  const ask = d.askRepo || {};
  let history = ask.history || [];
  const pending = ask.pending;

  // Load persisted history when session is fresh (no history yet, no pending)
  if (!history.length && !pending && d.repoId) {
    try {
      const stored = await chrome.storage.local.get(`repolens_ask_${d.repoId}`);
      history = stored[`repolens_ask_${d.repoId}`] || [];
    } catch (_) {}
  }

  const historyHtml = history.map(({ question, answer }) => `
    <div class="ask-qa">
      <div class="ask-q">Q: <span>${esc(question)}</span></div>
      <div class="ask-a">${esc(answer)}</div>
    </div>`).join('');

  const pendingHtml = pending ? `
    <div class="ask-qa">
      <div class="ask-q">Q: <span>${esc(pending.question || '')}</span></div>
      <div class="ask-a${pending.status === 'thinking' ? ' thinking' : pending.status === 'error' ? ' error' : ''}">
        ${pending.status === 'thinking' ? 'Thinking…' : pending.status === 'error' ? esc(pending.error || 'Something went wrong') : esc(pending.answer || '')}
      </div>
    </div>` : '';

  const asked = new Set(history.map(({ question }) => question));
  const availableSugs = getAskSuggestions(d).filter((s) => !asked.has(s));
  const sugsHtml = !pending && availableSugs.length
    ? `<div class="ask-suggestions">${availableSugs.slice(0, history.length ? 3 : 6).map((s) => `<button class="ask-sug">${esc(s)}</button>`).join('')}</div>`
    : '';

  const isThinking = pending?.status === 'thinking';
  const clearBtn = history.length && !pending
    ? `<button class="ask-clear" id="ask-clear" title="Clear ask history">Clear history</button>`
    : '';

  host.innerHTML = `<div class="ask-wrap">
    <p class="ask-intro">Ask a specific question about <b>${esc(d.repoId || 'this repo')}</b>. Answers use the loaded analysis as context. ${clearBtn}</p>
    <div class="ask-row">
      <textarea class="ask-input" id="ask-input" rows="1" placeholder="e.g. Does it support GraphQL?"${isThinking ? ' disabled' : ''}></textarea>
      <button class="ask-send" id="ask-send"${isThinking ? ' disabled' : ''}>Ask</button>
    </div>
    ${sugsHtml}
    ${historyHtml}
    ${pendingHtml}
  </div>`;

  const input = host.querySelector('#ask-input');
  const sendBtn = host.querySelector('#ask-send');

  const doAsk = () => {
    const q = input?.value.trim();
    if (!q || sendBtn?.disabled) return;
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'ASK_REPO', sessionKey, question: q });
  };

  sendBtn?.addEventListener('click', doAsk);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAsk(); }
  });

  document.getElementById('ask-clear')?.addEventListener('click', async () => {
    if (!d.repoId) return;
    await chrome.storage.local.remove(`repolens_ask_${d.repoId}`);
    const stored = await chrome.storage.session.get(sessionKey);
    const cur = stored[sessionKey] || {};
    await chrome.storage.session.set({ [sessionKey]: { ...cur, askRepo: { history: [], pending: null } } });
  });

  if (!isThinking) {
    host.querySelectorAll('.ask-sug').forEach(btn => {
      btn.addEventListener('click', () => {
        if (input) { input.value = btn.textContent; input.focus(); }
      });
    });
    // Scroll last answer into view when a new answer arrives
    if (pendingHtml && pending?.status !== 'thinking') {
      host.querySelector('.ask-qa:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function renderVersus(d) {
  const host = document.getElementById('t17');
  if (!host) return;
  const vs = d.versus;

  if (!vs || !vs.status) {
    host.innerHTML = `<div style="padding:8px 0">
      <h3 style="font-size:20px;font-weight:700;color:var(--text);text-align:center;margin-bottom:10px">Versus — Head to Head</h3>
      <p style="font-size:13px;color:var(--text-sub);line-height:1.6;max-width:540px;margin:0 auto 4px;text-align:center">Put <b>${esc(d.repoId)}</b> up against a competitor. Type a repo (<code>owner/name</code> or a URL), or pick one from your library.</p>
      <div class="vs-chips" id="vs-chips"></div>
      <div class="vs-input-row">
        <input class="vs-input" id="vs-input" placeholder="vuejs/vue   ·   or   https://github.com/owner/repo">
        <button class="dd-run" id="vs-run" style="margin-top:0">Compare</button>
      </div>
    </div>`;
    document.getElementById('vs-run')?.addEventListener('click', () => startVersus(d, document.getElementById('vs-input')?.value));
    document.getElementById('vs-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') startVersus(d, e.target.value); });
    loadVersusChips(d);
    return;
  }

  if (vs.status === 'error') {
    host.innerHTML = `<div class="dd-cta"><h3>Comparison failed</h3><p>${esc(vs.error || 'Something went wrong.')}</p><button class="dd-run" id="vs-retry">Try another</button></div>`;
    document.getElementById('vs-retry')?.addEventListener('click', () => renderVersus({ ...d, versus: null }));
    return;
  }

  if (vs.status !== 'done') {
    host.innerHTML = `<div class="dd-progress"><span class="dot"></span>Comparing ${esc(vs.a || d.repoId)} vs ${esc(vs.b || '…')}…</div>`;
    return;
  }

  host.innerHTML = renderVersusResult(vs, d);
  document.getElementById('vs-again')?.addEventListener('click', () => renderVersus({ ...d, versus: null }));
}

function renderVersusResult(vs, d) {
  const r = vs.result || {};
  const a = esc(vs.a || d.repoId), b = esc(vs.b || 'B');
  const dims = (r.dimensions || []).map(dim => `<div class="vs-row">
    <div class="vs-dim">${esc(dim.label)}</div>
    <div class="vs-cell ${dim.winner === 'a' ? 'win' : ''}">${esc(dim.a)}</div>
    <div class="vs-cell ${dim.winner === 'b' ? 'win' : ''}">${esc(dim.b)}</div>
  </div>`).join('');
  const pickWhen = (label, items) => `<div class="pdca-card"><div class="step">${label}</div>${items?.length ? `<ul class="dd-list">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div style="color:var(--text-muted);font-size:13px">—</div>'}</div>`;
  return `
    <div class="vs-head"><span class="vs-name">${a}</span><span class="vs-vs">VS</span><span class="vs-name">${b}</span>
      <button class="dd-run" id="vs-again" style="margin:0 0 0 auto;padding:6px 12px;font-size:12px">New compare</button></div>
    <div class="vs-row head"><div class="vs-dim"></div><div class="vs-cell">${esc(r.summary_a)}</div><div class="vs-cell">${esc(r.summary_b)}</div></div>
    ${dims}
    <div class="dd-section-title">When to pick which</div>
    <div class="pdca-grid">${pickWhen('Pick ' + a, r.pick_a_when)}${pickWhen('Pick ' + b, r.pick_b_when)}</div>
    ${r.verdict ? `<div class="dd-section-title">Verdict</div><p class="dd-explain">${esc(r.verdict)}</p>` : ''}
  `;
}

// Live-update all on-demand lens tabs as background.js writes to session storage.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes[sessionKey]?.newValue) return;
  const nv = changes[sessionKey].newValue;
  const ov = changes[sessionKey].oldValue || {};
  lastData = nv;
  renderDeepDive(nv);
  renderFrameworkLens(nv, SYSTEMS_CFG);
  renderFrameworkLens(nv, IDEATE_CFG);
  renderFrameworkLens(nv, PRIORITIZE_CFG);
  renderSktpg(nv);
  renderDocsQuality(nv);
  renderMaintenance(nv);
  renderFitsStack(nv);
  renderAskRepo(nv);
  renderVersus(nv);
  renderSynergies(nv);
  renderCombinator(nv);

  // Canvas tab opened before Deep Dive finished shows a "run Deep Dive" CTA; when the
  // atoms it needs now arrive, re-render the open/active Canvas so it builds the
  // Blueprint instead of staying stuck on the CTA. Guarded so it only fires when the
  // tab is active and the host hasn't already mounted (renderCanvas is also idempotent).
  const canvasActive = document.getElementById('t27')?.classList.contains('active');
  const hostMounted = document.querySelector('#t27 .canvas-host')?.dataset.mounted === '1';
  if (canvasActive && !hostMounted && nv.deepDive?.atoms?.length) {
    renderCanvas(nv).catch((err) => console.error('[canvas] refresh failed', err));
  }

  // Tick the Run All Lenses counter when a lens transitions to done.
  if (runAllTotal > 0) {
    const wasDone = (x) => x?.status === 'done';
    const isDone  = (x) => x?.status === 'done';
    const ticked = [
      [nv.deepDive,   ov.deepDive],
      [nv.synergies,  ov.synergies],
      [nv.sktpg,      ov.sktpg],
    ].filter(([n, o]) => isDone(n) && !wasDone(o)).length;
    if (ticked > 0) {
      runAllDone = Math.min(runAllDone + ticked, runAllTotal);
      const el = document.getElementById('lens-progress');
      if (el) el.textContent = runAllDone >= runAllTotal ? '✓' : `${runAllDone}/${runAllTotal}`;
    }
  }
});

function renderHeader(d) {
  const nameEl = document.querySelector('.repo-name');
  nameEl.textContent = d.repoId;
  nameEl.href = repoSourceUrl(d.platform, d.repoId);
  document.querySelector('.repo-desc').textContent = d.description;
  document.querySelector('.health-score').textContent = d.health?.score ?? '—';
  document.querySelector('.health-fill').style.width = `${d.health?.score ?? 0}%`;
  const fitChip = document.getElementById('fit-header-chip');
  if (fitChip) {
    const fit = deriveFit(d);
    fitChip.textContent = fit.label;
    fitChip.className = `fit-header-chip fit-${fit.level}`;
    fitChip.style.display = '';
  }

  const pillContainer = document.querySelector('.meta-pills');
  const starLabel = formatStars(d.stars);
  const pills = [
    d.language,
    starLabel ? `${starLabel} ★` : null,
    d.license,
    d.platform
  ].filter(p => p && p !== 'Unknown');
  pillContainer.innerHTML = pills.map(p => `<span class="pill">${esc(p)}</span>`).join('');

  // Update board button label based on current membership
  listCollections().then((cols) => {
    const btn = document.getElementById('add-to-board');
    if (!btn || !d.repoId) return;
    btn.textContent = cols.some((c) => collectionContains(c, d.repoId)) ? '✓ Board' : '+ Board';
  }).catch(() => {});

  if (d.repoId) updateDecisionBadge(d.repoId);
}

function relativeTimestamp(ts) {
  if (!ts) return '';
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  return mo === 1 ? '1 month ago' : `${mo} months ago`;
}

function applyDecisionBadge(dec) {
  const badge = document.getElementById('decision-badge');
  if (!badge) return;
  if (!dec) { badge.className = 'decision-badge'; return; }
  const meta = DECISION_META[dec.decision];
  if (!meta) { badge.className = 'decision-badge'; return; }
  badge.textContent = meta.label;
  badge.style.cssText = `color:${meta.color};background:${meta.bg};border-color:${meta.border}`;
  badge.title = dec.note ? `Decision: ${meta.label} — ${dec.note}` : `Decision: ${meta.label}`;
  badge.className = 'decision-badge visible';
}

const DECISION_ICONS = { adopt: '✅', trial: '🔬', hold: '⏸', reject: '🚫' };
function applyDecisionPreview(dec) {
  const el = document.getElementById('vd-decision-preview');
  if (!el) return;
  if (!dec) { el.innerHTML = ''; return; }
  const meta = DECISION_META[dec.decision];
  if (!meta) { el.innerHTML = ''; return; }
  const icon = DECISION_ICONS[dec.decision] || '';
  const noteStr = dec.note ? ` — <em>${esc(dec.note)}</em>` : '';
  const timeStr = relativeTimestamp(dec.timestamp);
  el.innerHTML = `<div class="vd-banner vd-${esc(dec.decision)}">
    <span class="vd-bicon">${icon}</span>
    <span class="vd-blabel">Your decision: <strong>${esc(meta.label)}</strong>${noteStr}</span>
    ${timeStr ? `<span class="vd-btime">${esc(timeStr)}</span>` : ''}
  </div>`;
}

function updateDecisionBadge(repoId) {
  getDecision(repoId).then(dec => {
    applyDecisionBadge(dec);
    applyDecisionPreview(dec);
  }).catch(() => { applyDecisionBadge(null); applyDecisionPreview(null); });
}

function verdictDashboard(d) {
  const fit = deriveFit(d);
  const what = esc(d.description || firstSentence(d.eli5) || 'A software project.');
  const line = d.bottom_line
    ? `<div class="v-line"><span class="ai">AI BOTTOM LINE</span>${esc(d.bottom_line)}</div>` : '';

  const langs = (d.languages || []).slice(0, 4)
    .map(l => `<span class="v-lchip" style="background:${langColor(l.name)}">${esc(l.name)} ${l.pct}%</span>`).join(' ');
  const depCount = (d.tech_stack?.key_dependencies?.length) || (d.dependencies?.length) || 0;
  const facts = d.deepDive?.facts;
  const score = d.health?.score ?? 0;
  const scoreWord = score >= 85 ? 'Excellent' : score >= 70 ? 'Healthy' : score > 0 ? 'Mixed' : '—';
  const cells = [
    `<div class="v-fact"><div class="v-k">Health</div><div class="v-v"><span class="v-ring" style="--p:${score}"><i>${score}</i></span>${scoreWord}</div></div>`,
    depCount ? `<div class="v-fact"><div class="v-k">Key deps</div><div class="v-v">${depCount} listed</div></div>` : '',
    langs ? `<div class="v-fact wide"><div class="v-k">Languages</div><div class="v-v">${langs}</div></div>` : '',
    facts ? `<div class="v-fact"><div class="v-k">Tests</div><div class="v-v ${facts.tests?.present ? 'v-ok' : 'v-no'}">${facts.tests?.present ? '✓ present' : '— none'}</div></div>` : '',
    facts ? `<div class="v-fact"><div class="v-k">CI</div><div class="v-v ${facts.ci?.present ? 'v-ok' : 'v-no'}">${facts.ci?.present ? '✓ present' : '— none'}</div></div>` : '',
    d.inputTokensEstimate ? `<div class="v-fact" title="Estimated input tokens sent for the core scan — multiply by your provider's rate for cost"><div class="v-k">Scan size</div><div class="v-v">~${esc(formatTokens(d.inputTokensEstimate))} tok in</div></div>` : '',
  ].filter(Boolean).join('');

  const warns = (d.red_flags || []).filter(f => f && f.severity !== 'ok').slice(0, 3);
  const shown = warns.length ? warns : (d.red_flags || []).filter(f => f && f.severity === 'ok').slice(0, 2);
  const flags = shown.length
    ? `<div class="v-sec">Top flags</div>` + shown.map(f =>
        `<div class="v-flag"><span class="v-fi">${f.severity === 'ok' ? '✅' : '⚠️'}</span><span><b>${esc(f.title)}</b> — ${esc(f.text)}</span></div>`).join('')
    : '';

  const entries = (d.start_here || []).length
    ? `<div class="v-sec">Where to start</div>` + d.start_here.map(e =>
        `<div class="entry-card"><div class="entry-icon">${esc(e.icon)}</div><div><div class="entry-title">${esc(e.title)}</div><div class="entry-desc">${esc(e.desc)}</div><span class="entry-tag">${esc(e.tag)}</span></div></div>`).join('')
    : '';

  const jump = (id, label) => `<button class="v-jump" data-jump="${id}">${label} <span class="arr">→</span></button>`;
  const jumps = `<div class="v-jumps">${jump(7, "Why it's " + (score >= 70 ? 'healthy' : 'mixed'))}${jump(8, 'What to watch')}${jump(6, 'Alternatives')}${jump(10, 'Deep Dive')}</div>`;

  const diff = d.diff;
  const diffCallout = (() => {
    if (!diff) return '';
    const changes = [];
    if (diff.fit_delta?.changed) {
      const arrow = diff.fit_delta.direction === 'up' ? '↑' : '↓';
      changes.push(`fit shifted ${arrow} (${diff.fit_delta.before} → ${diff.fit_delta.after})`);
    }
    if (diff.new_flags?.length) changes.push(`${diff.new_flags.length} new flag${diff.new_flags.length > 1 ? 's' : ''}`);
    if (Math.abs(diff.health_delta?.delta || 0) >= 5) {
      const arrow = diff.health_delta.direction === 'up' ? '+' : '';
      changes.push(`health ${arrow}${diff.health_delta.delta}`);
    }
    if (!changes.length) return '';
    const label = diff.days_since_prev != null
      ? `Since your last scan (${diff.days_since_prev === 0 ? 'today' : diff.days_since_prev === 1 ? 'yesterday' : `${diff.days_since_prev}d ago`})`
      : 'Since last scan';
    return `<div class="v-diff-callout">
      <span class="v-diff-label">${esc(label)}:</span>
      <span class="v-diff-items">${changes.map(esc).join(' · ')}</span>
      <button class="v-jump" data-jump="24" style="margin-left:auto">Full diff <span class="arr">→</span></button>
    </div>`;
  })();

  return `
    <div class="v-top"><button class="v-copy" id="v-copy" title="Copy a text summary of this verdict">⧉ Copy</button><button class="v-share" id="v-share" title="Open a shareable verdict card">⤴ Share</button></div>
    <div id="vd-decision-preview"></div>
    <p class="v-what">${what}</p>
    <div class="v-fit fit-${fit.level}"><span class="v-chip">${esc(fit.label)}</span><span class="v-why">${esc(fit.why)}</span></div>
    ${line}
    <div class="v-facts">${cells}</div>
    ${flags}
    ${entries}
    ${diffCallout}
    ${jumps}
    <div class="v-ask-cta"><span>Have a specific question?</span><button class="v-jump" data-jump="26">Ask This Repo <span class="arr">→</span></button></div>`;
}

function renderTabs(d) {
  const analogies = (d.analogies || []).length
    ? `<div class="section-title" style="margin-top:24px">Think of it like…</div>${d.analogies.map(a => `<div class="analogy">${esc(a)}</div>`).join('')}`
    : '';
  setTabContent(0, `${paras(d.eli5, 'big-text')}${analogies}<div id="library-block"></div>`);

  setTabContent(1, paras(d.technical, 'body-text'));

  setTabContent(2, `<div class="use-grid">
    ${card('#818cf8', 'CORE FIT', d.use_cases?.core_fit)}
    ${card('#818cf8', 'GOOD FIT', d.use_cases?.good_fit)}
    ${card('#4ade80', 'WORKS WELL', d.use_cases?.works_well)}
    ${card('#4ade80', 'LONG TERM', d.use_cases?.long_term)}
  </div>`);

  setTabContent(3, `<div class="use-grid">
    ${card('#f87171', 'OVERKILL', d.skip_if?.overkill)}
    ${card('#f87171', 'WRONG TOOL', d.skip_if?.wrong_tool)}
    ${card('#fbbf24', 'NEEDS CARE', d.skip_if?.needs_care)}
    ${card('#fbbf24', 'CONSIDER', d.skip_if?.consider)}
  </div>`);

  setTabContent(4, paras(d.enables, 'body-text'));

  setTabContent(5, `<div class="pro-con">
    <div class="pro-col"><div class="pro-con-title" style="color:#16a34a">PROS</div><ul>
      ${(d.pros ?? []).map(p => `<li>${esc(p)}</li>`).join('')}
    </ul></div>
    <div class="con-col"><div class="pro-con-title" style="color:#dc2626">CONS</div><ul>
      ${(d.cons ?? []).map(c => `<li>${esc(c)}</li>`).join('')}
    </ul></div>
  </div>`);

  // Alternatives: enrich with "in library" badge and quick-scan button.
  getLibraryIndex().then((libIdx) => {
    const alts = d.alternatives ?? [];
    const host = document.getElementById('t6');
    host.innerHTML = alts.map((a, idx) => {
      const inLib = libIdx.has(a.name);
      const detected = detectPlatform(repoSourceUrl('github', a.name));
      const badge = inLib
        ? `<span class="alt-in-lib">In library</span>`
        : (detected ? `<button class="alt-scan-btn" data-idx="${idx}">Scan →</button>` : `<a class="alt-scan-link" href="${esc(repoSourceUrl('github', a.name))}" target="_blank" rel="noopener">↗ View</a>`);
      return `<div class="alt-row">
        <div class="alt-name">${esc(a.name)}${badge}</div>
        <div class="alt-when">${esc(a.when)}</div>
      </div>`;
    }).join('');

    host.querySelectorAll('.alt-scan-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const a = alts[Number(btn.dataset.idx)];
        if (!a) return;
        const det = detectPlatform(repoSourceUrl('github', a.name));
        if (!det) return;
        btn.disabled = true; btn.textContent = 'Opening…';
        const key = 'repolens_' + crypto.randomUUID();
        try { await chrome.runtime.sendMessage({ type: 'RERUN', sessionKey: key, ...det }); }
        catch { /* bg may be asleep — tab will show loading state */ }
        chrome.tabs.create({ url: chrome.runtime.getURL(`output-tab.html?key=${key}`) });
      });
    });
  });

  const bars = ['commit_activity', 'issue_response', 'pr_merge_rate', 'maintainer_count'];
  const labels = ['Commit activity', 'Issue response', 'PR merge rate', 'Maintainers'];
  setTabContent(7, `
    <div style="margin-bottom:20px">
      <div class="curve-row">
        <div class="curve-label" style="color:#94a3b8">Overall score</div>
        <div class="curve-track"><div class="curve-fill" style="width:${d.health?.score ?? 0}%;background:linear-gradient(90deg,#6d28d9,#2563eb)"></div></div>
        <span style="font-size:11px;color:#818cf8;min-width:30px">${d.health?.score ?? 0}%</span>
      </div>
      ${bars.map((k, i) => `<div class="curve-row">
        <div class="curve-label">${labels[i]}</div>
        <div class="curve-track"><div class="curve-fill" style="width:${d.health?.[k] ?? 0}%;background:#16a34a"></div></div>
        <span style="font-size:11px;color:#4ade80;min-width:30px">${d.health?.[k] ?? 0}%</span>
      </div>`).join('')}
    </div>
    <p class="body-text" style="font-size:12px">${esc(d.health?.summary ?? '')}</p>
  `);

  setTabContent(8, (d.red_flags ?? []).map(f => `
    <div class="flag ${f.severity === 'ok' ? 'ok' : ''}">
      <div class="flag-icon">${f.severity === 'ok' ? '✅' : '⚠️'}</div>
      <div><div class="flag-title">${esc(f.title)}</div><div class="flag-text">${esc(f.text)}</div></div>
    </div>
  `).join(''));

  setTabContent(9, verdictDashboard(d));
  document.querySelectorAll('#t9 .v-jump').forEach(b =>
    b.addEventListener('click', () => show(Number(b.dataset.jump))));
  document.getElementById('v-copy')?.addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(verdictCopyText(d));
      const btn = e.currentTarget;
      const prev = btn.textContent;
      btn.textContent = '✓ Copied';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 1500);
    } catch { /* clipboard unavailable — ignore */ }
  });
  document.getElementById('v-share')?.addEventListener('click', (e) => {
    const fit = deriveFit(d);
    const encoded = encodeShareCard({ ...d, fitLevel: fit.level });
    if (!encoded) return;
    const shareUrl = chrome.runtime.getURL(`share.html#${encoded}`);
    chrome.tabs.create({ url: shareUrl });
  });
  renderDecisionControl(d);
}

// ─── Decision Log control (injected into the verdict tab) ────────────────────

async function renderDecisionControl(d) {
  const host = document.getElementById('t9');
  if (!host || !d.repoId) return;

  // Remove any previous decision block before re-rendering.
  host.querySelector('.dl-block')?.remove();

  const existing = await getDecision(d.repoId).catch(() => null);
  applyDecisionPreview(existing);
  const block = document.createElement('div');
  block.className = 'dl-block';

  const choiceButtons = DECISIONS.map(key => {
    const m = DECISION_META[key];
    const sel = existing?.decision === key ? ` selected-${key}` : '';
    return `<button class="dl-btn${sel}" data-dl="${key}">${esc(m.label)}</button>`;
  }).join('');

  block.innerHTML = `
    <div class="dl-label">My Decision</div>
    <div class="dl-choices">${choiceButtons}</div>
    <textarea class="dl-note" id="dl-note" placeholder="Add a note (optional)…" rows="2">${esc(existing?.note || '')}</textarea>
    <div class="dl-actions">
      <button class="dl-save" id="dl-save">Save</button>
      ${existing ? `<button class="dl-clear" id="dl-clear">Clear</button>` : ''}
      <span class="dl-saved-msg" id="dl-saved-msg"></span>
    </div>
  `;
  host.appendChild(block);

  let selected = existing?.decision || null;

  block.querySelectorAll('.dl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.dl;
      selected = selected === key ? null : key;
      block.querySelectorAll('.dl-btn').forEach(b => {
        DECISIONS.forEach(k => b.classList.remove(`selected-${k}`));
        if (b.dataset.dl === selected) b.classList.add(`selected-${selected}`);
      });
    });
  });

  document.getElementById('dl-save')?.addEventListener('click', async () => {
    if (!selected) return;
    const note = document.getElementById('dl-note')?.value || '';
    try {
      const ts = new Date().toISOString();
      await saveDecision({ repoId: d.repoId, decision: selected, note, timestamp: ts });
      const dec = { repoId: d.repoId, decision: selected, note, timestamp: ts };
      applyDecisionBadge(dec);
      applyDecisionPreview(dec);
      const msg = document.getElementById('dl-saved-msg');
      if (msg) { msg.textContent = '✓ Saved'; setTimeout(() => { msg.textContent = ''; }, 1800); }
      // Offer integration steps for Adopt decisions.
      if (selected === 'adopt' && !block.querySelector('.dl-integrate')) {
        const intDiv = document.createElement('div');
        intDiv.className = 'dl-integrate';
        intDiv.innerHTML = `<button class="dl-integrate-btn" title="Ask AI to generate a quick integration checklist for this repo">✦ Get integration steps</button><div class="dl-integrate-result"></div>`;
        block.appendChild(intDiv);
        intDiv.querySelector('.dl-integrate-btn')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          const result = intDiv.querySelector('.dl-integrate-result');
          btn.disabled = true;
          btn.textContent = 'Generating…';
          try {
            const resp = await chrome.runtime.sendMessage({
              type: 'ASK_CACHED',
              question: `Give me a concise 4–5 step integration checklist for ${d.repoId}. Include install command, minimal config, and the first meaningful usage. Be specific, not generic.`,
              analysis: d,
            });
            if (result) result.textContent = resp?.ok ? resp.answer : (resp?.error || 'Could not generate steps.');
          } catch {
            if (result) result.textContent = 'Could not reach the extension.';
          } finally {
            btn.remove();
          }
        });
      }
      // Ensure Clear button appears after first save.
      if (!block.querySelector('#dl-clear')) {
        const clrBtn = document.createElement('button');
        clrBtn.className = 'dl-clear';
        clrBtn.id = 'dl-clear';
        clrBtn.textContent = 'Clear';
        document.getElementById('dl-actions')?.appendChild(clrBtn);
        clrBtn.addEventListener('click', handleClear);
      }
    } catch { /* best-effort */ }
  });

  async function handleClear() {
    await clearDecision(d.repoId).catch(() => {});
    applyDecisionBadge(null);
    applyDecisionPreview(null);
    selected = null;
    block.querySelectorAll('.dl-btn').forEach(b => DECISIONS.forEach(k => b.classList.remove(`selected-${k}`)));
    const note = document.getElementById('dl-note');
    if (note) note.value = '';
    block.querySelector('#dl-clear')?.remove();
  }
  block.querySelector('#dl-clear')?.addEventListener('click', handleClear);
}

function card(color, label, text) {
  return `<div class="use-card">
    <div class="use-card-label" style="color:${color}">${label}</div>
    <div class="use-card-text">${esc(text ?? '')}</div>
  </div>`;
}


function setTabContent(index, html) {
  const panel = document.getElementById(`t${index}`);
  if (panel) panel.innerHTML = html;
}

const TAB_SLUGS = {
  9: 'verdict', 0: 'eli5', 1: 'technical', 2: 'use-cases', 3: 'skip-if',
  4: 'enables', 5: 'pros-cons', 6: 'alternatives', 7: 'health', 8: 'red-flags',
  15: 'tech-stack', 10: 'deep-dive', 11: 'systems', 12: 'ideate', 13: 'prioritize',
  14: 'sktpg', 21: 'docs', 22: 'maintenance', 23: 'license', 24: 'diff',
  25: 'stack-fit', 26: 'ask', 16: 'similar', 17: 'versus', 18: 'synergies',
  19: 'connections', 20: 'combine', 27: 'canvas',
};
const SLUG_TO_TAB = Object.fromEntries(Object.entries(TAB_SLUGS).map(([k, v]) => [v, Number(k)]));

// Two-tier act nav: a primary row of acts, and a secondary row of the active
// act's tabs. Both are generated from the act model so the grouping has one
// source of truth. Buttons keep `data-tab` so the existing show() path is reused.
function renderActNav() {
  const nav = document.getElementById('act-nav');
  if (!nav) return;
  nav.innerHTML = ACTS.map(
    (a) => `<button class="act-tab" data-act="${a.id}">${a.label}</button>`,
  ).join('');
}

function renderSubNav(actId) {
  const sub = document.getElementById('act-subnav');
  if (!sub) return;
  const tabs = tabsForAct(actId);
  // A single-tab act (Decide) needs no secondary row.
  sub.innerHTML = tabs.length <= 1
    ? ''
    : tabs.map((n) => `<button class="tab-btn" data-tab="${n}">${TAB_LABELS[n]}</button>`).join('');
}

function show(n, { updateHash = true } = {}) {
  // Active tab button (in the secondary row) + active panel (by id, not DOM order).
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.tab) === n));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
  document.getElementById(`t${n}`)?.classList.add('active');

  // Active act: highlight it and render its secondary row (if not already shown).
  const actId = actForTab(n);
  document.querySelectorAll('.act-tab').forEach((b) => b.classList.toggle('active', b.dataset.act === actId));
  const sub = document.getElementById('act-subnav');
  if (sub && sub.dataset.act !== actId) {
    renderSubNav(actId);
    sub.dataset.act = actId || '';
  }
  // Re-mark the active secondary button after a possible re-render.
  document.querySelectorAll('#act-subnav .tab-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.tab) === n));

  // Blueprint canvas mounts lazily on every activation path (idempotent + null-safe).
  if (n === 27) renderCanvas(lastData).catch((err) => console.error('[canvas] render failed', err));

  if (updateHash && TAB_SLUGS[n]) {
    history.replaceState(null, '', `#${TAB_SLUGS[n]}`);
  }
  if (updateHash && lastData?.repoId) {
    chrome.storage.local.set({ [`repolens_tab_${lastData.repoId}`]: n }).catch(() => {});
  }
}

// Nav clicks: open/close a grouped menu, run-all, or switch tab.
document.querySelector('.tab-nav')?.addEventListener('click', e => {
  const menuBtn = e.target.closest('.tab-menu-btn');
  if (menuBtn) {
    const menu = menuBtn.closest('.tab-menu');
    const wasOpen = menu.classList.contains('open');
    document.querySelectorAll('.tab-menu').forEach(m => m.classList.remove('open'));
    if (!wasOpen) menu.classList.add('open');
    return;
  }
  if (e.target.closest('#run-all-lenses')) { runAllLenses(); return; }
  const btn = e.target.closest('[data-tab]');
  if (btn) {
    const n = Number(btn.dataset.tab);
    show(n);
    if (n === 19) renderConnections(lastData); // network tab — pull fresh on each open (like Similar)
    // (canvas, tab 27, is dispatched inside show() so deep-link/restore paths render it too)
  }
});

// Close menus on an outside click.
document.addEventListener('click', e => {
  if (!e.target.closest('.tab-nav')) document.querySelectorAll('.tab-menu').forEach(m => m.classList.remove('open'));
});

// Scan explainers: a styled "when to use / skip" tooltip on each on-demand scan
// button, shown on hover OR keyboard focus. Static copy lives in explainers.js.
function initScanTips() {
  const tip = document.getElementById('scan-tip');
  const nav = document.querySelector('.tab-nav');
  if (!tip || !nav) return;

  // Mark scan buttons that have an explainer with a subtle ⓘ.
  nav.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    if (explainerFor(btn.dataset.tab) && !btn.querySelector('.tip-i')) {
      const i = document.createElement('span');
      i.className = 'tip-i';
      i.textContent = 'ⓘ';
      btn.appendChild(i);
    }
  });

  const showFor = (btn) => {
    const e = explainerFor(btn.dataset.tab);
    if (!e) return;
    tip.innerHTML = `<div class="st-title">${esc(e.title)}</div><dl>
      <dt>BEST FOR</dt><dd>${esc(e.bestFor)}</dd>
      <dt>SKIP IF</dt><dd>${esc(e.skipIf)}</dd>
      <dt>COST</dt><dd>${esc(e.cost)}</dd></dl>`;
    const r = btn.getBoundingClientRect();
    tip.style.visibility = 'hidden';
    tip.classList.add('show');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = r.left;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    let top = r.bottom + 6;
    if (top + th > window.innerHeight - 8) top = r.top - th - 6;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
    tip.style.visibility = '';
    tip.setAttribute('aria-hidden', 'false');
  };
  const hide = () => { tip.classList.remove('show'); tip.setAttribute('aria-hidden', 'true'); };

  nav.addEventListener('mouseover', e => { const b = e.target.closest('.tab-btn[data-tab]'); if (b) showFor(b); });
  nav.addEventListener('mouseout',  e => { const b = e.target.closest('.tab-btn[data-tab]'); if (b) hide(); });
  nav.addEventListener('focusin',   e => { const b = e.target.closest('.tab-btn[data-tab]'); if (b) showFor(b); });
  nav.addEventListener('focusout', hide);
}
initScanTips();
renderActNav();

// ─── "?" Guide overlay — feature discovery on demand ──────────────────────────
// One small button; the overlay explains scanning, the tabs, every lens (from
// SCAN_EXPLAINERS), the Library, and the keyboard map. A pulse dot marks it
// until first opened (guideSeen flag).
function initGuide() {
  const veil = document.getElementById('guide-veil');
  const btn = document.getElementById('open-guide');
  const dot = document.getElementById('guide-dot');
  if (!veil || !btn) return;

  const lensHost = document.getElementById('guide-lenses');
  if (lensHost) {
    lensHost.innerHTML = Object.values(SCAN_EXPLAINERS)
      .map(e => `<div class="g-lens"><b>${esc(e.title)}</b><span>${esc(e.bestFor)}</span><span class="g-cost">${esc(e.cost)}</span></div>`)
      .join('');
  }

  chrome.storage.local.get('guideSeen', ({ guideSeen }) => {
    if (!guideSeen && dot) dot.hidden = false;
  });

  const open = () => {
    veil.classList.add('open');
    if (dot) dot.hidden = true;
    chrome.storage.local.set({ guideSeen: true });
  };
  const close = () => veil.classList.remove('open');

  btn.addEventListener('click', open);
  document.getElementById('guide-close')?.addEventListener('click', close);
  veil.addEventListener('click', (e) => { if (e.target === veil) close(); });
  document.getElementById('guide-library')?.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('library.html') }));
  document.getElementById('guide-settings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    if (e.key === '?') {
      if (veil.classList.contains('open')) close(); else open();
    } else if (e.key === 'Escape' && veil.classList.contains('open')) {
      close();
    }
  });
}
initGuide();

// Run-all: fire every on-demand lens at once (uses each lens's current framework).
let runAllTotal = 0;
let runAllDone = 0;

function updateRunAllProgress(done) {
  runAllDone = Math.min(runAllDone + (done ? 1 : 0), runAllTotal);
  const el = document.getElementById('lens-progress');
  if (el && runAllTotal > 0) el.textContent = `${runAllDone}/${runAllTotal}`;
}

function runAllLenses() {
  document.querySelectorAll('.tab-menu').forEach(m => m.classList.remove('open'));
  if (!lastData) return;
  runAllDone = 0;
  runAllTotal = sktpgEnabled ? 5 : 4; // deepdive + synergies + systems + ideate + (sktpg?)
  const el = document.getElementById('lens-progress');
  if (el) el.textContent = `0/${runAllTotal}`;
  startDeepDive(lastData, () => updateRunAllProgress(true));
  startSynergies(lastData, () => updateRunAllProgress(true));
  chrome.runtime.sendMessage({ type: 'SYSTEMS', sessionKey, platform: lastData.platform, repoId: lastData.repoId, frameworks: SYSTEMS_FRAMEWORKS.map(f => f.key) });
  chrome.runtime.sendMessage({ type: 'IDEATE', sessionKey, platform: lastData.platform, repoId: lastData.repoId, frameworks: IDEATE_FRAMEWORKS.map(f => f.key) });
  chrome.runtime.sendMessage({ type: 'PRIORITIZE', sessionKey, platform: lastData.platform, repoId: lastData.repoId, frameworks: HEURISTICS_FRAMEWORKS.map(f => f.key) });
  if (sktpgEnabled) startSktpg(lastData, () => updateRunAllProgress(true));
}

// ─── Export / Copy ────────────────────────────────────────────────────────────

function repoSourceUrl(platform, repoId) {
  if (platform === 'gitlab') return `https://gitlab.com/${repoId}`;
  if (platform === 'npm') return `https://www.npmjs.com/package/${repoId}`;
  if (platform === 'pypi') return `https://pypi.org/project/${repoId}/`;
  return `https://github.com/${repoId}`;
}

async function copyWithFlash(btn, text, label = 'Copied ✓') {
  try {
    await navigator.clipboard.writeText(text);
    const prev = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = prev; }, 1500);
  } catch { /* clipboard blocked */ }
}

document.getElementById('copy-url')?.addEventListener('click', async () => {
  if (!lastData) return;
  const url = repoSourceUrl(lastData.platform, lastData.repoId);
  await copyWithFlash(document.getElementById('copy-url'), url);
});

document.getElementById('open-library')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
});

const CURRENT_VERSION = '3.0.0';
const whatsNewBtn = document.getElementById('whats-new-btn');
const whatsNewDot = document.getElementById('whats-new-dot');
chrome.storage.local.get('seenVersion', ({ seenVersion }) => {
  if (seenVersion !== CURRENT_VERSION && whatsNewDot) whatsNewDot.hidden = false;
});
whatsNewBtn?.addEventListener('click', () => {
  chrome.storage.local.set({ seenVersion: CURRENT_VERSION });
  if (whatsNewDot) whatsNewDot.hidden = true;
  chrome.tabs.create({ url: chrome.runtime.getURL('whats-new.html') });
});

// ─── Add to Board popover ─────────────────────────────────────────────────────
const safeHex = (v) => (/^#[0-9a-fA-F]{3,8}$/.test(v) ? v : COLLECTION_COLORS[0]);
let _boardPop = null;

function closeBoardPop() {
  if (!_boardPop) return;
  _boardPop.remove();
  _boardPop = null;
  document.removeEventListener('click', _onBoardDocClick, true);
  document.removeEventListener('keydown', _onBoardKey, true);
}
function _onBoardDocClick(e) { if (_boardPop && !_boardPop.contains(e.target)) closeBoardPop(); }
function _onBoardKey(e) { if (e.key === 'Escape') closeBoardPop(); }

async function openBoardPop(repoId, anchor) {
  closeBoardPop();
  const btn = document.getElementById('add-to-board');
  const cols = sortedCollections(await listCollections().catch(() => []));
  const list = cols.length
    ? cols.map((c) => `<button class="bp-row" data-id="${esc(c.id)}">` +
        `<span class="bp-check">${collectionContains(c, repoId) ? '✓' : ''}</span>` +
        `<span class="coll-dot" style="background:${safeHex(c.color)}"></span>` +
        `<span class="bp-name">${esc(c.name)}</span></button>`).join('')
    : `<div class="bp-empty">No boards yet — create one in the Library.</div>`;
  const pop = document.createElement('div');
  pop.className = 'boards-pop';
  pop.innerHTML = list + `<button class="bp-row bp-new" id="bp-open-lib">＋ Manage Boards…</button>`;
  document.body.appendChild(pop);

  const r = anchor.getBoundingClientRect();
  const left = Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - pop.offsetWidth - 12);
  pop.style.top = `${window.scrollY + r.bottom + 6}px`;
  pop.style.left = `${Math.max(window.scrollX + 8, left)}px`;
  _boardPop = pop;

  let localCols = cols;
  pop.querySelectorAll('.bp-row[data-id]').forEach((b) => {
    b.addEventListener('click', async () => {
      const idx = localCols.findIndex((c) => c.id === b.dataset.id);
      if (idx < 0) return;
      const updated = toggleRepoInCollection(localCols[idx], repoId, { now: new Date().toISOString() });
      localCols = localCols.map((c, i) => (i === idx ? updated : c));
      try { await saveCollection(updated); } catch { /* best-effort */ }
      b.querySelector('.bp-check').textContent = collectionContains(updated, repoId) ? '✓' : '';
      if (btn) {
        const inAny = localCols.some((c) => collectionContains(c, repoId));
        btn.textContent = inAny ? '✓ Board' : '+ Board';
      }
    });
  });
  pop.getElementById?.('bp-open-lib')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    closeBoardPop();
  });
  pop.querySelector('#bp-open-lib')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    closeBoardPop();
  });
  setTimeout(() => {
    document.addEventListener('click', _onBoardDocClick, true);
    document.addEventListener('keydown', _onBoardKey, true);
  }, 0);
}

document.getElementById('add-to-board')?.addEventListener('click', async (e) => {
  if (!lastData?.repoId) return;
  if (_boardPop) { closeBoardPop(); return; }
  await openBoardPop(lastData.repoId, e.currentTarget);
});

const copyMdBtn = document.getElementById('copy-md');
copyMdBtn?.addEventListener('click', async () => {
  if (!lastData) return;
  await copyWithFlash(copyMdBtn, toMarkdown(lastData));
});

const copySlackBtn = document.getElementById('copy-slack');
copySlackBtn?.addEventListener('click', async () => {
  if (!lastData) return;
  const fit = deriveFit(lastData);
  await copyWithFlash(copySlackBtn, toSlackPost(lastData, fit.level));
});

document.getElementById('export-scaffold')?.addEventListener('click', async () => {
  if (!lastData) return;
  const decision = await getDecision(lastData.repoId).catch(() => null);
  const md = toScaffold(lastData, decision);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(lastData.repoId)}-scaffold.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById('export-html')?.addEventListener('click', () => {
  if (!lastData) return;
  const blob = new Blob([toHtml(lastData)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `repolens-${slugify(lastData.repoId)}-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

let retryContext = null;
const retryBtn = document.getElementById('retry-btn');
const settingsBtn = document.getElementById('settings-btn');
settingsBtn?.addEventListener('click', () => chrome.runtime.openOptionsPage());
retryBtn?.addEventListener('click', async () => {
  if (!retryContext) { location.reload(); return; }
  retryBtn.disabled = true;
  retryBtn.textContent = 'Retrying…';
  try {
    // Ask the background to re-run the analysis into this same session, then reload
    // so the page picks up the fresh loading state and result.
    await chrome.runtime.sendMessage({ type: 'RERUN', sessionKey, ...retryContext });
  } catch { /* reload anyway — worst case the user sees the same error */ }
  location.reload();
});

document.getElementById('paste-url-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('paste-url-input');
  const rawUrl = (input?.value || '').trim();
  const detected = detectPlatform(rawUrl);
  if (!detected) {
    input.style.borderColor = 'var(--bad-edge)';
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    return;
  }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Scanning…'; }
  try {
    await chrome.runtime.sendMessage({ type: 'RERUN', sessionKey, ...detected });
  } catch { /* reload anyway */ }
  location.reload();
});

// Keyboard nav: ← → cycle tabs; 1–9 jump to the first nine; r rescan. Ignored while typing.
document.addEventListener('keydown', async e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
  const tabs = [...document.querySelectorAll('.tab-btn')].filter(b => b.style.display !== 'none');
  if (e.key === 'r' && retryBtn && !retryBtn.disabled && retryContext) {
    e.preventDefault();
    retryBtn.click();
    return;
  }
  if (e.key === 'f' && lastData) {
    e.preventDefault();
    const freshBtn = document.getElementById('rerun-fresh');
    if (freshBtn) { freshBtn.click(); return; }
    try { await chrome.runtime.sendMessage({ type: 'RERUN', sessionKey, platform: lastData.platform, repoId: lastData.repoId }); }
    catch { /* reload anyway */ }
    location.reload();
    return;
  }
  if (e.key === 'u' && lastData) {
    e.preventDefault();
    document.getElementById('copy-url')?.click();
    return;
  }
  if (e.key === 'm' && lastData) {
    e.preventDefault();
    copyMdBtn?.click();
    return;
  }
  if (e.key === 'd' && lastData) {
    e.preventDefault();
    show(10);
    return;
  }
  if (e.key === 'a' && lastData) {
    e.preventDefault();
    show(26);
    setTimeout(() => document.getElementById('ask-input')?.focus(), 50);
    return;
  }
  if (e.key === 'b' && lastData) {
    e.preventDefault();
    document.getElementById('add-to-board')?.click();
    return;
  }
  if (e.key === 'v' && lastData) { e.preventDefault(); show(9); return; }
  if (e.key === 'e' && lastData) { e.preventDefault(); show(0); return; }
  if (e.key === 'h' && lastData) { e.preventDefault(); show(7); return; }
  if (e.key === 'l') { e.preventDefault(); document.getElementById('open-library')?.click(); return; }
  if (e.key === 'o' && lastData) {
    e.preventDefault();
    const url = repoSourceUrl(lastData.platform, lastData.repoId);
    if (url) chrome.tabs.create({ url });
    return;
  }
  if (!tabs.length) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const cur = tabs.findIndex(b => b.classList.contains('active'));
    if (cur === -1) return;
    const next = tabs[(cur + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    show(Number(next.dataset.tab));
  } else if (/^[1-9]$/.test(e.key)) {
    const t2 = tabs[Number(e.key) - 1];
    if (t2) show(Number(t2.dataset.tab));
  }
});

async function watchSaveStatus(data) {
  const badge = document.querySelector('.saved-badge');
  if (!badge) return;

  if (data.saved === 'skipped' || data.autoSave === false) {
    badge.style.display = 'none';
    return;
  }

  badge.style.display = 'flex';

  const showOffline = (current) => {
    const detail = current?.saveError ? ` (${current.saveError})` : '';
    badge.textContent = `Not saved${detail}`;
    badge.style.color = '#fbbf24';
    badge.style.borderColor = '#ca8a0440';
    badge.style.background = '#ca8a0415';
  };

  const applyStatus = (current) => {
    if (current?.saved === true) {
      badge.textContent = '✦ Saved to your library';
      badge.style.color = '#4ade80';
      badge.style.borderColor = '#16a34a40';
      badge.style.background = '#0d1f12';
      return 'done';
    }
    if (current?.saved === false) {
      showOffline(current);
      return 'done';
    }
    if (current?.saved === 'pending') {
      badge.textContent = 'Saving…';
      return 'pending';
    }
    return 'wait';
  };

  const initial = applyStatus(data);
  if (initial === 'done') return;

  badge.textContent = 'Saving…';

  const deadline = Date.now() + 20_000;

  await new Promise((resolve) => {
    const finish = () => {
      chrome.storage.onChanged.removeListener(onChange);
      clearInterval(poll);
      resolve();
    };

    const onChange = (changes, area) => {
      if (area !== 'session' || !changes[sessionKey]) return;
      const status = applyStatus(changes[sessionKey].newValue);
      if (status === 'done') finish();
    };
    chrome.storage.onChanged.addListener(onChange);

    const poll = setInterval(async () => {
      if (Date.now() > deadline) {
        showOffline(data);
        finish();
        return;
      }
      const stored = await chrome.storage.session.get(sessionKey);
      const status = applyStatus(stored[sessionKey]);
      if (status === 'done') finish();
    }, 400);
  });
}

async function loadLibraryComparison(data) {
  try {
    const block = document.getElementById('library-block');
    if (!block) return;
    const similar = await findSimilar(data);
    if (!similar.length) return;
    block.innerHTML = `
    <div class="veles-box">
      <div class="veles-header"><div class="veles-dot"></div><div class="veles-title">From your library</div></div>
      ${similar.map(s => `
        <div class="veles-row">
          <div class="veles-name">${esc(s.repoId)}</div>
          <div class="veles-diff">${esc(s.compare_hooks || s.eli5?.slice(0, 100) || '')}</div>
        </div>
      `).join('')}
    </div>`;
  } catch {}
}

init();
