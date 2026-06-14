import { Vee, type VeeState } from '@/components/site/Vee';
import { PaletteSwatches } from '@/components/site/PaletteSwatches';

const EXPRESSIONS: { state: VeeState; label: string }[] = [
  { state: 'resting', label: 'Resting' },
  { state: 'scanning', label: 'Scanning' },
  { state: 'thinking', label: 'Deep dive' },
  { state: 'strong', label: 'Strong' },
  { state: 'risky', label: 'Risky' },
  { state: 'empty', label: 'Empty' },
];

export function ThemeShowcase() {
  return (
    <section className="section showcase-section reveal" aria-labelledby="showcase-heading">
      <div className="container">
        <span className="eyebrow">Make it yours</span>
        <h2 id="showcase-heading" className="section-title">
          Vee <span className="grad-text">speaks every theme.</span>
        </h2>
        <p className="section-note">
          One token-aware lens, thirteen themes, one accent swap away. Try a palette — the whole
          page and the mascot re-skin live. Every expression maps to a real scan moment, and all of
          it folds to a static glyph under reduced-motion.
        </p>

        <div className="showcase-panel">
          <div className="showcase-controls">
            <span className="showcase-controls-label">Accent</span>
            <PaletteSwatches />
          </div>

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
