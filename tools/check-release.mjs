#!/usr/bin/env node
// Release consistency gate: every place that states "the current version" must
// agree before a build can be tagged or uploaded to the Chrome Web Store.
//
//   npm run check:release                 check versions agree
//   npm run check:release -- --tag v3.2.0 also require the git tag to match
//   node tools/check-release.mjs --notes  print this version's CHANGELOG section

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const args = process.argv.slice(2);

const version = JSON.parse(read('package.json')).version;
const changelog = read('CHANGELOG.md');
// PRIVACY.md is authoritative; keep the public MDX page mechanically identical.
const privacyPath = 'website/content/docs/privacy.mdx';
const privacyPage = `---\ntitle: Privacy\ndescription: What RepoLens stores, what it sends, and to whom. The extension's privacy policy.\n---\n\n${read(
  'PRIVACY.md'
)
  .replace(/^# RepoLens privacy policy\n\n/, '')
  .replace('(CHANGELOG.md)', '(/changelog)')}`;
if (args.includes('--sync-privacy')) {
  writeFileSync(join(root, privacyPath), privacyPage);
  console.log(`Updated ${privacyPath} from PRIVACY.md`);
  process.exit(0);
}

/** CHANGELOG section for `v`, without its heading. */
function changelogSection(text, v) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${v}]`));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .replace(/\n-{3,}\s*$/, '')
    .trim();
}

if (args.includes('--notes')) {
  const notes = changelogSection(changelog, version);
  if (!notes) {
    console.error(`CHANGELOG.md has no "## [${version}]" section`);
    process.exit(1);
  }
  console.log(notes);
  process.exit(0);
}

const lock = JSON.parse(read('package-lock.json'));
const manifest = JSON.parse(read('manifest.json'));
const releases = read('website/lib/releases.ts');
const whatsNew = read('whats-new.html');
const readme = read('README.md');

const headings = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1]);
const firstRelease = headings.find((h) => h !== 'Unreleased');
const staleUnreleased = headings.indexOf('Unreleased') > headings.indexOf(firstRelease);

const checks = [
  [
    'public privacy policy matches PRIVACY.md',
    read(privacyPath) === privacyPage,
    'run npm run check:release -- --sync-privacy',
  ],
  ['manifest.json version', manifest.version === version, manifest.version],
  [
    'package-lock.json version',
    lock.version === version && lock.packages?.['']?.version === version,
    lock.version,
  ],
  ['CHANGELOG.md newest release heading', firstRelease === version, firstRelease],
  ['CHANGELOG.md has no [Unreleased] section below a release', !staleUnreleased, 'stale [Unreleased]'],
  [
    'website/lib/releases.ts LATEST.version',
    new RegExp(`LATEST: Release = \\{\\s*version: '${version.replace(/\./g, '\\.')}'`).test(releases),
    'LATEST mismatch',
  ],
  ['whats-new.html newest tag', whatsNew.includes(`<span class="vtag new">v${version}</span>`), 'missing'],
  ['whats-new.html title', whatsNew.includes(`<title>RepoLens — v${version} Patch Notes</title>`), 'missing'],
  ['whats-new.html footer', whatsNew.includes(`Now at v${version}.`), 'missing'],
  ['README.md version badge', readme.includes(`badge/version-${version}-`), 'missing'],
];

const tagIdx = args.indexOf('--tag');
if (tagIdx >= 0) {
  const tag = args[tagIdx + 1] || '';
  checks.push(['git tag', tag === `v${version}`, tag || '(none)']);
}

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`Release consistency FAILED for v${version}:\n`);
  for (const [label, , got] of failed) console.error(`  ✗ ${label} (found: ${got})`);
  process.exit(1);
}
console.log(`Release consistency passed — v${version} everywhere (${checks.length} checks).`);
