async function fetchJson(url, headers) {
  const r = await fetch(url, headers ? { headers } : undefined);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// Authorization header for GitHub when an MCP caller supplies a token; null
// otherwise, so the anonymous path stays byte-for-byte identical (extension use).
function ghHeaders(opts) {
  return opts && opts.githubToken ? { Authorization: `Bearer ${opts.githubToken}` } : null;
}

export async function fetchRepoData(platform, repoId, opts = {}) {
  if (platform === 'github') return fetchGitHub(repoId, opts);
  if (platform === 'gitlab') return fetchGitLab(repoId);
  if (platform === 'npm')    return fetchNpm(repoId);
  if (platform === 'pypi')   return fetchPyPI(repoId);
  throw new Error(`Unsupported platform: ${platform}`);
}

// Normalise a {language: bytes} map into a top-5 [{name, pct}] composition.
function bytesToComposition(langs) {
  const total = Object.values(langs).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return Object.entries(langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({ name, pct: Math.round((bytes / total) * 100) }));
}

async function fetchGitHub(repoId, opts = {}) {
  const headers = ghHeaders(opts);
  const init = headers ? { headers } : undefined;
  const [meta, readmeRes, langRes] = await Promise.all([
    fetchJson(`https://api.github.com/repos/${repoId}`, headers),
    fetch(`https://api.github.com/repos/${repoId}/readme`, init).catch(() => ({ ok: false })),
    fetch(`https://api.github.com/repos/${repoId}/languages`, init).catch(() => ({ ok: false })),
  ]);
  let readme = '';
  if (readmeRes.ok) {
    const readmeData = await readmeRes.json().catch(() => null);
    if (readmeData?.encoding === 'base64') {
      readme = atob(readmeData.content.replace(/\n/g, ''));
    }
  }
  let languages = [];
  try {
    if (langRes?.ok) languages = bytesToComposition(await langRes.json());
  } catch { /* leave empty; bar falls back to single language */ }
  if (!languages.length && meta.language) languages = [{ name: meta.language, pct: 100 }];

  return {
    platform: 'github', repoId, description: meta.description || '',
    language: meta.language || 'Unknown', license: meta.license?.spdx_id || 'Unknown',
    stars: meta.stargazers_count || 0, readme, languages, dependencies: [],
  };
}

async function fetchGitLab(repoId) {
  const encoded = encodeURIComponent(repoId);
  const [meta, readmeRes, langRes] = await Promise.all([
    fetchJson(`https://gitlab.com/api/v4/projects/${encoded}`),
    fetch(`https://gitlab.com/api/v4/projects/${encoded}/repository/files/README.md/raw?ref=HEAD`).catch(() => null),
    fetch(`https://gitlab.com/api/v4/projects/${encoded}/languages`).catch(() => ({ ok: false })),
  ]);
  let readme = '';
  if (readmeRes?.ok) readme = await readmeRes.text();
  let languages = [];
  try {
    if (langRes?.ok) {
      const langs = await langRes.json();
      languages = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, pct]) => ({ name, pct: Math.round(pct) }));
    }
  } catch { /* best effort */ }
  if (!languages.length && meta.language) languages = [{ name: meta.language, pct: 100 }];

  return {
    platform: 'gitlab', repoId, description: meta.description || '',
    language: meta.language || 'Unknown', license: 'Unknown',
    stars: meta.star_count || 0, readme, languages, dependencies: [],
  };
}

async function fetchNpm(repoId) {
  const data = await fetchJson(`https://registry.npmjs.org/${repoId}`);
  const latest = data['dist-tags']?.latest;
  const deps = data.versions?.[latest]?.dependencies || {};
  const dependencies = Object.entries(deps).slice(0, 30).map(([name, version]) => ({ name, version: String(version) }));
  return {
    platform: 'npm', repoId, description: data.description || '', language: 'JavaScript',
    license: data.versions?.[latest]?.license || 'Unknown', stars: 0,
    readme: (data.readme || '').slice(0, 8000),
    languages: [{ name: 'JavaScript', pct: 100 }], dependencies,
  };
}

// PyPI requires_dist entries look like "numpy (>=1.20)", "requests>=2.0", or "x; extra=='dev'".
function parsePyDep(spec) {
  const head = spec.split(';')[0].trim();
  const m = head.match(/^([A-Za-z0-9._-]+)\s*(.*)$/);
  if (!m) return null;
  const version = (m[2] || '').replace(/[()]/g, '').trim();
  return { name: m[1], version };
}

/**
 * Fetch GitHub-specific maintenance signals: last push, archived flag,
 * issue/fork counts, and top-5 contributor login + commit share.
 * Returns null for non-GitHub repos or on failure.
 */
export async function fetchMaintenanceSignals(platform, repoId) {
  if (platform !== 'github') return null;
  try {
    const [meta, contribRes] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${repoId}`),
      fetch(`https://api.github.com/repos/${repoId}/contributors?per_page=5&anon=0`).catch(() => ({ ok: false })),
    ]);
    let topContributors = [];
    if (contribRes.ok) {
      const data = await contribRes.json().catch(() => []);
      if (Array.isArray(data)) {
        topContributors = data.slice(0, 5).map(c => ({ login: String(c.login || ''), contributions: Number(c.contributions) || 0 }));
      }
    }
    return {
      pushedAt: meta.pushed_at || null,
      archived: !!meta.archived,
      openIssues: meta.open_issues_count || 0,
      forks: meta.forks_count || 0,
      watchers: meta.subscribers_count || 0,
      topContributors,
    };
  } catch {
    return null;
  }
}

async function fetchPyPI(repoId) {
  const data = await fetchJson(`https://pypi.org/pypi/${repoId}/json`);
  const info = data.info;
  const dependencies = (info.requires_dist || []).map(parsePyDep).filter(Boolean).slice(0, 30);
  return {
    platform: 'pypi', repoId, description: info.summary || '', language: 'Python',
    license: info.license || 'Unknown', stars: 0,
    readme: (info.description || '').slice(0, 8000),
    languages: [{ name: 'Python', pct: 100 }], dependencies,
  };
}
