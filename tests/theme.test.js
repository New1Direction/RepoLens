import { describe, it, expect, beforeEach, vi } from 'vitest';
import { THEMES, DEFAULT_THEME, applyTheme, initTheme, saveTheme } from '../theme.js';

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
    expect(THEMES.map(t => t.key)).toEqual(['midnight', 'paper', 'terminal', 'synthwave', 'bmw', 'xai', 'claude', 'apple']);
    for (const t of THEMES) {
      expect(t.label).toBeTruthy();
      expect(t.swatch).toBeTruthy();
    }
  });
  it('defaults to midnight', () => {
    expect(DEFAULT_THEME).toBe('midnight');
  });
});

describe('applyTheme', () => {
  it('sets data-theme on <html>', () => {
    applyTheme('terminal');
    expect(document.documentElement.getAttribute('data-theme')).toBe('terminal');
  });
  it('falls back to midnight for an unknown key', () => {
    applyTheme('bogus');
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');
  });
});

describe('initTheme', () => {
  it('applies the stored theme', async () => {
    await chrome.storage.local.set({ theme: 'paper' });
    const key = await initTheme();
    expect(key).toBe('paper');
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
  });
  it('applies midnight when nothing is stored', async () => {
    const key = await initTheme();
    expect(key).toBe('midnight');
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');
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
