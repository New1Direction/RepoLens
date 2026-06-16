// repair-graph.js
// Normalize messy LLM-produced graph data into a valid {nodes, edges} set.
// Never throws unless { strict:true }. Inspired by Understand-Anything's tiered model.

const KNOWN_KINDS = new Set(['subsystem', 'module', 'concept', 'entrypoint', 'data']);
const KIND_ALIASES = {
  function: 'module', fn: 'module', method: 'module', file: 'module', class: 'module',
  service: 'subsystem', package: 'subsystem', pkg: 'subsystem', mod: 'subsystem',
  config: 'data', table: 'data', schema: 'data', endpoint: 'data',
  entry: 'entrypoint', main: 'entrypoint', idea: 'concept',
};
const KNOWN_RELS = new Set(['depends-on', 'enables', 'triggers', 'derives-from']);
const REL_ALIASES = {
  depends_on: 'depends-on', dependson: 'depends-on', imports: 'depends-on', uses: 'depends-on',
  requires: 'depends-on', calls: 'triggers', invokes: 'triggers', publishes: 'triggers',
  extends: 'derives-from', inherits: 'derives-from', implements: 'derives-from', enables: 'enables',
};

const coerceKind = (k) => {
  const v = String(k || '').trim().toLowerCase();
  if (KNOWN_KINDS.has(v)) return v;
  return KIND_ALIASES[v] || 'module';
};
const coerceRel = (r) => {
  const v = String(r || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (KNOWN_RELS.has(v)) return v;
  return REL_ALIASES[v] || 'depends-on';
};

/**
 * @param {{nodes?:any[], edges?:any[]}} raw
 * @param {{strict?:boolean}} [opts]
 * @returns {{nodes:object[], edges:object[], issues:object[]}}
 */
export function repairGraph(raw, opts = {}) {
  const issues = [];
  const add = (level, code, message) => {
    issues.push({ level, code, message });
    if (opts.strict && level === 'dropped') throw new Error(`repairGraph strict: ${code} — ${message}`);
  };

  const seen = new Set();
  const nodes = [];
  for (const n of (raw && raw.nodes) || []) {
    if (!n || n.id == null || n.id === '') { add('dropped', 'missing-id', 'node without id'); continue; }
    const id = String(n.id);
    if (seen.has(id)) { add('auto-corrected', 'dedupe', `duplicate node id ${id}`); continue; }
    seen.add(id);
    const kind = coerceKind(n.kind);
    if (n.kind && coerceKind(n.kind) !== String(n.kind).toLowerCase())
      add('auto-corrected', 'kind-alias', `kind "${n.kind}" → ${kind}`);
    nodes.push({
      id,
      label: String(n.name ?? n.label ?? id),
      kind,
      layer: n.layer != null ? String(n.layer) : null,
      x: Number.isFinite(n.x) ? n.x : 0,
      y: Number.isFinite(n.y) ? n.y : 0,
      pinned: !!n.pinned,
      ref: { purpose: n.purpose ?? null, files: Array.isArray(n.files) ? n.files : [] },
    });
  }

  const ids = new Set(nodes.map((n) => n.id));
  const edges = [];
  const edgeSeen = new Set();
  for (const e of (raw && raw.edges) || []) {
    const from = String((e && (e.from ?? e.source)) ?? '');
    const to = String((e && (e.to ?? e.target)) ?? '');
    if (!ids.has(from) || !ids.has(to)) { add('dropped', 'dangling-edge', `edge ${from}→${to} has a missing endpoint`); continue; }
    const rel = coerceRel(e.rel ?? e.relation ?? e.type);
    const key = `${from}|${rel}|${to}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({ id: `e${hash(key)}`, from, to, rel, note: e.note ?? null, userDrawn: !!e.userDrawn });
  }

  return { nodes, edges, issues };
}

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff; return Math.abs(h) || 1; }
