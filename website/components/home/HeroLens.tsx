'use client';

import { useEffect, useState } from 'react';
import { Vee, type VeeState } from '@/components/site/Vee';

const SEQUENCE: { state: VeeState; ms: number; say: string }[] = [
  { state: 'scanning', ms: 2600, say: 'Reading the source — the boring, important part.' },
  { state: 'thinking', ms: 1900, say: 'Tracing how the pieces actually fit together…' },
  { state: 'strong', ms: 3400, say: 'Looked hard. Couldn’t find the catch. Rare.' },
];

/** The hero lens: drives Vee's expression loop and narrates each beat. */
export function HeroLens() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setI(2); // settle on the payoff
      return;
    }
    let idx = 0;
    let timer = setTimeout(function run() {
      idx = (idx + 1) % SEQUENCE.length;
      setI(idx);
      timer = setTimeout(run, SEQUENCE[idx].ms);
    }, SEQUENCE[0].ms);
    return () => clearTimeout(timer);
  }, []);

  const beat = SEQUENCE[i];

  return (
    <div className="hero-lens">
      <div className="hero-lens-stage">
        <Vee state={beat.state} size={92} label="Vee, the RepoLens mascot, reading a repository" />
      </div>
      {/* Decorative narration synced to the animation — not a live region, so
          it doesn't interrupt screen readers every few seconds (WCAG 2.2.2). */}
      <p className="hero-say">{beat.say}</p>
    </div>
  );
}
