import { Vee, type VeeState } from '@/components/site/Vee';

const EXPRESSIONS: { state: VeeState; label: string }[] = [
  { state: 'resting', label: 'On the case' },
  { state: 'scanning', label: 'Reading' },
  { state: 'thinking', label: 'Deep dive' },
  { state: 'strong', label: 'Cleared' },
  { state: 'risky', label: 'Suspicious' },
  { state: 'empty', label: 'Off duty' },
];

export function ThemeShowcase() {
  return (
    <section className="section showcase-section reveal" aria-labelledby="showcase-heading">
      <div className="container">
        <span className="eyebrow">The detective</span>
        <h2 id="showcase-heading" className="section-title">Vee reads every case.</h2>
        <p className="section-note">
          The lens mascot reacts to what it finds — wide-open on a clean repo, narrowed and
          skeptical on a risky one. Every expression maps to a real scan moment, and all of it
          folds to a static glyph under reduced-motion. Works the day shift or the night stakeout.
        </p>

        <div className="showcase-panel">
          <div className="expression-strip">
            {EXPRESSIONS.map((e) => (
              <div className="expression" key={e.state}>
                <Vee state={e.state} size={46} />
                <span className="expression-label">{e.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
