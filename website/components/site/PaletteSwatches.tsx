'use client';

import { useEffect, useState } from 'react';

type Palette = { id: string; label: string; dot: string };

/** Accent-only palettes layered on top of light/dark via [data-palette]. */
const PALETTES: Palette[] = [
  { id: 'aurora', label: 'Aurora', dot: 'linear-gradient(120deg,#8b7cff,#3b82f6,#22d3ee)' },
  { id: 'terminal', label: 'Terminal', dot: 'linear-gradient(120deg,#6ee7b7,#10b981)' },
  { id: 'nord', label: 'Nord', dot: 'linear-gradient(120deg,#88c0d0,#5e81ac)' },
  { id: 'claude', label: 'Claude', dot: 'linear-gradient(120deg,#e8a87c,#c15f3c)' },
];

const STORAGE_KEY = 'repolens-palette';

function applyPalette(id: string) {
  const root = document.documentElement;
  if (id === 'aurora') root.removeAttribute('data-palette');
  else root.setAttribute('data-palette', id);
}

export function PaletteSwatches() {
  const [active, setActive] = useState('aurora');

  // Sync to whatever the anti-FOUC script already applied.
  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (stored) setActive(stored);
  }, []);

  const choose = (id: string) => {
    setActive(id);
    applyPalette(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode — palette just won't persist */
    }
  };

  return (
    <div className="swatches" role="group" aria-label="Accent palette">
      {PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`swatch${active === p.id ? ' is-on' : ''}`}
          aria-pressed={active === p.id}
          onClick={() => choose(p.id)}
        >
          <span className="swatch-dot" style={{ background: p.dot }} aria-hidden="true" />
          {p.label}
        </button>
      ))}
    </div>
  );
}
