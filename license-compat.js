// License Compatibility — deterministic SPDX-bucket comparison. No AI, no network,
// runs instantly from library data. Tells you whether a new dependency's license
// conflicts with what you already have.

/** Canonical SPDX id → compatibility bucket. */
export const SPDX_BUCKETS = {
  // Permissive
  MIT: 'permissive',
  ISC: 'permissive',
  Unlicense: 'permissive',
  '0BSD': 'permissive',
  'BSD-2-Clause': 'permissive',
  'BSD-3-Clause': 'permissive',
  'Apache-2.0': 'permissive',
  Zlib: 'permissive',
  WTFPL: 'permissive',
  'CC0-1.0': 'permissive',
  'BlueOak-1.0.0': 'permissive',
  // Weak copyleft — modifications must be shared, but you can link freely
  'LGPL-2.0-only': 'weak-copyleft',
  'LGPL-2.0-or-later': 'weak-copyleft',
  'LGPL-2.1-only': 'weak-copyleft',
  'LGPL-2.1-or-later': 'weak-copyleft',
  'LGPL-3.0-only': 'weak-copyleft',
  'LGPL-3.0-or-later': 'weak-copyleft',
  'MPL-2.0': 'weak-copyleft',
  'CDDL-1.0': 'weak-copyleft',
  'EPL-1.0': 'weak-copyleft',
  'EPL-2.0': 'weak-copyleft',
  // Strong copyleft — derivative works must use the same license
  'GPL-2.0-only': 'strong-copyleft',
  'GPL-2.0-or-later': 'strong-copyleft',
  'GPL-3.0-only': 'strong-copyleft',
  'GPL-3.0-or-later': 'strong-copyleft',
  'AGPL-3.0-only': 'strong-copyleft',
  'AGPL-3.0-or-later': 'strong-copyleft',
};

// Short aliases the GitHub API commonly returns (not always valid SPDX)
const ALIASES = {
  'GPL-2.0': 'GPL-2.0-only',
  'GPL-3.0': 'GPL-3.0-only',
  'LGPL-2.0': 'LGPL-2.0-only',
  'LGPL-2.1': 'LGPL-2.1-only',
  'LGPL-3.0': 'LGPL-3.0-only',
  'AGPL-3.0': 'AGPL-3.0-only',
};

const BUCKET_LABELS = {
  permissive: 'Permissive',
  'weak-copyleft': 'Weak Copyleft',
  'strong-copyleft': 'Strong Copyleft',
  unknown: 'Unknown',
};

/**
 * Normalize a license string to a canonical SPDX id, then map to a bucket.
 * @param {string} license
 * @returns {'permissive'|'weak-copyleft'|'strong-copyleft'|'unknown'}
 */
export function bucketFor(license) {
  const s = String(license || '').trim();
  if (!s || s === 'Unknown' || s === 'NOASSERTION') return 'unknown';
  const canonical = ALIASES[s] || s;
  return SPDX_BUCKETS[canonical] || 'unknown';
}

export function bucketLabel(bucket) {
  return BUCKET_LABELS[bucket] || 'Unknown';
}

/**
 * One-to-one compatibility check between two licenses.
 * @returns {{ status: 'ok'|'warn'|'conflict', note: string }}
 */
export function checkPairCompat(licenseA, licenseB) {
  const bA = bucketFor(licenseA);
  const bB = bucketFor(licenseB);

  if (bA === 'unknown' || bB === 'unknown') {
    return { status: 'warn', note: 'One or both licenses are unrecognized — review manually.' };
  }
  if (bA === 'permissive' && bB === 'permissive') {
    return { status: 'ok', note: 'Both permissive — no restrictions on combination.' };
  }
  if (bA === 'permissive' && bB === 'weak-copyleft') {
    return { status: 'ok', note: 'Permissive + weak copyleft — OK to link; modified files must be shared.' };
  }
  if (bA === 'weak-copyleft' && bB === 'permissive') {
    return { status: 'ok', note: 'Weak copyleft + permissive — OK to link; modified files must be shared.' };
  }
  if (bA === 'permissive' && bB === 'strong-copyleft') {
    return {
      status: 'conflict',
      note: 'Permissive + strong copyleft — distribution of proprietary code alongside this is restricted. Review use-case carefully.',
    };
  }
  if (bA === 'strong-copyleft' && bB === 'permissive') {
    return {
      status: 'conflict',
      note: 'Strong copyleft + permissive — the strong-copyleft license may require your entire project to be open-sourced on distribution.',
    };
  }
  if (bA === 'weak-copyleft' && bB === 'weak-copyleft') {
    return {
      status: 'warn',
      note: 'Both weak copyleft — usually compatible, but verify the specific licenses allow combination.',
    };
  }
  if (
    (bA === 'weak-copyleft' && bB === 'strong-copyleft') ||
    (bA === 'strong-copyleft' && bB === 'weak-copyleft')
  ) {
    return {
      status: 'warn',
      note: 'Weak + strong copyleft — the strong-copyleft license may pull the weak-copyleft code under its terms. Legal review recommended.',
    };
  }
  if (bA === 'strong-copyleft' && bB === 'strong-copyleft') {
    // Same license = OK; different = potentially incompatible
    const a = (ALIASES[licenseA] || licenseA).replace(/-only$/, '').replace(/-or-later$/, '');
    const b = (ALIASES[licenseB] || licenseB).replace(/-only$/, '').replace(/-or-later$/, '');
    if (a === b) return { status: 'ok', note: 'Same strong-copyleft license family — compatible.' };
    return {
      status: 'conflict',
      note: 'Two different strong-copyleft licenses — typically incompatible. Legal review required.',
    };
  }
  return { status: 'warn', note: 'Unable to determine compatibility automatically — review manually.' };
}

/**
 * Check the current repo's license against all repos in the library.
 * @param {string} currentLicense - SPDX id of the repo being scanned
 * @param {{ repoId: string, license: string }[]} libraryRepos
 * @returns {{ currentBucket, bucketCounts, concerns, summary, totalChecked }}
 */
export function checkLibraryCompat(currentLicense, libraryRepos) {
  const currentBucket = bucketFor(currentLicense);
  const repos = (libraryRepos || []).filter((r) => r && r.repoId && r.license && r.license !== 'Unknown');

  const bucketCounts = { permissive: 0, 'weak-copyleft': 0, 'strong-copyleft': 0, unknown: 0 };
  const concerns = [];

  for (const repo of repos) {
    const b = bucketFor(repo.license);
    bucketCounts[b] = (bucketCounts[b] || 0) + 1;
    const { status, note } = checkPairCompat(currentLicense, repo.license);
    if (status !== 'ok') {
      concerns.push({ repoId: repo.repoId, license: repo.license, status, note });
    }
  }

  const conflicts = concerns.filter((c) => c.status === 'conflict').length;
  const warns = concerns.filter((c) => c.status === 'warn').length;

  let summary;
  if (!repos.length) {
    summary = 'No repos with known licenses in your library to compare against.';
  } else if (conflicts > 0) {
    summary = `${conflicts} conflict${conflicts > 1 ? 's' : ''} found with your library — review before shipping.`;
  } else if (warns > 0) {
    summary = `No outright conflicts, but ${warns} repo${warns > 1 ? 's' : ''} warrant a closer look.`;
  } else {
    summary = `${currentLicense} is compatible with all ${repos.length} repo${repos.length > 1 ? 's' : ''} in your library with known licenses.`;
  }

  return { currentBucket, bucketCounts, concerns, summary, totalChecked: repos.length };
}
