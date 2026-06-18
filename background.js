import { detectPlatform } from './url-detector.js';
import { fetchRepoData } from './fetcher.js';
import { buildPrompt } from './prompt.js';
import { parseClaudeResponse } from './parser.js';
import {
  saveAnalysis,
  searchLibrary,
  upsertNode,
  addEdge,
  scrollLibrary,
  scrollPoints,
  saveRepo,
  setConcepts,
} from './store.js';
import { buildAttemptPlan } from './routing.js';
import {
  COMPAT_PROVIDERS,
  compatProviderById,
  compatEndpoint,
  compatModelFor,
  compatProtocol,
  isCompatConnected,
  provKeyName,
  openaiBody,
  anthropicBody,
  parseOpenAiText,
  parseAnthropicText,
  compatStorageKeys,
  embeddingsBody,
  parseEmbeddings,
  pickEmbeddingsProvider,
} from './providers.js';
import { withRetry } from './retry.js';
import { categorizeError, rankErrors } from './errors.js';
import { estimateTokens } from './estimate.js';
import { buildTagPrompt, parseTags } from './tag-prompt.js';
import { nodeIdFor, edgeIdFor, ideaIdFor } from './graph.js';
import { deriveCapabilities } from './taxonomy.js';
import { deriveFit } from './verdict.js';
import { combineCandidates } from './combinator.js';
import { buildCombinatorPrompt, parseCombinator } from './combinator-prompt.js';
import { refreshXaiToken, XAI_CHAT_PROXY } from './oauth-xai.js';
import {
  ANTHROPIC_ACCESS_KEY,
  ANTHROPIC_EXPIRY_KEY,
  ANTHROPIC_REFRESH_KEY,
  clearAnthropicOAuthTokens,
  refreshAnthropicAccessToken,
} from './oauth-anthropic.js';
import {
  OPENAI_OAUTH_ERROR_KEY,
  OPENAI_OAUTH_STATE_KEY,
  OPENAI_OAUTH_VERIFIER_KEY,
  OPENAI_CREDENTIALS_KEY,
  clearOpenAICredentials,
  exchangeOpenAICode,
  isOpenAIOAuthCallbackUrl,
  mintOpenAIApiKey,
  refreshOpenAIToken,
} from './oauth-openai.js';
import {
  fetchSource,
  buildAtomsPrompt,
  parseAtoms,
  buildLineagePrompt,
  parseLineage,
  buildFeynmanPrompt,
  parseFeynman,
} from './deepdive.js';
import { scanRepo } from './runner.js';
import { buildSystemsPrompt, parseSystems, isFramework } from './systems.js';
import { buildIdeatePrompt, parseIdeate, isIdeateFramework } from './ideate.js';
import { buildHeuristicsPrompt, parseHeuristics, isHeuristicFramework } from './heuristics.js';
import { withTone } from './tone.js';
import { buildSktpgPrompt, parseSktpg } from './sktpg.js';
import { buildDocsQualityPrompt, parseDocsQuality } from './docs-quality.js';
import { buildVersusPrompt, parseVersus } from './versus.js';
import { buildAskPrompt, parseAskAnswer, buildFilterPrompt, parseFilterResult } from './ask-library.js';
import { buildMaintenancePrompt, parseMaintenance } from './maintenance.js';
import { fetchMaintenanceSignals } from './fetcher.js';
import { buildSynergiesPrompt, parseSynergies } from './synergies.js';
import { cacheAnalysis, getCached, listCached } from './cache.js';
import { emptyLens, withRun, setActive } from './lens-runs.js';
import { diffAnalyses } from './diff-analysis.js';
import { buildFitsStackPrompt, parseFitsStack } from './fits-stack.js';
import { buildStackPrompt, parseStack } from './stack-prompt.js';
import { buildAskRepoPrompt, parseAskRepoAnswer } from './ask-repo.js';
import { buildComparePrompt, parseCompareResult } from './compare-repos.js';
import { startScanAnim, stopScanAnim } from './icon-anim.js';

// Notify when a scan completes — clicking the notification focuses the result tab.
chrome.notifications.onClicked.addListener(async (notifId) => {
  chrome.notifications.clear(notifId);
  if (notifId.startsWith('rl_scan_')) {
    const tabUrl = notifId.slice('rl_scan_'.length);
    const [existing] = await chrome.tabs.query({ url: tabUrl });
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: tabUrl });
    }
  } else if (notifId.startsWith('rl_batch_')) {
    const libUrl = chrome.runtime.getURL('library.html');
    const [existing] = await chrome.tabs.query({ url: libUrl });
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: libUrl });
    }
  }
});

// Best-effort semantic-graph write: upsert both endpoint nodes, then a deterministic
// (idempotent) edge. Graph write errors are swallowed — building the graph
// must never block or fail a scan. Mirrors the existing "save error = skip" policy.
async function linkRepos({ source, sourcePayload, targetKey, targetPayload, label, properties }) {
  try {
    const src = nodeIdFor(source);
    const tgt = nodeIdFor(targetKey);
    await upsertNode(src, sourcePayload);
    await upsertNode(tgt, targetPayload);
    await addEdge({
      id: edgeIdFor(src, label, tgt),
      source: src,
      target: tgt,
      label,
      properties: properties || {},
    });
  } catch {
    /* best-effort: additive graph, write error = skip */
  }
}

// Pin a generated combo as a first-class IDEA node + COMBINES edges (best-effort, non-fatal).
async function pinIdea({ title, pitch, sources = [], novelty = 0, feasibility = 0, createdIso = '' }) {
  try {
    const ideaId = ideaIdFor(sources);
    await upsertNode(ideaId, {
      kind: 'idea',
      title: title || '',
      pitch: pitch || '',
      sources,
      novelty: Number(novelty) || 0,
      feasibility: Number(feasibility) || 0,
      analyzed: false,
      created: createdIso || '',
    });
    for (const src of sources) {
      const srcId = nodeIdFor(src);
      await addEdge({
        id: edgeIdFor(srcId, 'COMBINES', ideaId),
        source: srcId,
        target: ideaId,
        label: 'COMBINES',
        properties: { title: title || '' },
      });
    }
  } catch {
    /* best-effort: ontology is additive, write error = skip */
  }
}

// Build the analyzed-repo node payload from a parsed scan (shared by every write site).
function repoNodePayload(repoId, data = {}, analyzed = true) {
  return {
    repoId,
    name: repoId.split('/').pop() || repoId,
    platform: data.platform || '',
    language: data.language || '',
    category: data.category || '',
    analyzed,
  };
}

const SESSION_KEY_PREFIX = 'repolens_';

// First run: open Settings so the user can connect a provider and see Getting Started.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
  // Register "Scan with RepoLens" on link right-clicks — recreated on every install/update.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'repolens-scan-link',
      title: 'Scan with RepoLens',
      contexts: ['link'],
    });
  });
  // Drift check alarm — fires once a day to count stale repos.
  chrome.alarms.create('repolens-drift', { delayInMinutes: 1, periodInMinutes: 60 * 24 });
});

// Count repos not scanned in 14+ days and write a summary for the library banner.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'repolens-drift') return;
  try {
    const points = await scrollPoints({ limit: 2000 });
    const STALE_MS = 14 * 24 * 60 * 60 * 1000;
    const staleCount = points.filter(
      (p) => p.payload?.saved_at && Date.now() - Date.parse(p.payload.saved_at) > STALE_MS
    ).length;
    await chrome.storage.local.set({ repolens_drift: { staleCount, checkedAt: new Date().toISOString() } });
  } catch {
    /* offline or IDB unavailable */
  }
});

