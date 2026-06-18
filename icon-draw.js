// icon-draw.js — the RepoLens app icon, drawn once, used everywhere.
//
// One responsibility: paint the "Mono Ink" Vee lens onto a Canvas2D-style
// context. The lens geometry is the same 48-unit grid as the in-app mascot
// (mascot.js): a barrel ring (r17), an aperture (r9), a pupil (r2.4). Here it
// sits on a dark rounded-square tile so the icon pops on a light browser
// toolbar. Framework-free: it only calls the shared Canvas2D / OffscreenCanvas
// API, so the export harness (tools/make-icons.html) and the service-worker
// animation (icon-anim.js) share this exact draw.

/** The drawing grid the lens is designed on. Every coordinate scales by size/BASE_GRID. */
export const BASE_GRID = 48;

/** Mono Ink icon palette. Light marks on a near-black tile. */
export const ICON_COLORS = Object.freeze({
  tile: '#0f1115', // --rl-ink
  ring: '#cbd5e1', // light barrel ring
  aperture: '#3b82f6', // electric-blue aperture
  pupil: '#e5edff', // --rl-on-dark light pupil
});

/**
 * Draw the icon at a given pixel size onto a Canvas2D-style context.
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
 * @param {number} size pixel width/height of the square icon
 * @param {object} [opts]
 * @param {number} [opts.apertureScale=1] multiply the aperture radius (animation)
 * @param {number} [opts.apertureRotation=0] radians to rotate the aperture (dashed spin)
 * @param {number} [opts.ringScale=1] multiply the barrel-ring radius (breathe)
 * @param {string} [opts.ringColor] override the barrel-ring stroke (grey→blue breathe)
 * @param {boolean} [opts.dashed=false] dash the aperture so spin reads
 */
export function drawVeeIcon(ctx, size, opts = {}) {
  const {
    apertureScale = 1,
    apertureRotation = 0,
    ringScale = 1,
    ringColor = ICON_COLORS.ring,
    dashed = false,
  } = opts;

  const f = size / BASE_GRID; // grid → pixels
  const cx = 24 * f;
  const cy = 24 * f;

  ctx.clearRect(0, 0, size, size);

  // Dark rounded-square tile.
  const radius = size * 0.22;
  ctx.fillStyle = ICON_COLORS.tile;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, size, size, radius);
  } else {
    // Manual rounded rect for engines without roundRect.
    const r = Math.min(radius, size / 2);
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.arc(size - r, r, r, -Math.PI / 2, 0);
    ctx.lineTo(size, size - r);
    ctx.arc(size - r, size - r, r, 0, Math.PI / 2);
    ctx.lineTo(r, size);
    ctx.arc(r, size - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(0, r);
    ctx.arc(r, r, r, Math.PI, Math.PI * 1.5);
  }
  ctx.fill();

  // Barrel ring (r17) — light grey by default, scalable + recolorable for breathe.
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2 * f;
  ctx.beginPath();
  ctx.arc(cx, cy, 17 * f * ringScale, 0, Math.PI * 2);
  ctx.stroke();

  // Aperture (r9) — electric blue, scalable + rotatable + optionally dashed.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(apertureRotation);
  ctx.strokeStyle = ICON_COLORS.aperture;
  ctx.lineWidth = 3 * f;
  if (dashed) {
    const circ = 2 * Math.PI * (9 * f * apertureScale);
    ctx.setLineDash([circ / 8, circ / 16]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.arc(0, 0, 9 * f * apertureScale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Pupil (r2.4) — light blue-white, fixed center.
  ctx.setLineDash([]);
  ctx.fillStyle = ICON_COLORS.pupil;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.4 * f, 0, Math.PI * 2);
  ctx.fill();
}
