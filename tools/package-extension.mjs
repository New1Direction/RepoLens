#!/usr/bin/env node
// Builds the Chrome Web Store upload: dist/repolens-v<version>.zip (+ .sha256).
//
//   npm run package          validate, build, verify, write dist/
//   npm run package:check    validate only (no files written)
//
// Automated guard for common packaging and MV3 failures (not a store approval):
// missing/forbidden files, inline scripts, unresolved imports, icon sizes,
// manifest limits, version drift, or a permission without a store justification.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildZip,
  collectPackageFiles,
  listZip,
  pngSize,
  readerFor,
  validatePackage,
} from './extension-package.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const read = readerFor(root);
const files = collectPackageFiles(root);
const packageVersion = JSON.parse(read('package.json')).version;
const permissionsDoc = readFileSync(join(root, 'docs/store/chrome-web-store.md'), 'utf8');

const errors = validatePackage({ read, files, packageVersion, permissionsDoc });
const storeFiles = ['docs/store/chrome-web-store.md', 'PRIVACY.md'];
for (const [name, width, height] of [
  ['store-icon-128.png', 128, 128],
  ['promo-small-440x280.png', 440, 280],
  ['screenshot-1-library.png', 1280, 800],
  ['screenshot-2-settings.png', 1280, 800],
]) {
  const path = `docs/store/assets/${name}`;
  storeFiles.push(path);
  try {
    const size = pngSize(read(path));
    if (size?.width !== width || size?.height !== height)
      errors.push(`Store asset must be ${width}×${height}: ${path}`);
  } catch {
    errors.push(`Missing store asset: ${path}`);
  }
}
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
const hash = (data) => createHash('sha256').update(data).digest('hex');
const inventoryName = `repolens-v${packageVersion}.files.json`;
writeFileSync(
  join(outDir, inventoryName),
  JSON.stringify(
    entries.map(({ path, data }) => ({ path, bytes: data.length, sha256: hash(data) })),
    null,
    2
  ) + '\n'
);
writeFileSync(
  join(outDir, `${inventoryName}.sha256`),
  `${hash(readFileSync(join(outDir, inventoryName)))}  ${inventoryName}\n`
);
const kitName = `repolens-v${packageVersion}-store-kit.zip`;
const kit = buildZip(storeFiles.map((path) => ({ path, data: read(path) })));
writeFileSync(join(outDir, kitName), kit);
writeFileSync(join(outDir, `${kitName}.sha256`), `${hash(kit)}  ${kitName}\n`);
console.log(`Wrote dist/${name}\nsha256 ${sha256}`);
console.log(`Wrote dist/${kitName} (listing materials only — NOT an extension upload) and ${inventoryName}`);
