'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { snapToTheme } from '@/lib/themeSnap';

/**
 * Sun⇄moon toggle that *morphs*: in dark mode a cutout circle carves the orb
 * into a crescent and the rays retract; switching to light slides the cutout
 * away and the rays bloom out. Pure CSS transitions on the SVG geometry,
 * driven by the resolved theme; instant under reduced-motion.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes resolves client-side only — render a stable shell on the
  // server pass to avoid a hydration mismatch.
  useEffect(() => setMounted(true), []);

  const isLight = mounted && resolvedTheme !== 'dark';
  const label = mounted ? `Switch to ${isLight ? 'dark' : 'light'} mode` : 'Toggle theme';

  // A camera-style flash "snaps" the page into the new theme (see .theme-flash
  // in global.css). Instant flip under reduced-motion.
  const runToggle = () => snapToTheme(setTheme, isLight ? 'dark' : 'light');

  return (
    <button
      type="button"
      className={`theme-toggle${isLight ? ' is-light' : ''}`}
      onClick={runToggle}
      aria-label={label}
      title={label}
    >
      <svg className="tt-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <mask id="tt-moon-mask">
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle className="tt-cutout" cx="17" cy="8" r="6" fill="black" />
        </mask>
        <circle
          className="tt-orb"
          cx="12"
          cy="12"
          r="6"
          fill="currentColor"
          mask="url(#tt-moon-mask)"
        />
        <g className="tt-rays" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <line x1="12" y1="1.4" x2="12" y2="3.8" />
          <line x1="12" y1="20.2" x2="12" y2="22.6" />
          <line x1="1.4" y1="12" x2="3.8" y2="12" />
          <line x1="20.2" y1="12" x2="22.6" y2="12" />
          <line x1="4.1" y1="4.1" x2="5.8" y2="5.8" />
          <line x1="18.2" y1="18.2" x2="19.9" y2="19.9" />
          <line x1="4.1" y1="19.9" x2="5.8" y2="18.2" />
          <line x1="18.2" y1="5.8" x2="19.9" y2="4.1" />
        </g>
      </svg>
    </button>
  );
}
