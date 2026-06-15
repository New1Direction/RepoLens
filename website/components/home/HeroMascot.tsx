'use client';

import { Component, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

// Static assets live in public/ and are NOT auto-prefixed with the GitHub Pages
// basePath the way next/link is — so we prefix the <video>/<img> src by hand.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const CAPTIONS = [
  'Lenses up — reading past the README.',
  'Tracing how the pieces actually fit.',
  'Strong fit? You’ll get the thumbs-up.',
];

const ALT = 'Vee, the RepoLens mascot, peering through a lens';

// The WebGL scene is heavy (three.js) — load it lazily and client-only so it
// never touches the initial bundle or the server render.
const HeroLens3D = dynamic(() => import('./HeroLens3D'), { ssr: false });

/** If the 3D scene throws (WebGL context lost, chunk load fail, …) fall back to
 *  the poster rather than blanking the hero. */
class LensBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Poster() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export (output: export); next/image adds no value for this decorative poster
    <img src={`${BASE}/mascot-poster.jpg`} alt={ALT} width={230} height={270} />
  );
}

/**
 * The hero mascot. On a capable desktop (fine pointer, motion OK, WebGL, wide
 * enough) Vee appears inside a floating refractive glass lens that tracks the
 * cursor. Everywhere else — touch, reduced-motion, no WebGL, narrow, or while
 * the 3D chunk loads — the original framed clip / poster shows instead.
 */
export function HeroMascot() {
  const [reduced, setReduced] = useState(false);
  const [use3D, setUse3D] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(reduce);

    const fine = window.matchMedia('(pointer: fine)').matches;
    const wide = window.matchMedia('(min-width: 880px)').matches;
    let webgl = false;
    try {
      const c = document.createElement('canvas');
      webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      webgl = false;
    }
    setUse3D(!reduce && fine && wide && webgl);

    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % CAPTIONS.length), 3400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hero-mascot">
      {use3D ? (
        <div className="hero-lens-3d" aria-label={ALT} role="img">
          <LensBoundary fallback={<div className="hero-mascot-stage">{<Poster />}</div>}>
            <HeroLens3D />
          </LensBoundary>
        </div>
      ) : (
        <div className="hero-mascot-stage">
          {reduced ? (
            <Poster />
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
      )}
      <p className="hero-say">{CAPTIONS[reduced ? 0 : i]}</p>
    </div>
  );
}
