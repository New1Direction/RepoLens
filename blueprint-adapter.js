// blueprint-adapter.js
// Deep Dive atoms/lineage → a laid-out Blueprint scene.

import { createScene } from './scene.js';
import { repairGraph } from './repair-graph.js';
import { layoutBlueprint } from './canvas-layout.js';

/**
 * @param {object} args
 * @param {{atoms:any[], lineage:{links:any[], roots?:string[], leaves?:string[]}}} args.deepDive
 * @param {string} args.repoId
 * @param {string} args.title
 * @param {string|null} [args.scanAt]
 * @param {(atom:object)=>string} [args.layerOf]  defaults to atom.kind
 * @param {boolean} [args.withIssues]  when true, returns { scene, issues }
 * @returns {object|{scene:object, issues:object[]}}
 */
export function buildBlueprintScene({
  deepDive,
  repoId,
  title,
  scanAt = null,
  layerOf = (a) => a.kind,
  withIssues = false,
}) {
  const atoms = (deepDive && deepDive.atoms) || [];
  const links = (deepDive && deepDive.lineage && deepDive.lineage.links) || [];
  const roots = new Set((deepDive && deepDive.lineage && deepDive.lineage.roots) || []);

  const layerByAtomId = Object.fromEntries(atoms.map((a) => [a.id, layerOf(a) ?? null]));
  const { nodes, edges, issues } = repairGraph({
    nodes: atoms.map((a) => ({ ...a, layer: layerByAtomId[a.id] })),
    edges: links,
  });

  // mark lineage roots (load-bearing) so the engine can highlight them (immutably)
  const marked = nodes.map((n) => ({ ...n, ref: { ...(n.ref || {}), root: roots.has(n.id) } }));

  const placed = layoutBlueprint(marked, edges);

  const scene = createScene({ scope: 'blueprint', repoId, title });
  scene.nodes = placed;
  scene.edges = edges;
  scene.source.scanAt = scanAt;

  return withIssues ? { scene, issues } : scene;
}
