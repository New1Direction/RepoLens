import { describe, it, expect } from 'vitest';
import { buildTour } from '../tour.js';

const scene = {
  nodes: [
    { id: 'cli', label: 'CLI', kind: 'entrypoint', ref: { purpose: 'entry', root: true } },
    { id: 'core', label: 'Core', kind: 'subsystem', ref: { purpose: 'the engine' } },
    { id: 'out', label: 'Output', kind: 'module', ref: { purpose: 'writes files' } },
  ],
  edges: [
    { id: 'e1', from: 'cli', to: 'core', rel: 'depends-on' },
    { id: 'e2', from: 'core', to: 'out', rel: 'triggers' },
  ],
};

describe('buildTour', () => {
  it('returns ordered steps starting at a root, 1..N with no gaps', () => {
    const steps = buildTour(scene, { roots: ['cli'] });
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(steps.map((s) => s.order)).toEqual(steps.map((_, i) => i + 1));
    expect(steps[0].nodeIds).toContain('cli');
  });
  it('never emits empty nodeIds and uses purpose as blurb', () => {
    const steps = buildTour(scene, { roots: ['cli'] });
    for (const s of steps) expect(s.nodeIds.length).toBeGreaterThan(0);
    const core = steps.find((s) => s.nodeIds.includes('core'));
    expect(core.blurb).toMatch(/engine/);
  });
  it('falls back to highest fan-in when no roots given', () => {
    const steps = buildTour(scene, {});
    expect(steps.length).toBeGreaterThanOrEqual(1);
  });
});