// Scan a link right-clicked anywhere — detect platform from the href, open output tab.
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'repolens-scan-link') return;
  const url = info.linkUrl || '';
  const detected = detectPlatform(url);
  if (!detected) {
    const sessionKey = SESSION_KEY_PREFIX + crypto.randomUUID();
    await chrome.storage.session.set({
      [sessionKey]: { loading: false, error: `Not a supported repo URL: ${url}` },
    });
    chrome.tabs.create({ url: chrome.runtime.getURL(`output-tab.html?key=${sessionKey}`) });
    return;
  }
  const gateKeys = await chrome.storage.local.get([
    'anthropicKey',
    ANTHROPIC_ACCESS_KEY,
    ANTHROPIC_REFRESH_KEY,
    'googleKey',
    'openrouterKey',
    'xaiKey',
    'nousKey',
    ...compatStorageKeys(),
  ]);
  const hasKey =
    gateKeys.anthropicKey ||
    gateKeys[ANTHROPIC_ACCESS_KEY] ||
    gateKeys[ANTHROPIC_REFRESH_KEY] ||
    gateKeys.googleKey ||
    gateKeys.openrouterKey ||
    gateKeys.xaiKey ||
    gateKeys.nousKey ||
    compatStorageKeys().some((k) => gateKeys[k]);
  const sessionKey = SESSION_KEY_PREFIX + crypto.randomUUID();
  if (!hasKey) {
    await chrome.storage.session.set({
      [sessionKey]: {
        loading: false,
        error: 'No AI provider configured — open Settings to add a key.',
        errorKind: 'none',
      },
    });
    chrome.tabs.create({ url: chrome.runtime.getURL(`output-tab.html?key=${sessionKey}`) });
    return;
  }
  await chrome.storage.session.set({ [sessionKey]: { loading: true, status: 'fetching', ...detected } });
  chrome.tabs.create({ url: chrome.runtime.getURL(`output-tab.html?key=${sessionKey}`) });
  runAnalysis(sessionKey, detected);
});

// ─── Listen for content script + output-tab signals ──────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'REPO_PAGE' && sender.tab?.id) {
    chrome.action.setIcon({
      tabId: sender.tab.id,
      path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    });
    return;
  }

  // Retry from the output tab — re-run analysis for the same repo into the same session key.
  if (msg.type === 'RERUN' && msg.sessionKey && msg.platform && msg.repoId) {
    const detected = { platform: msg.platform, repoId: msg.repoId };
    chrome.storage.session
      .set({ [msg.sessionKey]: { loading: true, status: 'fetching', ...detected } })
      .then(() => {
        sendResponse({ ok: true });
        runAnalysis(msg.sessionKey, detected, sender.tab?.id); // fire and forget; tab polls the session
      })
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Could not start the scan' }));
    return true; // keep the message channel open for the async sendResponse
  }

  // Deep Dive from the output tab — multi-stage source analysis into the same key.
  if (msg.type === 'DEEP_DIVE' && msg.sessionKey && msg.platform && msg.repoId) {
    sendResponse({ ok: true });
    runDeepDive(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId });
    return true;
  }

  // Framework lenses from the output tab — accept one or many frameworks; run sequentially.
  if (
    msg.type === 'SYSTEMS' &&
    msg.sessionKey &&
    msg.platform &&
    msg.repoId &&
    Array.isArray(msg.frameworks)
  ) {
    const fws = msg.frameworks.filter(isFramework);
    if (fws.length) {
      sendResponse({ ok: true });
      runFrameworkLens(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId }, fws, SYSTEMS_LENS);
      return true;
    }
  }
  if (
    msg.type === 'IDEATE' &&
    msg.sessionKey &&
    msg.platform &&
    msg.repoId &&
    Array.isArray(msg.frameworks)
  ) {
    const fws = msg.frameworks.filter(isIdeateFramework);
    if (fws.length) {
      sendResponse({ ok: true });
      runFrameworkLens(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId }, fws, IDEATE_LENS);
      return true;
    }
  }
  if (
    msg.type === 'PRIORITIZE' &&
    msg.sessionKey &&
    msg.platform &&
    msg.repoId &&
    Array.isArray(msg.frameworks)
  ) {
    const fws = msg.frameworks.filter(isHeuristicFramework);
    if (fws.length) {
      sendResponse({ ok: true });
      runFrameworkLens(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId }, fws, PRIORITIZE_LENS);
      return true;
    }
  }

  // SKTPG directional-intelligence skill from the output tab — one-tap, one run.
  if (msg.type === 'SKTPG' && msg.sessionKey && msg.platform && msg.repoId) {
    sendResponse({ ok: true });
    runSktpg(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId });
    return true;
  }

  // Versus from the output tab — head-to-head of the scanned repo vs a competitor.
  if (msg.type === 'VERSUS' && msg.sessionKey && msg.platform && msg.repoId && msg.competitor) {
    sendResponse({ ok: true });
    runVersus(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId }, msg.competitor);
    return true;
  }

  // Docs Quality from the output tab — on-demand README + file-tree scan.
  if (msg.type === 'DOCS_QUALITY' && msg.sessionKey && msg.platform && msg.repoId) {
    sendResponse({ ok: true });
    runDocsQuality(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId });
    return true;
  }

  // Synergies from the output tab — complementary repos grounded in the library.
  if (msg.type === 'SYNERGIES' && msg.sessionKey && msg.platform && msg.repoId) {
    sendResponse({ ok: true });
    runSynergies(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId });
    return true;
  }
  if (msg.type === 'COMBINATOR' && msg.sessionKey && msg.platform && msg.repoId) {
    sendResponse({ ok: true });
    runCombinator(
      msg.sessionKey,
      { platform: msg.platform, repoId: msg.repoId },
      { mode: msg.mode || 'repo', wildness: Number(msg.wildness) || 0 }
    );
    return true;
  }
  if (msg.type === 'PIN_IDEA' && msg.sessionKey && msg.idea && Array.isArray(msg.idea.sources)) {
    sendResponse({ ok: true });
    (async () => {
      await pinIdea({ ...msg.idea, createdIso: new Date().toISOString() });
    })();
    return true;
  }
  if (msg.type === 'TAG_LIBRARY' && msg.sessionKey) {
    sendResponse({ ok: true });
    runTagLibrary(msg.sessionKey);
    return true;
  }

  // Maintenance & Abandonment lens — commit recency, bus factor, CI, open issues.
  if (msg.type === 'MAINTENANCE' && msg.sessionKey && msg.platform && msg.repoId) {
    sendResponse({ ok: true });
    runMaintenance(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId });
    return true;
  }

  // Fits MY Stack? — library-grounded "does this slot in, conflict, or shift the paradigm?"
  if (msg.type === 'FITS_STACK' && msg.sessionKey && msg.platform && msg.repoId) {
    sendResponse({ ok: true });
    runFitsStack(msg.sessionKey, { platform: msg.platform, repoId: msg.repoId });
    return true;
  }

  // Batch Scan — queue multiple repo URLs for sequential analysis.
  if (msg.type === 'BATCH_SCAN' && msg.sessionKey && Array.isArray(msg.urls) && msg.urls.length) {
    sendResponse({ ok: true });
    runBatchScan(msg.sessionKey, msg.urls);
    return true;
  }

  // Tech-Stack Builder — multi-repo wiring diagram from the library.
  if (msg.type === 'STACK_BUILD' && msg.sessionKey && Array.isArray(msg.repoIds) && msg.repoIds.length >= 2) {
    sendResponse({ ok: true });
    runStackBuild(msg.sessionKey, msg.repoIds);
    return true;
  }

  // Ask This Repo — grounded Q&A over the current analysis in session storage.
  // Stores up to 5 Q&A pairs in askRepo.history; current pending is askRepo.pending.
  if (msg.type === 'ASK_REPO' && msg.sessionKey && msg.question) {
    sendResponse({ ok: true });
    (async () => {
      const getSession = async () => (await chrome.storage.session.get(msg.sessionKey))[msg.sessionKey] || {};
      const setAsk = async (patch) => {
        const cur = await getSession();
        await chrome.storage.session.set({
          [msg.sessionKey]: { ...cur, askRepo: { ...(cur.askRepo || {}), ...patch } },
        });
      };
      try {
        const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);
        const cur = await getSession();
        // Seed session history from local storage if this is the first question in the session
        let sessionHistory = cur.askRepo?.history || [];
        if (!sessionHistory.length && cur.repoId) {
          try {
            const persisted = await chrome.storage.local.get(`repolens_ask_${cur.repoId}`);
            sessionHistory = persisted[`repolens_ask_${cur.repoId}`] || [];
          } catch {}
        }
        const history = sessionHistory.slice(-4); // keep last 4 completed pairs for AI context
        await setAsk({ pending: { status: 'thinking', question: msg.question }, history });
        const prompt = buildAskRepoPrompt(msg.question, cur, history);
        if (!prompt) {
          await setAsk({
            pending: {
              status: 'error',
              question: msg.question,
              error: 'Not enough context — try re-scanning first.',
            },
            history,
          });
          return;
        }
        const text = await callAI(keys, prompt, 'ask');
        const answer = parseAskRepoAnswer(text);
        const updated = [...history, { question: msg.question, answer }].slice(-5);
        await setAsk({ pending: null, history: updated });
        if (cur.repoId) {
          chrome.storage.local.set({ [`repolens_ask_${cur.repoId}`]: updated.slice(-10) });
        }
      } catch (e) {
        const cur = await getSession();
        const history = cur.askRepo?.history || [];
        await setAsk({
          pending: { status: 'error', question: msg.question, error: e?.message || 'Ask failed' },
          history,
        });
      }
    })();
    return true;
  }

  // Quick Ask — grounded Q&A for a single cached repo (no session key needed).
  if (msg.type === 'ASK_CACHED' && msg.question && msg.analysis?.repoId) {
    (async () => {
      try {
        const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);
        const prompt = buildAskRepoPrompt(msg.question, msg.analysis);
        if (!prompt) {
          sendResponse({ ok: false, error: 'Not enough context.' });
          return;
        }
        const text = await callAI(keys, prompt, 'ask');
        sendResponse({ ok: true, answer: parseAskRepoAnswer(text) });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Ask failed' });
      }
    })();
    return true;
  }

  // AI-powered head-to-head comparison of two cached repos.
  if (msg.type === 'COMPARE_REPOS' && msg.a?.repoId && msg.b?.repoId) {
    (async () => {
      try {
        const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);
        const prompt = buildComparePrompt(msg.a, msg.b);
        if (!prompt) {
          sendResponse({ ok: false, error: 'Not enough context to compare.' });
          return;
        }
        const text = await callAI(keys, prompt, 'ask');
        const result = parseCompareResult(text);
        if (!result) {
          sendResponse({ ok: false, error: 'Could not parse comparison result.' });
          return;
        }
        sendResponse({ ok: true, result });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Comparison failed' });
      }
    })();
    return true;
  }

  // Natural-language library filter — ranks matching repo IDs for a query.
  if (msg.type === 'FILTER_LIBRARY' && msg.question && Array.isArray(msg.docs)) {
    (async () => {
      try {
        const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);
        const prompt = buildFilterPrompt(msg.question, msg.docs);
        if (!prompt) {
          sendResponse({ ok: false, error: 'No question or context provided.' });
          return;
        }
        const text = await callAI(keys, prompt, 'ask');
        const ids = parseFilterResult(text);
        sendResponse({ ok: true, ids });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  // Ask Across My Library — grounded Q&A over the user's saved analyses.
  if (msg.type === 'ASK_LIBRARY' && msg.question && Array.isArray(msg.docs)) {
    (async () => {
      try {
        const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);
        const prompt = buildAskPrompt(msg.question, msg.docs);
        if (!prompt) {
          sendResponse({ ok: false, error: 'No question or context provided.' });
          return;
        }
        const text = await callAI(keys, prompt, 'ask');
        sendResponse({ ok: true, answer: parseAskAnswer(text) });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  // Provider self-test from Settings — connection + function check for a registry provider.
  if (msg.type === 'TEST_PROVIDER' && msg.provider) {
    (async () => {
      const keys = await chrome.storage.local.get([...compatStorageKeys(), OPENAI_CREDENTIALS_KEY]); // registry settings + ChatGPT-login record
      try {
        sendResponse(await testProvider(msg.provider, keys));
      } catch (e) {
        sendResponse({ ok: false, connection: false, function: false, detail: e?.message || String(e) });
      }
    })();
    return true; // async sendResponse
  }
});

// Turn a competitor input (URL or "owner/name") into { platform, repoId }.
function resolveCompetitor(input) {
  const s = (input || '').trim();
  const detected = detectPlatform(s); // handles full GitHub/GitLab/npm/PyPI URLs
  if (detected) return detected;
  const repoId = s
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '');
  return { platform: 'github', repoId };
}

// One redirect can fire BOTH a navigation event and tabs.onUpdated, and the auth
// code is single-use — this de-dups so only the first handler runs the exchange.
const _handledOAuthCodes = new Set();

// ─── OpenAI OAuth callback handling ("Sign in with ChatGPT", Codex CLI flow) ───
//
// The redirect lands on http://localhost:1455/auth/callback — the loopback server
// the CLI runs doesn't exist in a browser, so the navigation can't complete. We
// intercept it (onBeforeNavigate fires first, with the ?code=), exchange the code,
// then mint an API key so inference uses the standard OpenAI engine.

async function handleOpenAIOAuthCallback(rawUrl, tabId) {
  if (!rawUrl || !isOpenAIOAuthCallbackUrl(rawUrl)) return;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');

  const cleanupFlowMarkers = async () => {
    await chrome.storage.local.remove([OPENAI_OAUTH_VERIFIER_KEY, OPENAI_OAUTH_STATE_KEY]).catch(() => {});
  };

  if (error) {
    const msg = errorDesc || error;
    console.warn('[RepoLens OAuth] OpenAI provider returned error:', msg);
    await chrome.storage.local.set({ [OPENAI_OAUTH_ERROR_KEY]: `ChatGPT sign-in error: ${msg}` });
    await cleanupFlowMarkers();
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
    return;
  }

  if (!code) return; // an early loopback hit without the auth code — ignore

  if (_handledOAuthCodes.has(code)) return; // the other listener got here first
  _handledOAuthCodes.add(code);

  const stored = await chrome.storage.local.get([OPENAI_OAUTH_VERIFIER_KEY, OPENAI_OAUTH_STATE_KEY]);
  const verifier = stored[OPENAI_OAUTH_VERIFIER_KEY];
  const storedState = stored[OPENAI_OAUTH_STATE_KEY];

  if (!verifier) {
    console.warn('[RepoLens OAuth] No stored OpenAI verifier — flow interrupted or for another extension');
    await cleanupFlowMarkers(); // clear any stale state marker from an interrupted flow
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
    return;
  }

  try {
    const creds = await exchangeOpenAICode({ code, state, verifier, storedState });
    // Mint a usable API key so scans run through the ordinary OpenAI engine.
    const apiKey = await mintOpenAIApiKey(creds.id_token);
    await chrome.storage.local.set({ openaiKey: apiKey });
    await cleanupFlowMarkers();
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
  } catch (err) {
    console.error('[RepoLens OAuth] OpenAI exchange error:', err.message);
    // No usable key ⇒ don't leave half-finished OAuth state that reads as "connected".
    await clearOpenAICredentials().catch(() => {});
    await chrome.storage.local.set({ [OPENAI_OAUTH_ERROR_KEY]: err.message });
    await cleanupFlowMarkers();
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
  }
}

// The OpenAI loopback redirect can't load (no local server), so onCompleted never
// fires for it — onBeforeNavigate runs first and still carries the ?code=.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  handleOpenAIOAuthCallback(details.url, details.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    handleOpenAIOAuthCallback(changeInfo.url, tabId);
  }
});

