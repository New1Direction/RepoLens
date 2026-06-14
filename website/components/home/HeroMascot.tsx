'use client';

import { useEffect, useState } from 'react';

// Static assets live in public/ and are NOT auto-prefixed with the GitHub
// Pages basePath the way next/link is — so we prefix the <video>/<img> src by hand.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const CAPTIONS = [
  'Lenses up — reading past the README.',
  'Tracing how the pieces actually fit.',
  'Strong fit? You’ll get the thumbs-up.',
];

const ALT = 'Vee, the RepoLens mascot, peering through a lens';

/**
 * The hero mascot: an autoplaying, muted, looping clip of Vee in a framed
 * stage. Under reduced-motion we show the poster frame instead — no autoplay,
 * no loop — and the caption stops rotating.
 */
export function HeroMascot() {
  const [reduced, setReduced] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(reduce);
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % CAPTIONS.length), 3400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hero-mascot">
      <div className="hero-mascot-stage">
        {reduced ? (
          <img src={`${BASE}/mascot-poster.jpg`} alt={ALT} width={230} height={270} />
        ) : (
          <video
            className="hero-mascot-vid"
            autoPlay
            muted
            loop
            playsInline
            poster={`${BASE}/mascot-poster.jpg`}
            aria-label={ALT}
            width={230}
            height={270}
          >
            <source src={`${BASE}/mascot.mp4`} type="video/mp4" />
          </video>
        )}
      </div>
      <p className="hero-say">{CAPTIONS[reduced ? 0 : i]}</p>
    </div>
  );
}
