/**
 * Release history — ported verbatim from the extension's whats-new.html so the
 * site stays accurate to what actually shipped. Newest first.
 */
export type Release = {
  version: string;
  /** Release codename / theme. */
  theme: string;
  date: string;
  summary: string;
  /** Optional bullet highlights for the bigger releases. */
  highlights?: string[];
};

export const LATEST: Release = {
  version: '3.0.0',
  theme: 'Discover',
  date: 'Jun 14, 2026',
  summary:
    'Five features that turn your library from a passive catalogue into an active research tool.',
  highlights: [
    'Discovery mode — search GitHub from inside the extension; results filtered to repos you don’t already have.',
    'Recommendations — peers suggested from your own adopted and trial decisions.',
    'N-way compare — any 2–10 repos as columns in a structured matrix, exportable to CSV or Markdown.',
    'Decision-matrix export — the full visible library with fit, health, decisions, and per-rubric eval scores.',
    'Drift alerts — a daily background check flags repos that have gone stale.',
  ],
};

export const RELEASES: Release[] = [
  {
    version: '2.9.0',
    theme: 'Evaluate',
    date: 'Jun 14, 2026',
    summary:
      'Evaluations Workbench: score repos 1–5 against a custom weighted rubric (e), a weighted-average badge on every card, sort by eval score, an evaluated-only filter, and a one-command auto-decide from Vee’s fit suggestion.',
  },
  {
    version: '2.8.0',
    theme: 'Delta',
    date: 'Jun 14, 2026',
    summary:
      'Fit delta tracking: re-scan any repo and a ↑ green / ↓ amber badge shows exactly how the verdict moved. Triage % pill, hover preview with decision and note, r to re-scan the focused card, and three smart palette filters.',
  },
  {
    version: '2.7.0',
    theme: 'Triage',
    date: 'Jun 14, 2026',
    summary:
      'Keyboard-first decisions: a d popover with Vee’s suggestion, bulk assign in select mode, triage progress chips, search-term highlighting, decision dates, a “recently decided” sort, and a compact density toggle.',
  },
  {
    version: '2.6.0',
    theme: 'Smooth',
    date: 'Jun 14, 2026',
    summary:
      'Event-delegated library grid (O(1) wiring, zero listener leaks), a hover preview flyout with ELI5 and strengths, inline clickable capability tags, and an extended j/k/n/c/p/Esc keyboard suite.',
  },
  {
    version: '2.5.0',
    theme: 'Knowledge',
    date: 'Jun 14, 2026',
    summary:
      'AI head-to-head compare for library cards, per-repo personal notes, full-text search across ELI5 summaries, one-click Markdown export, and a natural-language filter — type a question with ? and get a ranked list back.',
  },
  {
    version: '2.4.0',
    theme: 'Memory',
    date: 'Jun 14, 2026',
    summary:
      'Persistent Ask history across sessions, multi-turn conversations with full prior context, library pinning, URL-paste analysis without navigating, and a fit-distribution bar in the stats.',
  },
  {
    version: '2.3.0',
    theme: 'Decide',
    date: 'Jun 14, 2026',
    summary:
      'A Tech Radar that organises your library by Adopt / Trial / Hold / Reject, decision badges in the header and verdict, five new keyboard shortcuts, and Markdown radar export.',
  },
  {
    version: '2.2.0',
    theme: 'Navigate',
    date: 'Jun 14, 2026',
    summary:
      'Every tab deep-linkable via URL hash, a clickable repo name, f for a fresh scan from anywhere, star counts on cards, batch-scan notifications, per-repo tab memory, and a decision filter.',
  },
  {
    version: '2.1.0',
    theme: 'Flow',
    date: 'Jun 14, 2026',
    summary:
      'Workflow friction removed: a board popover from the analysis, a diff callout on the verdict, a paste-URL error screen, Copy-for-Slack, a fit emoji in the tab title, and a refresh-stale batch shortcut.',
  },
  {
    version: '1.9.0',
    theme: 'Ask',
    date: 'Jun 14, 2026',
    summary:
      'Ask This Repo — grounded Q&A using the cached analysis with five turns of history, no extra AI call for context, and an a shortcut that jumps straight to it.',
  },
  {
    version: '1.8.0',
    theme: 'Workbench',
    date: 'Jun 13, 2026',
    summary: 'A full evaluation workbench around each scan.',
    highlights: [
      'Docs Quality — an A–F grade across six README/docs dimensions.',
      'Decision Log — Adopt / Trial / Hold / Reject with a note, indexed in IndexedDB.',
      'Compare mode — a side-by-side capability diff for any two library repos.',
      'Scaffold Export — a CLAUDE.md-ready integration template as a .md download.',
    ],
  },
  {
    version: '1.7.0',
    theme: 'Boards, Vee & motion',
    date: 'Jun 13, 2026',
    summary: 'Collections, the lens mascot, and a tactile motion pass — all behind reduced-motion.',
    highlights: [
      'Boards — group the repos you’re weighing; membership travels in backup.',
      'Vee — one theme-aware SVG lens: wide-open on a strong fit, narrowed on risky.',
      'Actionable errors — a bad key links to Settings; a transient failure offers Retry.',
    ],
  },
  {
    version: '1.6.0',
    theme: 'Claude is API-key only',
    date: 'Jun 13, 2026',
    summary:
      'Removed the Claude subscription sign-in (Anthropic prohibits third-party use of those tokens) and shipped the clean Console-API-key path. Grok, OpenRouter, and ChatGPT sign-ins are unaffected.',
  },
  {
    version: '1.5.0',
    theme: 'Sign in with ChatGPT',
    date: 'Jun 13, 2026',
    summary:
      'Connect OpenAI without pasting a key — the same OAuth login the Codex CLI uses — completing the three big coding-CLI logins: Claude, Grok, and ChatGPT.',
  },
  {
    version: '1.4.0',
    theme: 'Bring any model',
    date: 'Jun 13, 2026',
    summary:
      'A dozen-plus providers through one data-driven registry — OpenAI, DeepSeek, Groq, NVIDIA NIM, Kimi, Zhipu GLM, Qwen, MiniMax, Azure, a custom endpoint, and local Ollama with no key at all.',
  },
  {
    version: '1.3.0',
    theme: 'Bulk triage',
    date: 'Jun 13, 2026',
    summary:
      'A Select toggle reveals checkboxes across the library — pick any number and remove in one confirmed action; Esc backs out.',
  },
  {
    version: '1.2.0',
    theme: 'Themes that actually theme',
    date: 'Jun 13, 2026',
    summary:
      'Five new themes — Nord, Gruvbox, Rosé Pine, Catppuccin Latte, Solarized Light — for thirteen in all, with a proper fix for light mode and status colours kept readable via color-mix.',
  },
  {
    version: '1.1.0',
    theme: 'Trust & Polish',
    date: 'Jun 12, 2026',
    summary:
      'The foundation: portable export/import of your whole library, hardening against README prompt-injection, BM25 search, self-healing retries, and full keyboard and reduced-motion accessibility.',
  },
];