// Main click handler
chrome.action.onClicked.addListener(async (tab) => {
  const detected = detectPlatform(tab.url);
  if (!detected) {
    const sessionKey = SESSION_KEY_PREFIX + crypto.randomUUID();
    await chrome.storage.session.set({
      [sessionKey]: {
        loading: false,
        error:
          'Not a supported page. Navigate to a GitHub, GitLab, npm, or PyPI repo page and click the icon there.',
      },
    });
    chrome.tabs.create({ url: `output-tab.html?key=${sessionKey}` });
    return;
  }

  const sessionKey = SESSION_KEY_PREFIX + crypto.randomUUID();

  // Cache hit → show the saved analysis instantly (no AI call, works offline).
  // The output tab offers a "Re-run fresh" affordance.
  const cached = await getCached(detected.platform, detected.repoId);
  if (cached) {
    await chrome.storage.session.set({ [sessionKey]: { ...cached, cached: true, loading: false } });
    await chrome.tabs.create({ url: `output-tab.html?key=${sessionKey}` });
    return;
  }

  // Gate: at least one provider must be configured (runAnalysis reads the rest).
  const gateKeys = await chrome.storage.local.get([
    'anthropicKey',
    ANTHROPIC_ACCESS_KEY,
    ANTHROPIC_REFRESH_KEY,
    'googleKey',
    'openrouterKey',
    'xaiKey',
    'xaiRefresh',
    'nousKey',
    ...compatStorageKeys(),
  ]);
  const firstClass =
    gateKeys.anthropicKey ||
    gateKeys[ANTHROPIC_ACCESS_KEY] ||
    gateKeys[ANTHROPIC_REFRESH_KEY] ||
    gateKeys.googleKey ||
    gateKeys.openrouterKey ||
    gateKeys.xaiKey ||
    gateKeys.xaiRefresh ||
    gateKeys.nousKey;
  const anyCompat = COMPAT_PROVIDERS.some((p) => isCompatConnected(p.id, gateKeys));
  if (!firstClass && !anyCompat) {
    chrome.runtime.openOptionsPage();
    return;
  }

  // Open the output tab immediately with a loading state, then run the analysis.
  await chrome.storage.session.set({ [sessionKey]: { loading: true, status: 'fetching', ...detected } });
  await chrome.tabs.create({ url: `output-tab.html?key=${sessionKey}` });
  runAnalysis(sessionKey, detected, tab.id);
});

