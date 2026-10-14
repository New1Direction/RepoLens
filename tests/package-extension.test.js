import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  buildZip,
  collectPackageFiles,
  listZip,
  readerFor,
  validatePackage,
} from '../tools/extension-package.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// Minimal 1×1-pixel-header PNG with the given dimensions (only IHDR is read).
const png = (size) => {
  const b = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(b);
  b.writeUInt32BE(size, 16);
  b.writeUInt32BE(size, 20);
  return b;
};

function fixture(overrides = {}) {
  const icons = { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' };
  const manifest = {
    manifest_version: 3,
    name: 'Fixture',
    version: '1.2.3',
    description: 'Fixture extension.',
    permissions: ['storage'],
    host_permissions: ['https://api.github.com/*'],
    background: { service_worker: 'src/bg.js', type: 'module' },
    options_page: 'options.html',
    action: { default_icon: icons },
    icons,
  };
  const tree = {
    'manifest.json': JSON.stringify(manifest),
    'options.html': '<script type="module" src="src/options.js"></script>',
    'src/bg.js': "import { x } from './lib.js';\nchrome.tabs.create({ url: 'options.html' });",
    'src/lib.js': 'export const x = 1;',
    'src/options.js': "import confetti from '../vendor/confetti.mjs';",
    'vendor/confetti.mjs': 'export default () => {};',
    'icons/16.png': png(16),
    'icons/32.png': png(32),
    'icons/48.png': png(48),
    'icons/128.png': png(128),
    ...overrides,
  };
  for (const [k, v] of Object.entries(tree)) if (v === undefined) delete tree[k];
  return {
    files: Object.keys(tree).sort(),
    read: (p) => Buffer.from(tree[p]),
    packageVersion: '1.2.3',
    permissionsDoc: '`storage` `https://api.github.com/*`',
  };
}

describe('validatePackage', () => {
  it('accepts a well-formed package', () => {
    expect(validatePackage(fixture())).toEqual([]);
  });

  it.each([
    ['inline script', { 'options.html': '<script>alert(1)</script>' }, /inline <script>/],
    ['inline handler', { 'options.html': '<form onsubmit="return false"></form>' }, /onsubmit= handler/],
    // The 3.1.1 Library regression: a script moved into src/ kept its ./vendor/ import.
    [
      'import that resolves from the wrong directory',
      { 'src/options.js': "import c from './vendor/confetti.mjs';" },
      /resolves to missing src\/vendor\/confetti\.mjs/,
    ],
    [
      'missing extension page',
      { 'src/bg.js': "chrome.tabs.create({ url: 'gone.html?x=1' });" },
      /runtime URL gone\.html/,
    ],
    [
      'missing script referenced by HTML',
      { 'src/options.js': undefined },
      /options\.html: references missing file src\/options\.js/,
    ],
    ['remote module', { 'src/lib.js': "import 'https://cdn.example.com/x.js';" }, /remote module/],
    ['wrongly sized icon', { 'icons/48.png': png(64) }, /icons\[48\] is 64×64/],
    ['dev file in package', { 'tests/a.test.js': '' }, /forbidden file in package: tests\/a\.test\.js/],
    ['test under runtime root', { 'src/a.test.js': '' }, /forbidden file/],
    ['credential file', { 'src/credentials.json': '{}' }, /forbidden file/],
    ['path traversal', { '../leak.js': '' }, /unsafe package path/],
    [
      'embedded key',
      { 'src/lib.js': `export const key = 'sk-${'x'.repeat(40)}';` },
      /possible embedded secret/,
    ],
    ['private key', { 'src/key.js': '-----BEGIN PRIVATE KEY-----' }, /possible embedded secret/],
  ])('rejects %s', (_label, overrides, pattern) => {
    const errors = validatePackage(fixture(overrides));
    expect(
      errors.some((e) => pattern.test(e)),
      errors.join('\n')
    ).toBe(true);
  });

  it('rejects version drift and undocumented permissions', () => {
    const f = fixture();
    const errors = validatePackage({ ...f, packageVersion: '1.2.4', permissionsDoc: '`storage`' });
    expect(errors).toContain('manifest version 1.2.3 != package.json version 1.2.4');
    expect(errors).toContain(
      'permission https://api.github.com/* has no justification in docs/store/chrome-web-store.md'
    );
  });

  it.each(['01.2.3', '65536.0.1', '0.0.0'])('rejects Chrome-invalid version %s', (version) => {
    const f = fixture();
    const manifest = JSON.parse(f.read('manifest.json'));
    expect(
      validatePackage(fixture({ 'manifest.json': JSON.stringify({ ...manifest, version }) })).join('\n')
    ).toMatch(/each 0–65535/);
  });

  it('rejects insecure remote permissions but accepts explicit loopback', () => {
    const manifest = JSON.parse(fixture().read('manifest.json'));
    for (const [host, rejected] of [
      ['http://*/*', true],
      ['http://localhost/*', false],
    ]) {
      const f = fixture({
        'manifest.json': JSON.stringify({ ...manifest, optional_host_permissions: [host] }),
      });
      const errors = validatePackage({ ...f, permissionsDoc: undefined });
      expect(errors.some((e) => e.includes('explicit loopback'))).toBe(rejected);
    }
  });

  it('excludes stray root pages and refuses symlinked runtime roots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repolens-package-test-'));
    try {
      writeFileSync(join(dir, 'debug.html'), 'private development page');
      writeFileSync(join(dir, 'options.html'), 'runtime page');
      expect(collectPackageFiles(dir)).toEqual(['options.html']);
      symlinkSync(join(dir, 'debug.html'), join(dir, 'src'));
      expect(() => collectPackageFiles(dir)).toThrow(/Symlink/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes on the real extension tree, which ships no dev files', () => {
    const files = collectPackageFiles(root);
    const read = readerFor(root);
    const errors = validatePackage({
      read,
      files,
      packageVersion: JSON.parse(read('package.json')).version,
      permissionsDoc: readFileSync(new URL('../docs/store/chrome-web-store.md', import.meta.url), 'utf8'),
    });
    expect(errors).toEqual([]);
    expect(files).toEqual(
      expect.arrayContaining(['manifest.json', 'LICENSE', 'library.html', 'vendor/confetti.mjs'])
    );
    expect(
      files.filter((f) => /^(tests|mcp|website|docs|demos|tools)\/|package\.json$|README\.md$/.test(f))
    ).toEqual([]);
  });
});

describe('buildZip', () => {
  const entries = [
    { path: 'b/data.txt', data: Buffer.from('hello hello hello hello hello hello') },
    { path: 'a.json', data: Buffer.from('{}') },
    { path: 'icons/x.png', data: png(16) },
  ];

  it('is byte-identical regardless of input order', () => {
    expect(buildZip(entries).equals(buildZip([...entries].reverse()))).toBe(true);
  });

  it('round-trips every entry, sorted, with correct contents', () => {
    const zip = buildZip(entries);
    expect(listZip(zip)).toEqual(['a.json', 'b/data.txt', 'icons/x.png']);
    // Walk local headers independently of listZip and inflate each body.
    let p = 0;
    const out = {};
    while (zip.readUInt32LE(p) === 0x04034b50) {
      const method = zip.readUInt16LE(p + 8);
      const size = zip.readUInt32LE(p + 18);
      const nameLen = zip.readUInt16LE(p + 26);
      const name = zip.subarray(p + 30, p + 30 + nameLen).toString();
      const body = zip.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
      out[name] = method === 8 ? inflateRawSync(body) : body;
      p += 30 + nameLen + size;
    }
    for (const e of entries) expect(out[e.path].equals(e.data)).toBe(true);
  });
});
