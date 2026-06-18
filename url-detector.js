/**
 * Detects whether a URL is a supported repo page and extracts its identity.
 * @param {string} url
 * @returns {{ platform: 'github'|'gitlab'|'npm'|'pypi', repoId: string } | null}
 */
export function detectPlatform(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  if (u.hostname === 'github.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return { platform: 'github', repoId: `${parts[0]}/${parts[1]}` };
  }

  if (u.hostname === 'gitlab.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return { platform: 'gitlab', repoId: `${parts[0]}/${parts[1]}` };
  }

  if (u.hostname === 'www.npmjs.com' && u.pathname.startsWith('/package/')) {
    const name = u.pathname.slice('/package/'.length).split('/v/')[0];
    if (name) return { platform: 'npm', repoId: name };
  }

  if (u.hostname === 'pypi.org' && u.pathname.startsWith('/project/')) {
    const name = u.pathname.slice('/project/'.length).replace(/\/$/, '').split('/')[0];
    if (name) return { platform: 'pypi', repoId: name };
  }

  return null;
}