// Every provider credential + model-selector key, read together wherever an AI
// call is made. Single source of truth — add a provider here and every scan path
// picks it up.
const PROVIDER_KEYS = [
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
  'xaiModel',
  'nousKey',
  'nousModel',
  ...compatStorageKeys(), // registry providers' key / model / endpoint / enabled / proto slots
  OPENAI_CREDENTIALS_KEY, // ChatGPT-login OAuth record (drives re-mint on 401)
  'partRouting', // per-part model routing map (loaded alongside provider keys)
];

// ─── Batch Scan ──────────────────────────────────────────────────────────────
// Processes a list of URLs sequentially, writing progress to batchKey.
async function runBatchScan(batchKey, urls) {
  const items = urls.map((url) => {
    const parsed = detectPlatform(url);
    return parsed
      ? { url, platform: parsed.platform, repoId: parsed.repoId, status: 'queued', fit: null, error: null }
      : { url, platform: null, repoId: null, status: 'error', fit: null, error: 'Unrecognised URL' };
  });

  const writeBatch = (done = false) =>
    chrome.storage.session.set({
      [batchKey]: { type: 'batch', total: items.length, items: items.map((i) => ({ ...i })), done },
    });

  await writeBatch(false);

  for (let i = 0; i < items.length; i++) {
    if (items[i].status === 'error') continue; // skip unrecognised URLs immediately

    items[i].status = 'scanning';
    await writeBatch(false);

    const subKey = SESSION_KEY_PREFIX + crypto.randomUUID();
    try {
      await chrome.storage.session.set({
        [subKey]: { loading: true, status: 'fetching', platform: items[i].platform, repoId: items[i].repoId },
      });
      runAnalysis(subKey, { platform: items[i].platform, repoId: items[i].repoId });

      // Poll until the sub-analysis finishes (max 90 s per repo)
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 600));
        const stored = await chrome.storage.session.get(subKey).catch(() => ({}));
        const result = stored[subKey];
        if (result && !result.loading) {
          items[i].status = result.error ? 'error' : 'done';
          items[i].fit = result.fit?.level ?? null;
          items[i].error = result.error ?? null;
          items[i].repoId = result.repoId || items[i].repoId;
          await chrome.storage.session.remove(subKey).catch(() => {});
          break;
        }
      }
      if (items[i].status === 'scanning') {
        items[i].status = 'error';
        items[i].error = 'Timed out';
      }
    } catch (e) {
      items[i].status = 'error';
      items[i].error = e?.message || 'Scan failed';
    }

    await writeBatch(false);

    // Polite pause between scans to respect API rate limits
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, 1200));
  }

  await writeBatch(true);

  try {
    const done = items.filter((i) => i.status === 'done').length;
    const errors = items.filter((i) => i.status === 'error').length;
    const msg = errors ? `${done} saved, ${errors} failed` : `${done} repo${done === 1 ? '' : 's'} saved`;
    chrome.notifications.create(`rl_batch_${batchKey}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'RepoLens — Batch scan done',
      message: msg,
      silent: true,
    });
  } catch {
    /* notifications are best-effort */
  }
}

// Fetch → AI → parse → store. Used by the initial click and by RERUN (retry).
async function runAnalysis(sessionKey, detected, tabId) {
  // Load every provider credential + model + routing in one read; pass the whole
  // object to callAI so registry (compat) providers are reachable too — not just
  // the five first-class ones. Extra keys (autoSave/tone) are ignored downstream.
  const settings = await chrome.storage.local.get([...PROVIDER_KEYS, 'autoSave', 'tone']);
  const { autoSave = true, tone } = settings;

  try {
    startScanAnim(tabId); // fire-and-forget; no-ops without a tabId / when disabled / reduced motion
    // Snapshot the previous cached analysis for diff comparison (before it's overwritten).
    const prevCached = await getCached(detected.platform, detected.repoId).catch(() => null);

    // Fetch metadata + README
    await chrome.storage.session.set({
      [sessionKey]: { loading: true, status: 'fetching', statusMsg: 'Fetching repo metadata…', ...detected },
    });
    const repoData = await fetchRepoData(detected.platform, detected.repoId);

    // Write quick snapshot so the output tab can render something while AI thinks.
    const quickData = {
      repoId: repoData.repoId,
      description: repoData.description,
      language: repoData.language,
      license: repoData.license,
      stars: repoData.stars,
      languages: repoData.languages,
    };

    // Name the provider we'll try first so the loading copy is accurate.
    let primaryProvider = '';
    try {
      const plan = buildAttemptPlan({ routing: settings.partRouting || {}, part: 'core', keys: settings });
      if (plan[0]) primaryProvider = providerLabel(plan[0].provider);
    } catch {
      /* leave blank — the tab falls back to a generic phrase */
    }
    await chrome.storage.session.set({
      [sessionKey]: {
        loading: true,
        status: 'thinking',
        statusMsg: primaryProvider ? `Asking ${primaryProvider}…` : 'Analysing with AI…',
        quickData,
        ...detected,
        provider: primaryProvider,
      },
    });

    // Call AI provider — tried in order: Nous > Gemini > OpenRouter > Grok > Anthropic,
    // then any connected compatible provider.
    const corePrompt = withTone(tone, buildPrompt(repoData));
    const text = await callAI(settings, corePrompt, 'core');
    const analysis = parseClaudeResponse(text);
    const fullData = {
      ...repoData,
      ...analysis,
      inputTokensEstimate: estimateTokens(corePrompt),
      loading: false,
      error: null,
      autoSave,
      saved: autoSave ? 'pending' : 'skipped',
    };

    // Attach diff against the previous scan (null on first scan — tab renders "Nothing to compare").
    const diff = diffAnalyses(prevCached, fullData);
    await chrome.storage.session.set({ [sessionKey]: { ...fullData, diff } });
    cacheAnalysis(detected.platform, detected.repoId, fullData).catch(() => {}); // history/cache (no diff stored)

    if (autoSave) {
      let saveErr = null;
      try {
        await saveAnalysis(fullData);
      } catch (err) {
        saveErr = err;
      }

      await chrome.storage.session.set({
        [sessionKey]: saveErr
          ? {
              ...fullData,
              diff,
              saved: false,
              saveError: saveErr.message || 'Could not save to your library',
            }
          : { ...fullData, diff, saved: true, saveError: null },
      });

      // Semantic graph: this repo + its named alternatives (only when the save worked).
      // Best-effort — never throws.
      if (!saveErr) {
        const sourcePayload = repoNodePayload(fullData.repoId, fullData, true);
        for (const alt of fullData.alternatives || []) {
          if (!alt?.name) continue;
          await linkRepos({
            source: fullData.repoId,
            sourcePayload,
            targetKey: alt.name,
            targetPayload: { name: alt.name, analyzed: false },
            label: 'ALTERNATIVE_TO',
            properties: { name: alt.name, when: alt.when || '' },
          });
        }
      }
    }

    // Scan-complete notification — fires after the tab is updated so clicking it
    // focuses the already-loaded result rather than triggering a fresh poll.
    try {
      const repoName = fullData.repoId?.split('/').pop() || fullData.repoId || 'Repo';
      const fit = deriveFit(fullData);
      const fitMsg =
        { strong: 'Strong fit', solid: 'Solid fit', care: 'Use with care', risky: 'Risky' }[fit.level] ||
        'Analysis ready';
      const tabUrl = chrome.runtime.getURL(`output-tab.html?key=${sessionKey}`);
      chrome.notifications.create(`rl_scan_${tabUrl}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `RepoLens — ${repoName}`,
        message: fitMsg,
        silent: true,
      });
    } catch {
      /* notifications are best-effort */
    }

    stopScanAnim(tabId); // success: reset to the static icon
  } catch (err) {
    stopScanAnim(tabId); // error: reset to the static icon
    // AI failures already carry a humanized message + kind; other failures (fetch,
    // parse) get classified here so the tab can still route the error CTA.
    const errorKind = err.kind || categorizeError(err).kind;
    await chrome.storage.session.set({
      [sessionKey]: { ...detected, loading: false, error: err.message, errorKind },
    });
  }
}

