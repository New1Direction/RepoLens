// Chrome Web Store packaging: file selection, release validation, and a
// deterministic ZIP writer. Shared by `npm run package` (tools/package-extension.mjs)
// and the unit tests, so CI and a local build apply exactly the same rules.
//
// Determinism: entries are sorted, every timestamp is pinned to 1980-01-01 (the
// ZIP epoch), permissions are a fixed 0644, and nothing host-specific (uid,
// extra fields, comments) is written. The same tree on the same Node/zlib versions
// produces a byte-identical archive.

import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import { deflateRawSync } from 'node:zlib';

// Everything the extension loads at runtime. Anything outside these roots
// (tests, docs, website, mcp, demos, tooling, lockfiles) never reaches users.
export const PACKAGE_ROOTS = [
  'manifest.json',
  'LICENSE',
  'CHANGELOG.md',
  'src',
  'icons',
  'vendor',
  'batch.html',
  'library.html',
  'options.html',
  'output-tab.html',
  'share.html',
  'stack-tab.html',
  'whats-new.html',
  'mascot.css',
  'palette.css',
  'themes.css',
];

// Defence in depth: a file matching any of these is a packaging bug even if a
// root above accidentally starts covering it.
const FORBIDDEN = [
  /(^|\/)\./, // dotfiles and dot-directories
  /(^|\/)(node_modules|tests?|coverage|website|mcp|docs|demos|tools|dist)\//,
  /(^|\/)(package(-lock)?\.json|eslint\.config\.js|vitest\.config\.js)$/,
  /\.(map|zip|log|bak|pem|key|p12|pfx|sqlite|db)$/i,
  /(^|\/)(?:secrets?|credentials?)(?:[.-]|$)/i,
  /\.(?:test|spec)\.[cm]?js$/,
];

// High-confidence signatures only; never echo matched credentials in diagnostics.
// This is a release guard, not a guarantee that arbitrary secrets are detectable.
const SECRET_SIGNATURES = [
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  /\b(?:sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{35}|AKIA[A-Z0-9]{16})\b/,
  /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*["']?\s*[:=]\s*["'][A-Za-z0-9_+/.=-]{24,}["']/i,
];

export const REQUIRED_ICON_SIZES = [16, 32, 48, 128];
export const STORE_LIMITS = { name: 75, shortName: 12, description: 132 };

