/** Vee's expressions, each mapped to a real scan moment. */
export type VeeState =
  | 'resting'
  | 'scanning'
  | 'thinking'
  | 'strong'
  | 'risky'
  | 'empty'
  | 'error';

type Props = {
  /** Which expression to show. Drive this from a parent for animation. */
  state?: VeeState;
  /** Pixel size of the lens. */
  size?: number;
  /** Accessible label; when omitted the lens is decorative (aria-hidden). */
  label?: string;
  className?: string;
};

/**
 * The RepoLens lens mark. A pure, token-aware SVG — colour comes from CSS
 * custom properties, so it re-skins with the theme and accent palette for
 * free. Expression is a class swap; all motion lives in CSS behind
 * `prefers-reduced-motion`. No state of its own — a parent owns any loop.
 */
export function Vee({ state = 'resting', size = 48, label, className }: Props) {
  const stateClass = state === 'resting' ? '' : `is-${state}`;
  const aria = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };

  return (
    <span className={`vee ${stateClass} ${className ?? ''}`.trim()} {...aria}>
      <svg viewBox="0 0 48 48" width={size} height={size} fill="none" focusable="false">
        <circle
          className="vee-barrel"
          cx="24"
          cy="24"
          r="17"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.32"
        />
        <g
          className="vee-ticks"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.28"
        >
          <line x1="24" y1="3.5" x2="24" y2="7.5" />
          <line x1="24" y1="40.5" x2="24" y2="44.5" />
          <line x1="3.5" y1="24" x2="7.5" y2="24" />
          <line x1="40.5" y1="24" x2="44.5" y2="24" />
        </g>
        <circle
          className="vee-aperture"
          cx="24"
          cy="24"
          r="9"
          stroke="var(--accent)"
          strokeWidth="3"
        />
        <circle className="vee-pupil" cx="24" cy="24" r="2.4" fill="var(--accent)" />
      </svg>
    </span>
  );
}
