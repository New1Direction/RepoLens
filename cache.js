// Analysis cache + history — persists each completed scan in chrome.storage.local
// keyed by repo, so revisiting a repo loads instantly (no AI call) and Options can
// list everything analyzed. Lens results (session-only) and the raw README are
// not cached.

const PREFIX = 'rlcache:';
const LENS_KEYS = ['deepDive', 'systems', 'ideate', 'prioritize', 'sktpg', 'versus', 'synergies'];

export function cacheKey(platform, repoId) {
  return `${PREFIX}${platform}:${repoId}`;
}

/** Store a completed analysis (trimmed of README + transient lens results). */
export async function cacheAnalysis(platform, repoId, data) {
  const trimmed = { ...data };
  delete trimmed.readme;
  for (const k of LENS_KEYS) delete trimmed[k];
  delete trimmed.loading;
  delete trimmed.status;
  trimmed.platform = platform;
  trimmed.repoId = repoId;
  trimmed.cachedAt = Date.now();
  await chrome.storage.local.set({ [cacheKey(platform, repoId)]: trimmed });
}

export async function getCached(platform, repoId) {
  const k = cacheKey(platform, repoId);
  return (await chrome.storage.local.get(k))[k] || null;
}

/** All cached analyses, newest first. */
export async function listCached() {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([, v]) => v)
    .sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
}

export async function removeCached(platform, repoId) {
  await chrome.storage.local.remove(cacheKey(platform, repoId));
}

/** Open a cached/saved analysis in a fresh output tab — instant, no AI call.
 * Shared by Options' History list and the Library's cards. */
export async function openCachedAnalysis(analysis) {
  const key = 'repolens_' + crypto.randomUUID();
  await chrome.storage.session.set({ [key]: { ...analysis, cached: true, loading: false } });
  chrome.tabs.create({ url: chrome.runtime.getURL(`output-tab.html?key=${key}`) });
}

const KNOWN_PLATFORMS = new Set(['github', 'gitlab', 'npm', 'pypi']);

/** Restore cached analyses from a backup. 'replace' clears the cache first;
 * 'merge' (default) upserts by repo. Only entries for known platforms are
 * accepted, so a crafted backup can't inject odd cache keys. Returns how many
 * entries were written. */
export async function importCache(entries = [], { mode = 'merge' } = {}) {
  if (mode === 'replace') await clearCache();
  const valid = (entries || []).filter((c) => c && c.repoId && KNOWN_PLATFORMS.has(c.platform));
  const obj = {};
  for (const c of valid) obj[cacheKey(c.platform, c.repoId)] = c;
  if (Object.keys(obj).length) await chrome.storage.local.set(obj);
  return valid.length;
}

/** Remove every cached analysis (the rlcache:* keys), leaving settings intact.
 * Returns the number of entries cleared. */
export async function clearCache() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  return keys.length;
}
