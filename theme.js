export const DEFAULT_THEME = 'monoink';

export const THEMES = [
  { key: 'monoink', label: 'Mono Ink', swatch: 'linear-gradient(135deg, #0f1115 50%, #2563eb 50%)' },
  { key: 'midnight', label: 'Midnight', swatch: '#0a0a0f' },
  { key: 'paper', label: 'Paper', swatch: '#f7f7fb' },
  { key: 'terminal', label: 'Terminal', swatch: '#07100b' },
  { key: 'synthwave', label: 'Synthwave', swatch: 'linear-gradient(135deg, #e879f9, #22d3ee)' },
  { key: 'bmw', label: 'BMW M', swatch: 'linear-gradient(90deg, #0066b1 33%, #1c69d4 33% 66%, #e22718 66%)' },
  { key: 'xai', label: 'xAI', swatch: 'linear-gradient(135deg, #0a0a0a 50%, #f5f0e8 50%)' },
  { key: 'claude', label: 'Claude', swatch: '#cc785c' },
  { key: 'apple', label: 'Apple', swatch: '#0066cc' },
  { key: 'nord', label: 'Nord', swatch: 'linear-gradient(135deg, #5e81ac, #88c0d0)' },
  { key: 'gruvbox', label: 'Gruvbox', swatch: 'linear-gradient(135deg, #d65d0e, #fabd2f)' },
  { key: 'rosepine', label: 'Rosé Pine', swatch: 'linear-gradient(135deg, #ebbcba, #c4a7e7)' },
  { key: 'latte', label: 'Catppuccin', swatch: 'linear-gradient(135deg, #8839ef, #7287fd)' },
  { key: 'solarized', label: 'Solarized', swatch: 'linear-gradient(135deg, #fdf6e3 50%, #268bd2 50%)' },
];

function isKnown(key) {
  return THEMES.some((t) => t.key === key);
}

export function applyTheme(key) {
  const theme = isKnown(key) ? key : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

export async function initTheme() {
  const { theme } = await chrome.storage.local.get('theme');
  return applyTheme(theme ?? DEFAULT_THEME);
}

export async function saveTheme(key) {
  const theme = applyTheme(key);
  await chrome.storage.local.set({ theme });
  return theme;
}
