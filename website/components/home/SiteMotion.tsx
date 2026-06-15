'use client';

import { useEffect } from 'react';

/**
 * The site's motion layer. GSAP + ScrollTrigger are dynamically imported so
 * they stay off the critical path, and EVERY animation lives inside a
 * `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` block — so a
 * reduced-motion visitor gets the page fully static, at its natural state.
 *
 * All reveals use `gsap.from`, which sets the hidden state at runtime only; if
 * JS never loads, nothing is hidden and the content renders normally.
 */
export function SiteMotion() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const ease = 'power3.out';
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // 1) Hero entrance — stagger the pieces in on load.
        gsap.from(
          '.hero .kicker, .hero .hero-mascot, .hero-title, .hero-sub, .hero-cta, .hero-foot',
          { opacity: 0, y: 26, duration: 0.7, stagger: 0.09, ease, clearProps: 'transform' },
        );

        // Scrubbed parallax — the mascot port drifts up as the hero scrolls away.
        gsap.to('.hero .hero-mascot-stage', {
          yPercent: -14,
          ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.4 },
        });

        // 2) Section reveals (every .reveal except the bento, handled below).
        const reveals = gsap.utils.toArray<HTMLElement>('.reveal:not(.feature-section)');
        ScrollTrigger.batch(reveals, {
          start: 'top 86%',
          onEnter: (batch) =>
            gsap.from(batch, {
              opacity: 0,
              y: 30,
              duration: 0.7,
              stagger: 0.12,
              ease,
              overwrite: true,
            }),
        });

        // 2b) Section titles wipe in left→right — a bolder editorial reveal
        // layered over the section fade. Bento is excluded (own choreography).
        const titles = gsap.utils.toArray<HTMLElement>(
          '.reveal:not(.feature-section) .section-title',
        );
        ScrollTrigger.batch(titles, {
          start: 'top 88%',
          onEnter: (batch) =>
            gsap.fromTo(
              batch,
              { clipPath: 'inset(0 100% 0 0)' },
              {
                clipPath: 'inset(0 0% 0 0)',
                duration: 0.7,
                ease: 'power3.inOut',
                stagger: 0.12,
                overwrite: 'auto',
              },
            ),
        });

        // 3) Feature bento — header in, then tiles stagger.
        const bento = document.querySelector('.feature-section');
        if (bento) {
          ScrollTrigger.create({
            trigger: bento,
            start: 'top 80%',
            once: true,
            onEnter: () => {
              gsap.from(bento.querySelectorAll('.eyebrow, .section-title, .section-note'), {
                opacity: 0,
                y: 20,
                duration: 0.6,
                stagger: 0.08,
                ease,
              });
              gsap.from(bento.querySelectorAll('.feat'), {
                opacity: 0,
                y: 26,
                duration: 0.55,
                stagger: 0.06,
                ease,
                delay: 0.15,
                clearProps: 'transform',
              });
              // Draw the line icons in (stroke-dashoffset 1 → 0).
              gsap.fromTo(
                bento.querySelectorAll('.feat .icon-stroke'),
                { strokeDashoffset: 1 },
                { strokeDashoffset: 0, duration: 0.7, stagger: 0.035, ease: 'power2.out', delay: 0.35 },
              );
            },
          });
        }

        // 4) Delight — the verdict health score counts up.
        const health = document.querySelector('.vd-health-n');
        if (health) {
          ScrollTrigger.create({
            trigger: health,
            start: 'top 92%',
            once: true,
            onEnter: () => {
              const counter = { v: 0 };
              gsap.to(counter, {
                v: 88,
                duration: 1.2,
                ease: 'power2.out',
                onUpdate: () => {
                  health.textContent = String(Math.round(counter.v));
                },
              });
            },
          });
        }

        // Recompute trigger positions once the display font has settled.
        ScrollTrigger.refresh();

        // 5) Magnetic primary CTAs — they pull toward the cursor. Pointer
        // devices only; quickTo runs off the React render cycle.
        const magnetCleanups: Array<() => void> = [];
        if (window.matchMedia('(pointer: fine)').matches) {
          gsap.utils.toArray<HTMLElement>('.btn-primary').forEach((btn) => {
            const xTo = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3' });
            const yTo = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3' });
            const onMove = (e: PointerEvent) => {
              const r = btn.getBoundingClientRect();
              xTo((e.clientX - (r.left + r.width / 2)) * 0.35);
              yTo((e.clientY - (r.top + r.height / 2)) * 0.5);
            };
            const onLeave = () => {
              xTo(0);
              yTo(0);
            };
            btn.addEventListener('pointermove', onMove);
            btn.addEventListener('pointerleave', onLeave);
            magnetCleanups.push(() => {
              btn.removeEventListener('pointermove', onMove);
              btn.removeEventListener('pointerleave', onLeave);
            });
          });
        }

        return () => magnetCleanups.forEach((fn) => fn());
      });

      cleanup = () => mm.revert();
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
