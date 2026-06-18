import { describe, it, expect } from 'vitest';
import { drawVeeIcon, ICON_COLORS, BASE_GRID } from '../icon-draw.js';

// A recording stub for a Canvas2D-style context. It captures every arc() call
// and the fillStyle/strokeStyle active at draw time, so we can assert geometry
// and colors without a real canvas.
function recordingCtx() {
  const calls = { arcs: [], fills: [], strokes: [], rects: [], setLineDash: [] };
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    translate() {},
    rotate() {},
    clearRect() {},
    rect(x, y, w, h) {
      calls.rects.push({ x, y, w, h, fillStyle: ctx.fillStyle });
    },
    roundRect(x, y, w, h, r) {
      calls.rects.push({ x, y, w, h, r, fillStyle: ctx.fillStyle });
    },
    arc(x, y, radius) {
      calls.arcs.push({
        x,
        y,
        radius,
        fillStyle: ctx.fillStyle,
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
      });
    },
    setLineDash(d) {
      calls.setLineDash.push(d);
    },
    fill() {
      calls.fills.push({ fillStyle: ctx.fillStyle });
    },
    stroke() {
      calls.strokes.push({ strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth });
    },
  };
  return { ctx, calls };
}

describe('drawVeeIcon', () => {
  it('scales the three lens-circle radii by size/48 from the base grid', () => {
    const { ctx, calls } = recordingCtx();
    drawVeeIcon(ctx, 96); // factor = 2
    const radii = calls.arcs.map((a) => a.radius).sort((a, b) => a - b);
    // base radii: pupil 2.4, aperture 9, barrel 17 → ×2
    expect(radii).toEqual([4.8, 18, 34]);
  });

  it('uses the Mono Ink colors: dark tile, light barrel, blue aperture, light pupil', () => {
    const { ctx, calls } = recordingCtx();
    drawVeeIcon(ctx, 48); // factor = 1
    // tile is a filled rounded rect in ink
    expect(calls.rects.some((r) => r.fillStyle === ICON_COLORS.tile)).toBe(true);
    const barrel = calls.arcs.find((a) => a.radius === 17);
    const aperture = calls.arcs.find((a) => a.radius === 9);
    const pupil = calls.arcs.find((a) => a.radius === 2.4);
    expect(barrel.strokeStyle).toBe(ICON_COLORS.ring);
    expect(aperture.strokeStyle).toBe(ICON_COLORS.aperture);
    expect(pupil.fillStyle).toBe(ICON_COLORS.pupil);
  });

  it('honors apertureScale and ringColor opts', () => {
    const { ctx, calls } = recordingCtx();
    drawVeeIcon(ctx, 48, { apertureScale: 0.5, ringColor: '#3b82f6' });
    const aperture = calls.arcs.find((a) => Math.abs(a.radius - 4.5) < 1e-6); // 9 * 0.5
    expect(aperture).toBeTruthy();
    const barrel = calls.arcs.find((a) => a.radius === 17);
    expect(barrel.strokeStyle).toBe('#3b82f6');
  });

  it('exposes the base grid constant', () => {
    expect(BASE_GRID).toBe(48);
  });
});
