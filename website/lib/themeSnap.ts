/**
 * Flip the theme with a camera-style "snap": a quick white flash masks an
 * instant theme swap — like snapping a screenshot of the repo. GPU-cheap (one
 * fading overlay, no full-page snapshot), so there's no lag. Reduced-motion gets
 * a plain instant flip.
 *
 * Used by the theme toggle (ThemeToggle).
 */
export function snapToTheme(setTheme: (theme: string) => void, next: string): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTheme(next);
    return;
  }

  const flash = document.createElement('div');
  flash.className = 'theme-flash';
  document.body.appendChild(flash);

  // Next frame: run the flash. Swap the theme at its bright peak so the change
  // is hidden behind the flash, then clean up after it fades.
  requestAnimationFrame(() => flash.classList.add('is-on'));
  window.setTimeout(() => setTheme(next), 110);
  window.setTimeout(() => flash.remove(), 460);
}
