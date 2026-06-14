# RepoLens marketing site redesign — design

**Date:** 2026-06-14
**Status:** Approved, in build
**Scope:** Full site — new homepage, new `/changelog`, docs reskin. Dual-theme with a live toggle.

## Problem

The live site (https://new1direction.github.io/RepoLens/) is frozen at v1.x: cyan-only
homepage, six v1 feature cards, default fumadocs docs. It misses everything from v2.0→v3.0
(Triage, Boards, Evaluations, Discovery, N-way Compare, Drift alerts, decision-matrix export)
and is off-brand — no violet accent, no Vee mascot. The deploy workflow only fires on
`website/**` changes, so nothing has shipped since June 13.

## Direction (chosen)

**Dual-theme, live toggle.** Ship `midnight` (dark) + `latte` (light) with a sun/moon switch;
the whole page including Vee re-skins live. Bonus accent palettes (terminal/nord/claude) as
click-to-try swatches make "the 13-theme engine" the demo itself. Brand palette ported from the
already-built `whats-new.html`: violet `#8b7cff` → blue `#3b82f6` → cyan `#22d3ee`, semantic
green/amber/red, mono labels.

## Theming architecture

- **Single source of truth = next-themes** (v0.4.6), already wired by fumadocs `RootProvider`,
  `class` strategy. Toggle flips `.dark` (midnight) ⇄ light (latte). Themes marketing pages AND
  docs for free. No competing system, no custom light/dark FOUC script (next-themes handles it).
- **Marketing tokens** (`site-tokens.css`) defined under `:root` (latte) and `.dark` (midnight);
  they follow the toggle automatically.
- **fumadocs `--color-fd-*`** remapped to our palette per theme so docs match.
- **Accent palettes**: `data-palette` attribute on `<html>` remaps only the accent ramp
  (`--accent`, `--accent-2`, gradient). Persisted to `localStorage`; tiny inline `<head>` script
  applies it before paint. Accent-only ⇒ works in both light/dark, low risk.

## Information architecture

- `app/(home)/layout.tsx` — replace fumadocs `HomeLayout` with bespoke `SiteHeader` + `SiteFooter`
  (full control of nav, toggle, CTA). Wraps `/` and `/changelog`.
- `app/(home)/page.tsx` — homepage sections.
- `app/(home)/changelog/page.tsx` — release timeline.
- `app/docs/**` — unchanged structure; fumadocs `DocsLayout`, reskinned via tokens. Add a
  Changelog link to `baseOptions.nav`.

## Components (small, focused files)

- `components/site/Vee.tsx` — token-aware SVG lens, expression state machine
  (resting→scanning→strong/risky/thinking/error), reduced-motion → static glyph. Ported from
  `whats-new.html`. Client component; optional `loop` prop cycles scanning→verdict in the hero.
- `components/site/ThemeToggle.tsx` — sun/moon, drives next-themes `useTheme`. Keyboard-operable.
- `components/site/PaletteSwatches.tsx` — accent-palette picker (data-palette + localStorage).
- `components/site/SiteHeader.tsx`, `SiteFooter.tsx`.
- `components/home/Hero.tsx`, `VerdictDemo.tsx`, `FeatureBento.tsx`, `HowItWorks.tsx`,
  `ModelsPrivacy.tsx`, `ThemeShowcase.tsx`, `FinalCta.tsx`.
- `components/changelog/Timeline.tsx`.
- `lib/releases.ts` — release data ported verbatim from `whats-new.html` (accurate: v1.1.0→v3.0.0,
  real themes/dates/highlights).

## Homepage sections

1. Hero — Vee centerpiece, "Read code before you trust it.", subhead, CTAs, eyebrow (Manifest V3 · v3.0).
2. The verdict — themeable HTML recreation of the real scan output (Strong-fit chip, AI bottom line,
   health ring 88) so it re-skins; real screenshot in a browser frame alongside.
3. Feature bento — curated v3 set (Verdict-first, Deep Dive, Library+Triage, Boards, Evaluations,
   Discovery, N-way Compare, Connections, Drift, Decision-matrix export, BYO-models, local-first)
   in ~7 varied-size tiles, grid-breaking.
4. How it works — 3 steps (open repo → one click → plain-English briefing).
5. Models & privacy — BYO keys, 20+ providers, no server.
6. Theme showcase — palette swatches; "Vee speaks every theme."
7. Final CTA + footer.

## CTAs (honest)

No Chrome Web Store listing exists yet — do **not** fake "Add to Chrome". Primary CTA = "Install" →
`/docs/getting-started`; secondary = GitHub (`github.com/New1Direction/repolens`).

## Constraints

- Static export (`output: export`), GitHub Pages basePath `/repolens`. All interactivity is
  CSS/`localStorage` only — no server. Use `next/link`; assets via basePath-safe paths.
- Animation on compositor-friendly props only; everything behind `prefers-reduced-motion`.
- Semantic landmarks, focus-visible rings, contrast checked in both palettes.

## Testing

1. `npm run build` (static export) — hard gate.
2. Playwright screenshots at 320/768/1024/1440 in both themes.
3. Reduced-motion path; keyboard-operable toggle; contrast both palettes.
4. code-reviewer / react-reviewer pass before commit.

## Deploy

Redesign touches `website/**` ⇒ `deploy-pages.yml` fires naturally on merge to main.