/** Sorted, POSIX-style list of files that go into the store package. */
export function collectPackageFiles(rootDir) {
  const files = [];
  const walk = (rel) => {
    const abs = join(rootDir, rel);
    const stat = lstatSync(abs);
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed in package: ${rel}`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(abs)) walk(posix.join(rel, name));
    } else if (stat.isFile()) {
      files.push(rel);
    } else {
      throw new Error(`Not a regular package file: ${rel}`);
    }
  };
  for (const root of PACKAGE_ROOTS) {
    if (existsSync(join(rootDir, root))) walk(root);
  }
  return [...new Set(files)].filter((f) => !f.split('/').some((p) => p === '.DS_Store')).sort();
}

export function pngSize(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== sig) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// A local reference is a relative path inside the package (no scheme, not an
// anchor, not a data: URI). Query strings and fragments are dropped.
function localRef(raw) {
  const ref = raw.trim();
  if (!ref || ref.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) return null;
  return ref.split(/[?#]/)[0] || null;
}

function resolveFrom(file, ref) {
  return posix.normalize(posix.join(posix.dirname(file), ref));
}

/**
 * Validates a package file set against the rules the Chrome Web Store (and a
 * working MV3 extension) depend on. Returns a list of human-readable errors;
 * an empty list means these automated checks passed, not that store approval is guaranteed.
 *
 * @param {object} opts
 * @param {(rel: string) => Buffer} opts.read      reads a file by package path
 * @param {string[]} opts.files                    package file list
 * @param {string} opts.packageVersion             package.json version
 * @param {string} [opts.permissionsDoc]           store permission justification doc
 */
export function validatePackage({ read, files, packageVersion, permissionsDoc }) {
  const errors = [];
  const fileSet = new Set(files);
  const has = (p) => fileSet.has(p);

  for (const f of files) {
    if (FORBIDDEN.some((re) => re.test(f))) errors.push(`forbidden file in package: ${f}`);
    if (posix.normalize(f) !== f || f.startsWith('/') || f.startsWith('../') || f.includes('\\')) {
      errors.push(`unsafe package path: ${f}`);
    }
    if (!/\.(?:png|svg|html|css|m?js|json|md)$/.test(f) && f !== 'LICENSE') {
      errors.push(`unexpected file type in package: ${f}`);
    }
    if (SECRET_SIGNATURES.some((re) => re.test(read(f).toString('utf8')))) {
      errors.push(`possible embedded secret in package: ${f}`);
    }
  }
  if (!has('manifest.json')) return [...errors, 'manifest.json missing'];

  let manifest;
  try {
    manifest = JSON.parse(read('manifest.json').toString('utf8'));
  } catch (err) {
    return [...errors, `manifest.json is not valid JSON: ${err.message}`];
  }

  // ── Manifest shape ────────────────────────────────────────────────────────
  if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version || '') ||
    manifest.version.split('.').some((part) => Number(part) > 65535) ||
    manifest.version === '0.0.0'
  ) {
    errors.push(
      `manifest version "${manifest.version}" must be MAJOR.MINOR.PATCH, each 0–65535, not all zero`
    );
  }
  if (packageVersion && manifest.version !== packageVersion) {
    errors.push(`manifest version ${manifest.version} != package.json version ${packageVersion}`);
  }
  if (!manifest.name || manifest.name.length > STORE_LIMITS.name) {
    errors.push(`manifest name must be 1–${STORE_LIMITS.name} chars`);
  }
  if (manifest.short_name && manifest.short_name.length > STORE_LIMITS.shortName) {
    errors.push(`manifest short_name must be ≤ ${STORE_LIMITS.shortName} chars`);
  }
  if (!manifest.description || manifest.description.length > STORE_LIMITS.description) {
    errors.push(`manifest description must be 1–${STORE_LIMITS.description} chars`);
  }
  for (const key of ['key', 'update_url']) {
    if (key in manifest) errors.push(`manifest must not set "${key}" for a store upload`);
  }

  // ── Files the manifest points at ──────────────────────────────────────────
  const manifestRefs = [
    manifest.background?.service_worker,
    manifest.options_page,
    manifest.options_ui?.page,
    manifest.action?.default_popup,
    ...(manifest.content_scripts || []).flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
  ].filter(Boolean);
  for (const ref of manifestRefs) {
    if (!has(ref)) errors.push(`manifest references missing file: ${ref}`);
  }
  for (const [label, icons] of [
    ['icons', manifest.icons],
    ['action.default_icon', manifest.action?.default_icon],
  ]) {
    for (const size of REQUIRED_ICON_SIZES) {
      const ref = icons?.[size];
      if (!ref) {
        errors.push(`${label} is missing the ${size}px icon`);
        continue;
      }
      if (!has(ref)) {
        errors.push(`${label}[${size}] references missing file: ${ref}`);
        continue;
      }
      const dims = pngSize(read(ref));
      if (!dims) errors.push(`${label}[${size}] is not a PNG: ${ref}`);
      else if (dims.width !== size || dims.height !== size) {
        errors.push(`${label}[${size}] is ${dims.width}×${dims.height}, expected ${size}×${size}: ${ref}`);
      }
    }
  }

  // ── Extension pages: MV3 CSP compliance + local references ────────────────
  const csp = manifest.content_security_policy?.extension_pages || '';
  if (/unsafe-(inline|eval)|https?:/.test(csp)) {
    errors.push(`extension_pages CSP must not allow inline/eval/remote script: ${csp}`);
  }
  const hosts = [...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])];
  for (const host of hosts) {
    if (!host.startsWith('https://') && !['http://localhost/*', 'http://127.0.0.1/*'].includes(host)) {
      errors.push(`host permission must use HTTPS or explicit loopback: ${host}`);
    }
  }
  for (const file of files.filter((f) => f.endsWith('.html'))) {
    const html = read(file).toString('utf8');
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attrs = m[1];
      const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!src && m[2].trim() && !/type\s*=\s*["']application\/(ld\+)?json["']/i.test(attrs)) {
        errors.push(`${file}: inline <script> is blocked by the MV3 CSP — move it to a file`);
      }
      if (src && /^(https?:)?\/\//i.test(src)) errors.push(`${file}: remote script ${src} (remote code)`);
    }
    for (const m of html.matchAll(/<[a-z][^>]*\s(on[a-z]+)\s*=\s*["']/gi)) {
      errors.push(`${file}: inline ${m[1]}= handler is blocked by the MV3 CSP`);
    }
    for (const m of html.matchAll(
      /<(?:script|link|img|source|iframe|a)\b[^>]*\s(?:src|href)\s*=\s*["']([^"']+)["']/gi
    )) {
      const ref = localRef(m[1]);
      if (ref && !has(resolveFrom(file, ref))) errors.push(`${file}: references missing file ${ref}`);
    }
  }

  // ── Scripts: module graph + runtime page URLs ─────────────────────────────
  for (const file of files.filter((f) => /\.m?js$/.test(f))) {
    const js = read(file).toString('utf8');
    const specifiers = [
      ...js.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/gm),
      ...js.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
      ...js.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]);
    for (const spec of specifiers) {
      if (/^(https?:)?\/\//i.test(spec)) {
        errors.push(`${file}: imports remote module ${spec} (remote code)`);
      } else if (spec.startsWith('.')) {
        const target = resolveFrom(file, spec);
        if (!has(target)) errors.push(`${file}: import "${spec}" resolves to missing ${target}`);
      } else {
        errors.push(`${file}: bare import "${spec}" cannot load in an extension`);
      }
    }
    // chrome.runtime.getURL('page.html…') / tabs.create({ url: 'page.html…' }) resolve
    // against the extension root, not the calling script.
    for (const m of js.matchAll(
      /(?:getURL\(\s*|\burl:\s*)['"`]([a-z0-9_./-]+\.(?:html|png|svg|css|js))(?=[?#'"`$])/gi
    )) {
      if (!has(posix.normalize(m[1]))) errors.push(`${file}: runtime URL ${m[1]} is not in the package`);
    }
  }

  // ── Every permission must have a store justification ──────────────────────
  if (permissionsDoc != null) {
    const requested = [
      ...(manifest.permissions || []),
      ...(manifest.host_permissions || []),
      ...(manifest.optional_permissions || []),
      ...(manifest.optional_host_permissions || []),
    ];
    for (const perm of requested) {
      if (!permissionsDoc.includes('`' + perm + '`')) {
        errors.push(`permission ${perm} has no justification in docs/store/chrome-web-store.md`);
      }
    }
  }

  return errors;
}

// ── Deterministic ZIP ───────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const UNIX_FILE_0644 = (0o100644 << 16) >>> 0;

/** @param {{ path: string, data: Buffer }[]} entries */
export function buildZip(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { path, data } of sorted) {
    const name = Buffer.from(path, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: UNIX, spec 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(UNIX_FILE_0644, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** Lists the entry names of a ZIP produced by buildZip (central directory walk). */
export function listZip(zip) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip: end of central directory missing');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory');
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    names.push(zip.subarray(p + 46, p + 46 + nameLen).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/** Convenience for callers working against a checkout on disk. */
export function readerFor(rootDir) {
  return (rel) => readFileSync(join(rootDir, rel));
}