// ─── Deep Dive: multi-stage source analysis (on-demand from the output tab) ───
async function runDeepDive(sessionKey, detected) {
  const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone', 'runnerUrl']);

  // Merge a patch into the session entry's deepDive object without clobbering analysis.
  const setDeep = async (patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({
      [sessionKey]: { ...cur, deepDive: { ...(cur.deepDive || {}), ...patch } },
    });
  };

  try {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    const repoData = {
      repoId: detected.repoId,
      platform: detected.platform,
      description: cur.description || '',
      language: cur.language || '',
    };

    await setDeep({ status: 'fetching', error: null });
    const source = await fetchSource(detected.platform, detected.repoId);
    // Deeper scan: measured facts from the runner when reachable (best-effort → null).
    const facts = await scanRepo(keys.runnerUrl, detected.platform, detected.repoId);

    await setDeep({ status: 'atoms', degraded: !!source.degraded, facts });
    const { atoms } = parseAtoms(
      await callAI(keys, withTone(keys.tone, buildAtomsPrompt(repoData, source, facts)), 'deepdive')
    );
    await setDeep({ atoms });

    await setDeep({ status: 'lineage' });
    const lineage = parseLineage(
      await callAI(keys, withTone(keys.tone, buildLineagePrompt(atoms)), 'deepdive')
    );
    await setDeep({ lineage });

    await setDeep({ status: 'feynman' });
    const feynman = parseFeynman(
      await callAI(keys, withTone(keys.tone, buildFeynmanPrompt(repoData, atoms, lineage)), 'deepdive')
    );
    await setDeep({ feynman });

    // Knowledge-Graph substrate: persist atoms, with embeddings when the configured
    // provider supports them (else vectors stay null → lexical matching). Best-effort.
    try {
      const texts = atoms.map((a) => `${a.name} — ${a.purpose || ''}`.trim());
      const emb = await callEmbeddings(keys, texts);
      await setConcepts(detected.repoId, {
        repoId: detected.repoId,
        atoms,
        vectors: emb ? emb.vectors : null,
        embedModel: emb ? emb.model : null,
        computedAt: new Date().toISOString(),
      });
    } catch {
      /* substrate is additive; ignore */
    }

    await setDeep({ status: 'done' });
  } catch (err) {
    await setDeep({ status: 'error', error: err.message || 'Deep Dive failed' });
  }
}

// Generic framework-lens runner: run each requested framework sequentially, writing
// per-framework state under `slot` via the lens-runs reducer. Source is fetched once
// and reused across frameworks. Each AI call still flows through the throttled callAI,
// so "Run all" can't burst a provider; one framework's error doesn't sink the batch.
const SYSTEMS_LENS = {
  slot: 'systems',
  build: buildSystemsPrompt,
  parse: parseSystems,
  label: 'Systems analysis',
};
const IDEATE_LENS = { slot: 'ideate', build: buildIdeatePrompt, parse: parseIdeate, label: 'Ideation' };
const PRIORITIZE_LENS = {
  slot: 'prioritize',
  build: buildHeuristicsPrompt,
  parse: parseHeuristics,
  label: 'Prioritization',
};

async function runFrameworkLens(sessionKey, detected, frameworks, cfg) {
  const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);
  const cur0 = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
  const repoData = {
    repoId: detected.repoId,
    platform: detected.platform,
    description: cur0.description || '',
    language: cur0.language || '',
  };

  const setRun = async (fw, patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    const lens = withRun(cur[cfg.slot] || emptyLens(), fw, patch);
    await chrome.storage.session.set({ [sessionKey]: { ...cur, [cfg.slot]: setActive(lens, fw) } });
  };

  let source = null;
  for (const fw of frameworks) {
    try {
      await setRun(fw, { status: 'fetching', error: null, result: null });
      if (!source) source = await fetchSource(detected.platform, detected.repoId);
      await setRun(fw, { status: 'running' });
      const result = cfg.parse(
        fw,
        await callAI(keys, withTone(keys.tone, cfg.build(fw, repoData, source)), 'lens')
      );
      await setRun(fw, { status: 'done', result });
    } catch (err) {
      await setRun(fw, { status: 'error', error: err.message || `${cfg.label} failed` });
    }
  }
}

// ─── SKTPG: one-tap directional-intelligence skill (on-demand) ────────────────
async function runSktpg(sessionKey, detected) {
  const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);

  const setSk = async (patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({
      [sessionKey]: { ...cur, sktpg: { ...(cur.sktpg || {}), ...patch } },
    });
  };

  try {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    const repoData = {
      repoId: detected.repoId,
      platform: detected.platform,
      description: cur.description || '',
      language: cur.language || '',
    };

    await setSk({ status: 'fetching', error: null, result: null });
    const source = await fetchSource(detected.platform, detected.repoId);

    await setSk({ status: 'running' });
    const result = parseSktpg(
      await callAI(keys, withTone(keys.tone, buildSktpgPrompt(repoData, source)), 'sktpg')
    );

    await setSk({ status: 'done', result });
  } catch (err) {
    await setSk({ status: 'error', error: err.message || 'SKTPG failed' });
  }
}

// ─── Docs Quality: README + file-tree documentation score (on-demand) ────────
async function runDocsQuality(sessionKey, detected) {
  const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);

  const setDq = async (patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({
      [sessionKey]: { ...cur, docsQuality: { ...(cur.docsQuality || {}), ...patch } },
    });
  };

  try {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    const repoData = {
      repoId: detected.repoId,
      platform: detected.platform,
      description: cur.description || '',
      language: cur.language || '',
      readme: cur.readme || '',
    };

    await setDq({ status: 'fetching', error: null, result: null });
    const source = await fetchSource(detected.platform, detected.repoId);

    await setDq({ status: 'running' });
    const result = parseDocsQuality(
      await callAI(keys, withTone(keys.tone, buildDocsQualityPrompt(repoData, source)), 'docs')
    );

    await setDq({ status: 'done', result });
  } catch (err) {
    await setDq({ status: 'error', error: err.message || 'Docs Quality scan failed' });
  }
}

// ─── Maintenance & Abandonment: commit recency + bus factor + CI (on-demand) ──
async function runMaintenance(sessionKey, detected) {
  const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);

  const setM = async (patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({
      [sessionKey]: { ...cur, maintenance: { ...(cur.maintenance || {}), ...patch } },
    });
  };

  try {
    await setM({ status: 'fetching', error: null, result: null });

    const [signals, source] = await Promise.all([
      fetchMaintenanceSignals(detected.platform, detected.repoId).catch(() => null),
      fetchSource(detected.platform, detected.repoId).catch(() => ({ tree: [], files: [], degraded: true })),
    ]);

    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    const repoData = {
      repoId: detected.repoId,
      description: cur.description || '',
      stars: cur.stars || 0,
      language: cur.language || '',
      license: cur.license || '',
    };

    await setM({ status: 'running' });
    const result = parseMaintenance(
      await callAI(
        keys,
        withTone(keys.tone, buildMaintenancePrompt(repoData, signals, source.tree)),
        'maintenance'
      ),
      signals
    );
    await setM({ status: 'done', result });
  } catch (err) {
    await setM({ status: 'error', error: err.message || 'Maintenance scan failed.' });
  }
}

