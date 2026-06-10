import { findSimilar, getEgoGraph } from './store.js';
import { egoGraphSvg } from './graph.js';
import { esc, paras, formatStars } from './format.js';
import { THEMES, initTheme, saveTheme } from './theme.js';
import { SYSTEMS_FRAMEWORKS } from './systems.js';
import { IDEATE_FRAMEWORKS } from './ideate.js';
import { HEURISTICS_FRAMEWORKS } from './heuristics.js';
import { toMarkdown, toHtml, slugify } from './exporter.js';
import { lineageSvg, loopSvg } from './diagram.js';
import { explainerFor, SCAN_EXPLAINERS } from './explainers.js';
import { deriveFit, firstSentence, verdictCopyText } from './verdict.js';
import { pingRunner } from './runner.js';
import { emptyLens, runOf } from './lens-runs.js';
import { spine, flow, ranked, matrix2x2, optionMatrix } from './layouts.js';
import { guideFor } from './lens-guide.js';

// Apply the saved theme ASAP (before render) to minimise flash.
initTheme();

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

const FETCH_PHRASES = [
  'Pulling the README…',
  'Grabbing the metadata…',
];

const THINK_PHRASES = [
  'Asking Claude to read this…',
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
  const deadline = Date.now() + 60_000;
  let phraseIndex = 0;
  let lastStatus = null;
  let cycleTimer = null;

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

      if (!data) { await sleep(300); continue; }

      if (data.loading) {
        if (data.repoId) setLoadingName(data.repoId);
        if (data.status !== lastStatus) {
          lastStatus = data.status;
          if (data.status === 'thinking') startCycling(THINK_PHRASES);
          else startCycling(FETCH_PHRASES);
        }
        await sleep(400);
        continue;
      }

      return data;
    }
  } finally {
    if (cycleTimer) clearInterval(cycleTimer);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function init() {
  if (!sessionKey) {
    loading.style.display = 'none';
    errorMsg.textContent = 'No session key — please re-run the analysis by clicking the extension icon.';
    errorState.style.display = 'flex';
    return;
  }
  const data = await waitForData();
  loading.style.display = 'none';

  if (data.error) {
    errorMsg.textContent = data.error;
    // Retry can only re-run when we know which repo to analyse.
    if (data.platform && data.repoId) {
      retryContext = { platform: data.platform, repoId: data.repoId };
      if (retryBtn) retryBtn.style.display = '';
    } else if (retryBtn) {
      retryBtn.style.display = 'none';
    }
    errorState.style.display = 'flex';
    return;
  }

  lastData = data;
  renderPage(data);
  main.style.display = 'block';
  document.title = `RepoLens — ${data.repoId}`;

  watchSaveStatus(data);
  loadLibraryComparison(data);
  renderThemeSwitcher();
  renderDeepDive(data);
  renderFrameworkLens(data, SYSTEMS_CFG);
  renderFrameworkLens(data, IDEATE_CFG);
  renderFrameworkLens(data, PRIORITIZE_CFG);
  renderSktpg(data);
  renderTechStack(data);
  renderSimilar(data);
  renderVersus(data);
  renderSynergies(data);
  renderCombinator(data);
  renderCacheBanner(data);
}

function renderCacheBanner(d) {
  const banner = document.getElementById('cache-banner');
  if (banner) banner.style.display = d.cached ? 'flex' : 'none';
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

function renderPage(d) {
  renderHeader(d);
  renderTabs(d);
  renderHighlights(d);
}

// ─── Deep Dive tab ────────────────────────────────────────────────────────────

const DD_STAGE_LABELS = {
  fetching: 'Fetching source…',
  atoms: 'Atomic deconstruction…',
  lineage: 'Mapping causal lineage…',
  feynman: 'Feynman validation…',
};

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
    host.innerHTML = `<div class="dd-progress"><span class="dot"></span>${DD_STAGE_LABELS[dd.status] || 'Working…'}</div>`;
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
  lastData = nv;
  renderDeepDive(nv);
  renderFrameworkLens(nv, SYSTEMS_CFG);
  renderFrameworkLens(nv, IDEATE_CFG);
  renderFrameworkLens(nv, PRIORITIZE_CFG);
  renderSktpg(nv);
  renderVersus(nv);
  renderSynergies(nv);
  renderCombinator(nv);
});

