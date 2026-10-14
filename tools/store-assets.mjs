#!/usr/bin/env node
// Chrome Web Store assets from the real extension UI and brand icon.
//
//   npm ci
//   node tools/store-assets.mjs --chrome /path/to/chrome [--ext DIR]
//
// Always uses a disposable credential-free profile, showing the shipped DEMO
// tour and unconnected Settings. Never represents a fixture as a live AI scan.
// Writes docs/store/assets/: store-icon-128.png, promo-small-440x280.png,
// screenshot-1-library.png, screenshot-2-settings.png.

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const chrome = arg('chrome', process.env.CHROME_PATH);
const ext = resolve(arg('ext', root));
const out = join(root, 'docs/store/assets');

if (!chrome) {
  console.error('Pass --chrome /path/to/chrome (or set CHROME_PATH).');
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const icon = `data:image/png;base64,${readFileSync(join(root, 'icons/icon128.png')).toString('base64')}`;
const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));

const profile = mkdtempSync(join(tmpdir(), 'repolens-assets-'));
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: chrome,
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const base = `chrome-extension://${new URL(sw.url()).host}`;
  await new Promise((r) => setTimeout(r, 1000));
  for (const p of ctx.pages()) await p.close(); // first-run Settings tab

  // Brand assets: rendered from the shipped icon, no invented artwork.
  const brand = await ctx.newPage();
  await brand.setViewportSize({ width: 128, height: 128 });
  await brand.setContent(
    `<body style="margin:0;background:transparent"><img src="${icon}" style="width:128px;height:128px;display:block"></body>`
  );
  await brand.screenshot({ path: join(out, 'store-icon-128.png'), omitBackground: true, scale: 'css' });
  await brand.setViewportSize({ width: 440, height: 280 });
  await brand.setContent(`<body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;
      justify-content:center;padding:0 36px;box-sizing:border-box;background:#0e1014;color:#f4f6fb;
      font-family:Inter,'Segoe UI',system-ui,sans-serif">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="${icon}" style="width:56px;height:56px">
      <span style="font-size:34px;font-weight:800;letter-spacing:-0.02em">${manifest.name}</span>
    </div>
    <p style="font-size:21px;line-height:1.3;margin:20px 0 0;color:#c7cedb">${manifest.description}</p>
    <p style="font-size:14px;margin:14px 0 0;color:#5b8def;font-weight:600">Bring your own model · no RepoLens server</p>
  </body>`);
  await brand.screenshot({ path: join(out, 'promo-small-440x280.png'), scale: 'css' });
  await brand.close();

  const library = await ctx.newPage();
  await library.goto(`${base}/library.html`);
  await library.waitForSelector('.cm-card');
  await library.getByRole('button', { name: 'Next', exact: true }).click();
  await library.waitForSelector('.cm-badge-demo');
  await library.waitForTimeout(800);
  await library.screenshot({ path: join(out, 'screenshot-1-library.png'), scale: 'css' });

  const settings = await ctx.newPage();
  await settings.goto(`${base}/options.html`);
  await settings.waitForSelector('#theme-picker .theme-chip');
  await settings.waitForTimeout(1500);
  await settings.screenshot({ path: join(out, 'screenshot-2-settings.png'), scale: 'css' });

  console.log(`Wrote store assets to ${out}`);
} finally {
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
}
