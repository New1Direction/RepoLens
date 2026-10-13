#!/usr/bin/env node
// Builds the Chrome Web Store upload: dist/repolens-v<version>.zip (+ .sha256).
//
//   npm run package          validate, build, verify, write dist/
//   npm run package:check    validate only (no files written)
//
// Fails on anything that would get the upload rejected or ship a broken page:
// missing/forbidden files, inline scripts, unresolved imports, icon sizes,
// manifest limits, version drift, or a permission without a store justification.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip, collectPackageFiles, listZip, readerFor, validatePackage } from './extension-package.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const read = readerFor(root);
const files = collectPackageFiles(root);
const packageVersion = JSON.parse(read('package.json')).version;
const permissionsDoc = readFileSync(join(root, 'docs/store/chrome-web-store.md'), 'utf8');

const errors = validatePackage({ read, files, packageVersion, permissionsDoc });
if (errors.length) {
  console.error(`Package validation FAILED (${errors.length}):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const entries = files.map((path) => ({ path, data: read(path) }));
const zip = buildZip(entries);
const rebuilt = buildZip(entries.slice().reverse());
if (!zip.equals(rebuilt)) {
  console.error('Package build is not deterministic: two builds of the same tree differ.');
  process.exit(1);
}
const listed = listZip(zip);
if (listed.join('\n') !== files.join('\n')) {
  console.error('Package archive does not list exactly the validated files.');
  process.exit(1);
}

const sha256 = createHash('sha256').update(zip).digest('hex');
const unpacked = entries.reduce((n, e) => n + e.data.length, 0);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  `Package validation passed — ${files.length} files, ${kb(unpacked)} unpacked, ${kb(zip.length)} zipped.`
);

if (checkOnly) process.exit(0);

const name = `repolens-v${packageVersion}.zip`;
const outDir = join(root, 'dist');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, name), zip);
writeFileSync(join(outDir, `${name}.sha256`), `${sha256}  ${name}\n`);
console.log(`Wrote dist/${name}\nsha256 ${sha256}`);
