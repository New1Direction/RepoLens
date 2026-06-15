import { Icon, type IconName } from '@/components/site/Icon';

type Feature = {
  icon: IconName;
  title: string;
  body: string;
  tags: string[];
  span: 'wide' | 'tall' | 'normal';
};

const FEATURES: Feature[] = [
  {
    icon: 'verdict',
    title: 'Verdict-first',
    body: 'A fit call — strong / solid / care / risky — plus a one-line bottom line, before anything else. The decision, then the evidence.',
    tags: ['fit', 'bottom line', 'health'],
    span: 'wide',
  },
  {
    icon: 'search',
    title: 'Discovery & recommendations',
    body: 'Search GitHub from inside the extension, or let RepoLens recommend peers from the repos you’ve already adopted — same capabilities, same language, ones you haven’t seen yet.',
    tags: ['discover', 'recommend', 'github'],
    span: 'wide',
  },
  {
    icon: 'rows',
    title: 'Library + triage',
    body: 'Every scan becomes a sortable, filterable grid. Decide with the keyboard, in flow.',
    tags: ['triage', 'keyboard'],
    span: 'normal',
  },
  {
    icon: 'kanban',
    title: 'Boards',
    body: 'Group the repos you’re weighing into collections you can compare and revisit.',
    tags: ['collections'],
    span: 'normal',
  },
  {
    icon: 'star',
    title: 'Evaluations',
    body: 'Score repos 1–5 against your own weighted rubric. The badge follows each card.',
    tags: ['rubric', 'scoring'],
    span: 'normal',
  },
  {
    icon: 'bars',
    title: 'N-way compare',
    body: 'Put any 2–10 repos side-by-side in a structured matrix; export to CSV or Markdown.',
    tags: ['matrix', 'export'],
    span: 'normal',
  },
  {
    icon: 'layers',
    title: 'Deep Dive',
    body: 'Atoms → lineage → a Feynman-style explanation, optionally grounded in measured facts from the source: real file counts, the dependency graph, tests, and a secret scan.',
    tags: ['eli5', 'lineage', 'grounded'],
    span: 'wide',
  },
  {
    icon: 'clock',
    title: 'Drift alerts',
    body: 'A daily background check flags repos that have gone stale, so your shortlist stays honest.',
    tags: ['stale', 'daily'],
    span: 'normal',
  },
  {
    icon: 'sliders',
    title: 'Bring any model',
    body: 'Your keys, 20+ providers, route each part of a scan to a different model — or run local Ollama for $0.',
    tags: ['byo-keys', 'local'],
    span: 'normal',
  },
];

export function FeatureBento() {
  return (
    <section className="section feature-section reveal" aria-labelledby="features-heading">
      <div className="container">
        <span className="eyebrow">The case file</span>
        <h2 id="features-heading" className="section-title">
          A research tool, not a bookmark folder.
        </h2>
        <p className="section-note">
          Thirty-plus releases of compounding workflow — from the first verdict to a library that
          finds its own peers.
        </p>

        <div className="bento">
          {FEATURES.map((f) => (
            <article key={f.title} className={`feat feat-${f.span}`}>
              <div className="feat-ic" aria-hidden="true">
                <Icon name={f.icon} size={26} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <div className="feat-tags">
                {f.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