// ─── Fits MY Stack?: library-grounded fit analysis ────────────────────────────
async function runFitsStack(sessionKey, detected) {
  const setF = async (patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({
      [sessionKey]: { ...cur, fitsStack: { ...(cur.fitsStack || {}), ...patch } },
    });
  };
  try {
    const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);
    await setF({ status: 'fetching', error: null });
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    const repoData = {
      repoId: detected.repoId,
      description: cur.description || '',
      language: cur.language || '',
      category: cur.category || '',
      capabilities: cur.capabilities || [],
    };
    const nearestRepos = await searchLibrary({
      query: [repoData.language, repoData.category, ...(repoData.capabilities || [])]
        .filter(Boolean)
        .join(' '),
      topK: 8,
      excludeRepoId: detected.repoId,
    });

    if (!nearestRepos.length) {
      await setF({
        status: 'done',
        result: {
          verdict: 'new-paradigm',
          summary: 'Your library is empty — scan a few repos first to get a personalised stack fit.',
          integrations: [],
          risks: [],
          recommendation: 'Scan more repos, then re-run Fits MY Stack?',
        },
      });
      return;
    }

    await setF({ status: 'running' });
    const prompt = buildFitsStackPrompt(repoData, nearestRepos);
    const text = await callAI(keys, withTone(keys.tone, prompt), 'fits');
    const result = parseFitsStack(text);
    if (!result) throw new Error('Could not parse stack fit response.');
    await setF({ status: 'done', result });
  } catch (err) {
    await setF({ status: 'error', error: err.message || 'Stack fit analysis failed.' });
  }
}

// ─── Tech-Stack Builder: multi-repo wiring diagram ────────────────────────────
async function runStackBuild(sessionKey, repoIds) {
  const set = async (data) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({ [sessionKey]: { ...cur, ...data } });
  };
  try {
    const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);
    await set({ loading: true, status: 'fetching', error: null });

    // Gather repo data from the library + cache.
    const libRepos = await scrollLibrary({ limit: 500 });
    const libMap = new Map(libRepos.map((r) => [r.repoId, r]));
    const cacheList = await listCached().catch(() => []);
    const cacheMap = new Map(cacheList.map((c) => [c.repoId, c]));

    const repos = repoIds.map((id) => {
      const lib = libMap.get(id) || {};
      const cached = cacheMap.get(id) || {};
      return {
        repoId: id,
        eli5: cached.eli5 || lib.eli5 || '',
        capabilities: lib.capabilities || cached.capabilities || [],
        category: cached.category || lib.category || '',
        language: cached.language || lib.language || '',
      };
    });

    await set({ status: 'thinking' });
    const prompt = buildStackPrompt(repos);
    const text = await callAI(keys, withTone(keys.tone, prompt), 'stack');
    const result = parseStack(text);
    if (!result) throw new Error('Could not parse stack builder response.');
    await set({ loading: false, error: null, repos, result });
  } catch (err) {
    await set({ loading: false, error: err.message || 'Stack build failed.', errorKind: 'api' });
  }
}

// ─── Versus: head-to-head comparison (on-demand) ──────────────────────────────
async function runVersus(sessionKey, detectedA, competitorInput) {
  const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);

  const setVs = async (patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({
      [sessionKey]: { ...cur, versus: { ...(cur.versus || {}), ...patch } },
    });
  };

  const compB = resolveCompetitor(competitorInput);
  try {
    if (!compB.repoId) throw new Error('Enter a competitor repo (e.g. vuejs/vue or a repo URL).');
    await setVs({
      status: 'fetching',
      competitor: compB.repoId,
      a: detectedA.repoId,
      b: compB.repoId,
      error: null,
      result: null,
    });

    const [a, b] = await Promise.all([
      fetchRepoData(detectedA.platform, detectedA.repoId),
      fetchRepoData(compB.platform, compB.repoId),
    ]);

    await setVs({ status: 'running' });
    const result = parseVersus(await callAI(keys, withTone(keys.tone, buildVersusPrompt(a, b)), 'versus'));

    await setVs({ status: 'done', result });

    // Semantic graph: A compared-to B (best-effort).
    const curVs = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await linkRepos({
      source: detectedA.repoId,
      sourcePayload: repoNodePayload(detectedA.repoId, curVs, true),
      targetKey: compB.repoId,
      targetPayload: repoNodePayload(compB.repoId, compB, false),
      label: 'COMPARED_TO',
      properties: { verdict: result?.verdict || '' },
    });
  } catch (err) {
    await setVs({ status: 'error', error: err.message || `Couldn't compare against "${compB.repoId}".` });
  }
}

// ─── Synergies: complementary repos grounded in the library ───────────────────
async function runSynergies(sessionKey, detected) {
  const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);

  const setSyn = async (patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({
      [sessionKey]: { ...cur, synergies: { ...(cur.synergies || {}), ...patch } },
    });
  };

  try {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    const repoData = {
      repoId: detected.repoId,
      platform: detected.platform,
      description: cur.description || '',
      language: cur.language || '',
      category: cur.category || '',
      eli5: cur.eli5 || '',
    };

    await setSyn({ status: 'running', error: null, result: null });
    // Seed candidates from the user's library (same ecosystem, by language).
    const candidates = await searchLibrary({
      query: repoData.language,
      topK: 12,
      excludeRepoId: repoData.repoId,
    });
    const result = parseSynergies(
      await callAI(keys, withTone(keys.tone, buildSynergiesPrompt(repoData, candidates)), 'synergies')
    );

    await setSyn({ status: 'done', result });

    // Semantic graph: target synergizes-with each complement (best-effort).
    const synSource = repoNodePayload(repoData.repoId, repoData, true);
    for (const s of result?.synergies || []) {
      if (!s?.repoId) continue;
      await linkRepos({
        source: repoData.repoId,
        sourcePayload: synSource,
        targetKey: s.repoId,
        targetPayload: {
          repoId: s.repoId,
          name: s.repoId.split('/').pop() || s.repoId,
          category: s.category || '',
          analyzed: !!s.in_library,
        },
        label: 'SYNERGIZES_WITH',
        properties: { why: s.synergy || '' },
      });
    }
  } catch (err) {
    await setSyn({ status: 'error', error: err.message || 'Synergies failed' });
  }
}

// ─── Combinator: fuse complementary library repos into new project ideas ──────
async function runCombinator(sessionKey, detected, { mode = 'repo', wildness = 0 }) {
  const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);

  const setC = async (patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({
      [sessionKey]: { ...cur, combinator: { ...(cur.combinator || {}), ...patch } },
    });
  };

  try {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await setC({ status: 'running', mode, wildness, results: [] });

    let rows = await scrollLibrary();
    if (mode === 'repo') {
      // Repo-anchored: ensure the current repo (the seed) is represented with its capabilities.
      const seedCaps =
        Array.isArray(cur.capabilities) && cur.capabilities.length
          ? cur.capabilities
          : deriveCapabilities(cur);
      const seedRow = {
        repoId: detected.repoId,
        name: detected.repoId.split('/').pop() || detected.repoId,
        capabilities: seedCaps,
        eli5: cur.eli5 || '',
      };
      // Immutable: rebuild rather than mutate the objects scrollLibrary returned.
      rows = rows.some((r) => r.repoId === detected.repoId)
        ? rows.map((r) => (r.repoId === detected.repoId ? { ...r, capabilities: seedRow.capabilities } : r))
        : [...rows, seedRow];
    }

    // Library/studio mode mines the whole library seed-free; pairs only, to bound the candidate count.
    const seed = mode === 'library' ? null : detected.repoId;
    const sizes = mode === 'library' ? [2] : [2, 3];
    const candidates = combineCandidates(rows, { seed, sizes, wildness, topK: 6 });
    if (!candidates.length) {
      await setC({ status: 'done', results: [], total: 0 });
      return;
    }
    await setC({ status: 'running', total: candidates.length });

    const results = [];
    for (const cand of candidates) {
      try {
        const idea = parseCombinator(
          await callAI(keys, withTone(keys.tone, buildCombinatorPrompt(cand.rows)), 'combinator'),
          cand.repoIds
        );
        results.push({ repoIds: cand.repoIds, ...idea });
      } catch {
        /* skip a single failed synthesis, keep going */
      }
      await setC({ status: 'running', results: [...results] }); // incremental render
    }
    await setC({ status: 'done', results });
  } catch (err) {
    await setC({ status: 'error', error: err.message || 'Combinator failed' });
  }
}

