const PROVIDERS = [
  'Claude',
  'GPT',
  'Gemini',
  'Grok',
  'DeepSeek',
  'Groq',
  'Qwen',
  'Kimi',
  'GLM',
  'NVIDIA NIM',
  'Ollama',
  'Custom',
];

const POINTS = [
  { k: 'No backend', v: 'There’s no server and no telemetry. The whole library lives in your browser.' },
  { k: 'Your keys', v: 'Keys are stored locally and sent straight to the provider you chose — never to us.' },
  { k: '$0 path', v: 'Run a local Ollama model or a free Gemini tier and pay nothing at all.' },
];

export function ModelsPrivacy() {
  return (
    <section className="section models-section reveal" aria-labelledby="models-heading">
      <div className="container models-grid">
        <div className="models-copy">
          <span className="eyebrow">Models &amp; privacy</span>
          <h2 id="models-heading" className="section-title">
            Bring your own model. Keep your own data.
          </h2>
          <p className="section-note">
            Route the verdict to a fast model and the deep dive to a strong one, with smart
            fallback. Twenty-plus providers behind one registry — any OpenAI- or Anthropic-compatible
            endpoint just works.
          </p>
          <div className="provider-chips" role="list" aria-label="Supported providers">
            {PROVIDERS.map((p) => (
              <span className="provider-chip" role="listitem" key={p}>
                {p}
              </span>
            ))}
          </div>
        </div>

        <ul className="privacy-points">
          {POINTS.map((p) => (
            <li key={p.k}>
              <span className="privacy-k">{p.k}</span>
              <span className="privacy-v">{p.v}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