function renderHeader(d) {
  document.querySelector('.repo-name').textContent = d.repoId;
  document.querySelector('.repo-desc').textContent = d.description;
  document.querySelector('.health-score').textContent = d.health?.score ?? '—';
  document.querySelector('.health-fill').style.width = `${d.health?.score ?? 0}%`;

  const pillContainer = document.querySelector('.meta-pills');
  const starLabel = formatStars(d.stars);
  const pills = [
    d.language,
    starLabel ? `${starLabel} ★` : null,
    d.license,
    d.platform
  ].filter(p => p && p !== 'Unknown');
  pillContainer.innerHTML = pills.map(p => `<span class="pill">${esc(p)}</span>`).join('');
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

  return `
    <div class="v-top"><button class="v-copy" id="v-copy" title="Copy a text summary of this verdict">⧉ Copy</button></div>
    <p class="v-what">${what}</p>
    <div class="v-fit fit-${fit.level}"><span class="v-chip">${esc(fit.label)}</span><span class="v-why">${esc(fit.why)}</span></div>
    ${line}
    <div class="v-facts">${cells}</div>
    ${flags}
    ${entries}
    ${jumps}`;
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

  setTabContent(6, (d.alternatives ?? []).map(a =>
    `<div class="alt-row"><div class="alt-name">${esc(a.name)}</div><div class="alt-when">${esc(a.when)}</div></div>`
  ).join(''));

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

function show(n) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.tab) === n));
  document.querySelectorAll('.tab-content').forEach((c, idx) => c.classList.toggle('active', idx === n));
  // Reflect the active tab on its parent menu button + close any open menus.
  document.querySelectorAll('.tab-menu').forEach(m => {
    const owns = [...m.querySelectorAll('.tab-btn')].some(b => Number(b.dataset.tab) === n);
    m.querySelector('.tab-menu-btn')?.classList.toggle('active', owns);
    m.classList.remove('open');
  });
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
function runAllLenses() {
  document.querySelectorAll('.tab-menu').forEach(m => m.classList.remove('open'));
  if (!lastData) return;
  startDeepDive(lastData);
  chrome.runtime.sendMessage({ type: 'SYSTEMS', sessionKey, platform: lastData.platform, repoId: lastData.repoId, frameworks: SYSTEMS_FRAMEWORKS.map(f => f.key) });
  chrome.runtime.sendMessage({ type: 'IDEATE', sessionKey, platform: lastData.platform, repoId: lastData.repoId, frameworks: IDEATE_FRAMEWORKS.map(f => f.key) });
  chrome.runtime.sendMessage({ type: 'PRIORITIZE', sessionKey, platform: lastData.platform, repoId: lastData.repoId, frameworks: HEURISTICS_FRAMEWORKS.map(f => f.key) });
  if (sktpgEnabled) startSktpg(lastData);
  startSynergies(lastData);
}

// ─── Export / Copy ────────────────────────────────────────────────────────────

document.getElementById('open-library')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
});

const copyMdBtn = document.getElementById('copy-md');
copyMdBtn?.addEventListener('click', async () => {
  if (!lastData) return;
  try {
    await navigator.clipboard.writeText(toMarkdown(lastData));
    const prev = copyMdBtn.textContent;
    copyMdBtn.textContent = 'Copied ✓';
    setTimeout(() => { copyMdBtn.textContent = prev; }, 1500);
  } catch { copyMdBtn.textContent = 'Copy failed'; }
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

// Keyboard nav: ← → cycle tabs; 1–9 jump to the first nine. Ignored while typing.
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
  const tabs = [...document.querySelectorAll('.tab-btn')].filter(b => b.style.display !== 'none');
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