// ─── Re-tag the saved library with AI capability tags (opt-in, idempotent) ────
async function runTagLibrary(sessionKey) {
  const keys = await chrome.storage.local.get([...PROVIDER_KEYS, 'tone']);
  const setT = async (patch) => {
    const cur = (await chrome.storage.session.get(sessionKey))[sessionKey] || {};
    await chrome.storage.session.set({ [sessionKey]: { ...cur, retag: { ...(cur.retag || {}), ...patch } } });
  };
  try {
    const points = await scrollPoints();
    await setT({ status: 'running', total: points.length, done: 0 });
    let done = 0;
    for (const pt of points) {
      try {
        const meta = pt.payload || {};
        const caps = parseTags(await callAI(keys, buildTagPrompt(meta), 'retag'));
        if (caps.length) await saveRepo({ ...meta, capabilities: caps }); // re-save preserves the full payload
      } catch {
        /* skip a single repo, keep going */
      }
      done++;
      await setT({ status: 'running', total: points.length, done });
    }
    await setT({ status: 'done', total: points.length, done });
  } catch (err) {
    await setT({ status: 'error', error: err.message || 'Re-tagging failed' });
  }
}

// ─── AI provider abstraction ──────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Serialize AI calls with a minimum gap so bursts don't trip provider rate limits
// (Run-all-lenses fires ~6 flows at once; Deep Dive chains 3 stages; Step 3.7 is
// slow + rate-limited). One call runs at a time, each starting at least `aiGapMs`
// (the Settings slider; default below) after the previous one.
const AI_DEFAULT_GAP_MS = 1200;
let aiChain = Promise.resolve();
let lastAiStart = 0;
// Optional `part` (e.g. 'core', 'deepdive') routes to the user's per-part model choice;
// omitted/unrouted parts use the plain fallback chain.
function callAI(keys, prompt, part) {
  const run = aiChain.then(async () => {
    const { aiGapMs } = await chrome.storage.local.get('aiGapMs');
    const gap = Number.isFinite(aiGapMs) ? aiGapMs : AI_DEFAULT_GAP_MS;
    const wait = Math.max(0, gap - (Date.now() - lastAiStart));
    if (wait) await sleep(wait);
    lastAiStart = Date.now();
    return callAIInner(keys, prompt, part);
  });
  aiChain = run.catch(() => {}); // keep the queue alive even if a call fails
  return run;
}

const PROVIDER_LABEL = {
  nous: 'Nous',
  google: 'Gemini',
  openrouter: 'OpenRouter',
  xai: 'Grok',
  anthropic: 'Anthropic',
};

function providerLabel(provider) {
  return PROVIDER_LABEL[provider] || compatProviderById(provider)?.label || provider;
}

// Dispatch one (provider, model) attempt to its provider call function. The five
// first-class providers have bespoke calls; everything else is a registry provider
// served by the generic OpenAI/Anthropic-compatible engines.
function dispatch(provider, model, keys, prompt) {
  switch (provider) {
    case 'nous':
      return callNous(keys.nousKey, model, prompt);
    case 'google':
      return callGemini(keys.googleKey, model, prompt);
    case 'openrouter':
      return callOpenRouter(keys.openrouterKey, model, prompt);
    case 'xai':
      return callXAI(model, prompt);
    case 'anthropic':
      return callAnthropic(model, prompt);
    default:
      // OpenAI connected via "Sign in with ChatGPT": mint/refresh the API key from the
      // OAuth session on demand instead of using a statically-stored key.
      if (provider === 'openai' && keys[OPENAI_CREDENTIALS_KEY]?.refresh_token) {
        return callOpenAIOAuth(model, prompt);
      }
      if (compatProviderById(provider)) return callCompat(provider, model, keys, prompt);
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Generic dispatch for a registry (OpenAI/Anthropic-compatible) provider.
function callCompat(provider, model, keys, prompt) {
  const endpoint = compatEndpoint(provider, keys);
  if (!endpoint) throw new Error(`${providerLabel(provider)}: no endpoint configured`);
  const key = keys[provKeyName(provider)] || '';
  const protocol = compatProtocol(provider, keys);
  const m = model || compatModelFor(provider, keys);
  if (!m) throw new Error(`${providerLabel(provider)}: choose a model in Settings`);
  if (protocol === 'anthropic') {
    return callAnthropicCompatible({ endpoint, key, model: m, prompt, label: providerLabel(provider) });
  }
  // OpenAI-compatible (and Azure, which differs only in the auth header).
  return callOpenAICompatible({
    endpoint,
    key,
    model: m,
    prompt,
    label: providerLabel(provider),
    headerStyle: protocol === 'azure' ? 'azure' : 'bearer',
  });
}

// Every provider request runs under a hard timeout. Without it a stalled connection
// hangs the (serialized) scan indefinitely — until the output tab's own 90s deadline
// fires with a generic "Analysis timed out". This aborts at the source, surfaces an
// actionable Retry, and lets the attempt plan fall through to the next provider.
const AI_FETCH_TIMEOUT_MS = 60_000;
async function fetchWithTimeout(url, opts = {}, label = 'Provider', ms = AI_FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`${label} timed out after ${Math.round(ms / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// OpenAI-compatible chat completion. `key` may be empty for keyless local servers (Ollama).
// headerStyle 'azure' sends `api-key: <key>` (Azure OpenAI); otherwise `Authorization: Bearer`.
async function callOpenAICompatible({
  endpoint,
  key,
  model,
  prompt,
  label = 'Provider',
  maxTokens = 4096,
  headerStyle = 'bearer',
}) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) {
    if (headerStyle === 'azure') headers['api-key'] = key;
    else headers['Authorization'] = `Bearer ${key}`;
  }
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(openaiBody(model, prompt, maxTokens)),
    },
    label
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? err.message ?? `${label} API error ${res.status}`);
  }
  return parseOpenAiText(await res.json());
}

// Embeddings via the configured OpenAI-protocol provider (BYO-key). Returns
// number[][] aligned to `texts`, or null if no capable provider / on any error
// (callers fall back to lexical matching). Never throws.
async function callEmbeddings(keys, texts) {
  const p = pickEmbeddingsProvider(keys);
  if (!p || !p.endpoint || !p.key || !texts.length) return null;
  try {
    const res = await fetchWithTimeout(p.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${p.key}` },
      body: JSON.stringify(embeddingsBody(p.model, texts)),
    });
    if (!res.ok) return null;
    const vectors = parseEmbeddings(await res.json());
    return vectors.length === texts.length ? { vectors, model: p.model } : null;
  } catch {
    return null;
  }
}

// OpenAI via "Sign in with ChatGPT" (the Codex CLI OAuth flow). The OAuth session is
// exchanged for a normal OpenAI API key; on a 401 we refresh the session, re-mint, and
// retry once. Inference itself is the standard api.openai.com chat-completions engine.
async function callOpenAIOAuth(model = 'gpt-4.1', prompt) {
  let { openaiKey } = await chrome.storage.local.get('openaiKey');
  if (!openaiKey) openaiKey = await mintAndStoreOpenAIKey();

  let res = await openaiChat(openaiKey, model, prompt);
  if (res.status === 401) {
    openaiKey = await mintAndStoreOpenAIKey(); // the minted key may have been revoked — re-mint once
    res = await openaiChat(openaiKey, model, prompt);
  }
  if (!res.ok) {
    if (res.status === 401) {
      await clearOpenAICredentials();
      throw new Error('OpenAI session expired — please reconnect in Settings');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `OpenAI API error ${res.status}`);
  }
  return parseOpenAiText(await res.json());
}

// Refresh the ChatGPT OAuth session and mint a fresh OpenAI API key into the shared slot.
async function mintAndStoreOpenAIKey() {
  const creds = await refreshOpenAIToken({ force: true }); // guarantee a fresh id_token to exchange
  const key = await mintOpenAIApiKey(creds?.id_token);
  await chrome.storage.local.set({ openaiKey: key });
  return key;
}

// Bare OpenAI chat request returning the raw Response, so callers can branch on 401.
function openaiChat(key, model, prompt) {
  return fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(openaiBody(model, prompt, 4096)),
    },
    'OpenAI'
  );
}

// Anthropic-compatible Messages API (x-api-key + anthropic-version).
async function callAnthropicCompatible({
  endpoint,
  key,
  model,
  prompt,
  label = 'Provider',
  maxTokens = 4096,
}) {
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'x-api-key': key,
      },
      body: JSON.stringify(anthropicBody(model, prompt, maxTokens)),
    },
    label
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? err.message ?? `${label} API error ${res.status}`);
  }
  return parseAnthropicText(await res.json());
}

