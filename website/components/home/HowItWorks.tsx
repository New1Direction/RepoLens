const STEPS = [
  {
    n: '01',
    title: 'Land on any repo',
    body: 'GitHub, GitLab, an npm package, a PyPI project. Wherever you’re evaluating, RepoLens is one icon away.',
  },
  {
    n: '02',
    title: 'Click once',
    body: 'It reads the source and runs it past the AI provider of your choice. The optional runner grounds it in measured facts — never executes repo code.',
  },
  {
    n: '03',
    title: 'Get the verdict',
    body: 'A fit call, health, deep dive, and red flags — opened in a tab and saved to your local library to sort, compare, and revisit.',
  },
];

export function HowItWorks() {
  return (
    <section className="section how-section reveal" aria-labelledby="how-heading">
      <div className="container">
        <span className="eyebrow">How it works</span>
        <h2 id="how-heading" className="section-title">
          Three seconds from page to verdict.
        </h2>

        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n} className="step">
              <span className="step-n grad-text">{s.n}</span>
              <div className="step-body">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
