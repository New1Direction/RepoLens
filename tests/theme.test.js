import { describe, it, expect, beforeEach, vi } from 'vitest';
import { THEMES, DEFAULT_THEME, applyTheme, initTheme, saveTheme } from '../theme.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

beforeEach(() => {
  // The test environment is 'node' (no jsdom), so mock the minimal DOM we touch,
  // matching the project's pattern of mocking globals.
  const attrs = {};
  global.document = {
    documentElement: {
      setAttribute: (k, v) => { attrs[k] = v; },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      removeAttribute: (k) => { delete attrs[k]; },
    },
  };
  const store = {};
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k) => (typeof k === 'string' ? { [k]: store[k] } : { ...store })),
        set: vi.fn(async (obj) => { Object.assign(store, obj); }),
      },
    },
  };
});

describe('THEMES', () => {
  it('has all themes with key, label, swatch', () => {
    expect(THEMES.map(t => t.key)).toEqual([
      'monoink', 'midnight', 'paper', 'terminal', 'synthwave', 'bmw', 'xai', 'claude',
      'apple', 'nord', 'gruvbox', 'rosepine', 'latte', 'solarized',
    ]);
    for (const t of THEMES) {
      expect(t.label).toBeTruthy();
      expect(t.swatch).toBeTruthy();
    }
  });
  it('defaults to monoink', () => {
    expect(DEFAULT_THEME).toBe('monoink');
  });
});

describe('applyTheme', () => {
  it('sets data-theme on <html>', () => {
    applyTheme('terminal');
    expect(document.documentElement.getAttribute('data-theme')).toBe('terminal');
  });
  it('falls back to the default for an unknown key', () => {
    applyTheme('bogus');
    expect(document.documentElement.getAttribute('data-theme')).toBe('monoink');
  });
});

describe('initTheme', () => {
  it('applies the stored theme', async () => {
    await chrome.storage.local.set({ theme: 'paper' });
    const key = await initTheme();
    expect(key).toBe('paper');
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
  });
  it('applies the default when nothing is stored', async () => {
    const key = await initTheme();
    expect(key).toBe('monoink');
    expect(document.documentElement.getAttribute('data-theme')).toBe('monoink');
  });
});

describe('saveTheme', () => {
  it('applies and persists the theme', async () => {
    await saveTheme('synthwave');
    expect(document.documentElement.getAttribute('data-theme')).toBe('synthwave');
    const { theme } = await chrome.storage.local.get('theme');
    expect(theme).toBe('synthwave');
  });
});

describe('themes.css Mono Ink block', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../themes.css'),
    'utf8',
  );

  it('defines a [data-theme="monoink"] block', () => {
    expect(css).toContain('[data-theme="monoink"]');
  });

  it('maps the full per-theme token vocabulary', () => {
    const monoink = css.slice(css.indexOf('[data-theme="monoink"]'));
    const block = monoink.slice(0, monoink.indexOf('}') + 1);
    const REQUIRED = [
      '--body-bg', '--bg', '--surface', '--surface-alt', '--border', '--border-2',
      '--text', '--text-strong', '--text-body', '--text-sub', '--text-muted',
      '--text-faint', '--text-fainter',
      '--accent', '--accent-deep', '--accent-deep-hover', '--accent-grad',
      '--font', '--mono', '--card-shadow',
    ];
    for (const token of REQUIRED) {
      expect(block.includes(token), `monoink block is missing ${token}`).toBe(true);
    }
  });

  it('uses the cobalt accent for monoink', () => {
    const monoink = css.slice(css.indexOf('[data-theme="monoink"]'));
    const block = monoink.slice(0, monoink.indexOf('}') + 1);
    expect(block).toContain('#2563eb');
  });
});