// Provider self-test for the Settings UI. Connection = the endpoint answered at all
// (even an auth/4xx error proves reachability); Function = the model echoed our token.
async function testProvider(provider, keys) {
  const p = compatProviderById(provider);
  if (!p) return { ok: false, connection: false, function: false, detail: 'Unknown provider' };
  // OpenAI connected via "Sign in with ChatGPT" exercises the OAuth → mint → call path.
  const isOpenAiOAuth = provider === 'openai' && !!keys[OPENAI_CREDENTIALS_KEY]?.refresh_token;
  if (!isCompatConnected(provider, keys) && !isOpenAiOAuth) {
    return {
      ok: false,
      connection: false,
      function: false,
      detail: 'Not configured — add a key / endpoint first.',
    };
  }
  const out = { ok: false, connection: false, function: false, detail: '' };
  try {
    const probe = 'Reply with exactly the word READY and nothing else.';
    const reply = isOpenAiOAuth
      ? await callOpenAIOAuth(compatModelFor(provider, keys), probe)
      : await callCompat(provider, compatModelFor(provider, keys), keys, probe);
    out.connection = true;
    out.function = /ready/i.test(reply || '');
    out.ok = out.function;
    out.detail = out.function
      ? 'Model responded correctly.'
      : `Reached the model, but the reply was unexpected: ${String(reply).slice(0, 80)}`;
  } catch (e) {
    const msg = e?.message || String(e);
    // A structured API error (auth/model/quota) still proves the endpoint is reachable.
    const reachable = !/Failed to fetch|NetworkError|ENOTFOUND|ECONNREFUSED|load failed/i.test(msg);
    out.connection = reachable;
    out.detail = reachable
      ? `Endpoint reachable, but the call failed: ${msg}`
      : `Could not reach the endpoint: ${msg}`;
  }
  return out;
}

async function callAIInner(keys, prompt, part) {
  const plan = buildAttemptPlan({ routing: keys.partRouting || {}, part, keys });
  const failures = [];
  for (const { provider, model } of plan) {
    const label = providerLabel(provider);
    try {
      // Retry transient failures (429 / 5xx / network) with backoff before falling
      // through to the next provider; auth/model errors fail over immediately.
      return await withRetry(() => dispatch(provider, model, keys, prompt), {
        retries: 2,
        isRetryable: (e) => categorizeError(e, label).retryable,
        sleep,
      });
    } catch (e) {
      failures.push({ provider: label, error: e });
    }
  }
  if (!failures.length) {
    const e = new Error('No AI provider configured — open Settings to connect one.');
    e.kind = 'none';
    throw e;
  }
  // Surface the single most actionable failure instead of concatenating all of them,
  // and carry its kind so the output tab can route the error CTA (Settings vs Retry).
  const ranked = rankErrors(failures);
  const err = new Error(ranked.userMessage);
  err.kind = ranked.kind;
  throw err;
}

// Anthropic Messages API. Supports either a standard Console API key (x-api-key)
// or Claude Pro/Max OAuth tokens via the same Claude Code beta flow that Pi uses.
async function callAnthropic(model = 'claude-sonnet-4-6', prompt) {
  const s = await chrome.storage.local.get(['anthropicKey', ANTHROPIC_ACCESS_KEY, ANTHROPIC_REFRESH_KEY]);
  if (!s.anthropicKey && !s[ANTHROPIC_ACCESS_KEY] && !s[ANTHROPIC_REFRESH_KEY]) {
    throw new Error('No Anthropic credentials — connect Claude or add an API key in Settings');
  }

  const oauth = !s.anthropicKey;
  const headers = {
    accept: 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'Content-Type': 'application/json',
  };
  if (oauth) {
    headers.Authorization = `Bearer ${await refreshAnthropicAccessToken()}`;
    headers['anthropic-beta'] = 'claude-code-20250219,oauth-2025-04-20';
    headers['x-app'] = 'cli';
  } else {
    headers['x-api-key'] = s.anthropicKey;
  }

  const body = {
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  };
  if (oauth) {
    body.system = "You are Claude Code, Anthropic's official CLI for Claude.";
  }

  const res = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    'Anthropic'
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (oauth && (res.status === 401 || res.status === 403)) await clearAnthropicOAuthTokens();
    throw new Error(err.error?.message ?? `Anthropic API error ${res.status}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Anthropic returned no text content');
  return text;
}

async function callGemini(key, model = 'gemini-3.1-pro-preview', prompt) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' +
    encodeURIComponent(key);
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
      }),
    },
    'Gemini'
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `Gemini API error ${res.status}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text content');
  return text;
}

// Nous Research — Nous Portal API, OpenAI-compatible. Resolves OpenRouter-catalog
// slugs (e.g. stepfun/step-3.7-flash — free 30 days for members) and Nous-native
// names (Hermes-4-405B / Hermes-4-70B). Gates inference behind x402 (Solana
// pay-per-request); a membership API key draws on credits instead.
async function callNous(key, model = 'stepfun/step-3.7-flash', prompt) {
  // Heal the legacy bare Step slug if a saved setting reaches here before the
  // Settings page has had a chance to migrate it.
  if (model === 'Step-3.7-Flash' || model === 'step-3.7-flash') model = 'stepfun/step-3.7-flash';
  const body = JSON.stringify({
    model: model || 'stepfun/step-3.7-flash',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  for (let attempt = 0; ; attempt++) {
    const res = await fetchWithTimeout(
      'https://inference-api.nousresearch.com/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body,
      },
      'Nous'
    );

    // Rate-limited / transient — back off and retry (honor Retry-After), up to 3 times.
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // The endpoint answers a valid model with an x402 payment challenge when the
      // caller isn't drawing on membership credits — surface that plainly.
      if (err.x402Version || res.status === 402) {
        throw new Error(
          'Nous returned a pay-per-request (x402) challenge — your key isn’t drawing on membership credits. Check your plan/key at portal.nousresearch.com.'
        );
      }
      throw new Error(err.error?.message ?? err.message ?? `Nous API error ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Nous returned no text content');
    return text;
  }
}

async function callOpenRouter(key, model = 'x-ai/grok-4.3', prompt) {
  const res = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'x-ai/grok-4.3',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    'OpenRouter'
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `OpenRouter API error ${res.status}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned no text content');
  return text;
}

// xAI Grok — two credential styles:
//   • API key (xai-...) → standard api.x.ai, billed per token
//   • OAuth token (from SuperGrok subscription) → try api.x.ai first, fall back to chat proxy
async function callXAI(model = 'grok-4.3', prompt) {
  const { xaiKey, xaiRefresh } = await chrome.storage.local.get(['xaiKey', 'xaiRefresh']);
  const isOAuth = !!xaiRefresh;
  const token = isOAuth ? await refreshXaiToken() : xaiKey;
  if (!token) throw new Error('No xAI credential — connect in Settings');

  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const body = JSON.stringify({
    model: model || 'grok-4.3',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  // For OAuth tokens: try api.x.ai first (standard API), then chat proxy as fallback
  // Chat proxy requires x-grok-model-override header and specific user-agent
  const endpoints = isOAuth
    ? ['https://api.x.ai/v1/chat/completions', XAI_CHAT_PROXY]
    : ['https://api.x.ai/v1/chat/completions'];

  let lastErr = '';
  for (const endpoint of endpoints) {
    const reqHeaders = { ...headers };
    if (endpoint === XAI_CHAT_PROXY) {
      reqHeaders['x-grok-model-override'] = model || 'grok-4.3';
      reqHeaders['user-agent'] = 'xai-grok-cli';
    }
    const res = await fetchWithTimeout(endpoint, { method: 'POST', headers: reqHeaders, body }, 'xAI');
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return text;
      throw new Error('xAI returned no text content');
    }
    const err = await res.json().catch(() => ({}));
    console.warn('[RepoLens xAI]', endpoint, res.status, JSON.stringify(err));
    lastErr = err.error?.message || 'xAI API error ' + res.status + ' at ' + endpoint;
    if (res.status === 401 && isOAuth) {
      await chrome.storage.local.remove(['xaiKey', 'xaiRefresh', 'xaiExpiry', 'xaiCredentials']);
      throw new Error('xAI session expired — please reconnect in Settings');
    }
    // Only break on 401 (bad auth) — 403/426 might work on the next endpoint
    if (res.status === 401) break;
  }
  throw new Error(lastErr);
}
