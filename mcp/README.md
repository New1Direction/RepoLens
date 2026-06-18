# RepoLens MCP server

A local [MCP](https://modelcontextprotocol.io) server that exposes RepoLens's repo
analysis as tools. An LLM client (Claude Desktop, Cursor, etc.) calls a tool and
gets RepoLens's JSON back — ready to render as components.

GitHub-only, Anthropic-only, **three tools** (`scan_repo`, `blueprint_scene`,
`deep_dive`). Each reuses the extension's own pipeline modules verbatim
(`fetcher.js`, `prompt.js`, `parser.js`, `deepdive.js`, `blueprint-adapter.js`);
only the provider call (`anthropic.js`) is MCP-specific.

## What stays true

- **Local only.** Runs over stdio, spawned by your client. No hosted backend.
- **Bring your own key.** The Anthropic key comes from the environment, never from
  a server or the extension's storage. Nothing phones home.

## Tools

### `scan_repo({ repo })`

`repo` is `owner/name` or a GitHub URL. Returns the analysis JSON:

```json
{
  "repoId": "honojs/hono",
  "platform": "github",
  "language": "TypeScript",
  "license": "MIT",
  "stars": 21000,
  "description": "Small, fast web framework for the edges.",
  "fit": { "level": "strong", "label": "Strong fit", "why": "Health 92 · 0 flags · 4 pros / 1 cons" },
  "bottom_line": "A lean, fast framework worth adopting for edge runtimes.",
  "health": { "score": 92 },
  "pros": ["..."],
  "cons": ["..."],
  "red_flags": [],
  "capabilities": ["routing", "middleware", "edge"]
}
```

`fit` is derived deterministically from the health score, red-flag count, and
pros/cons balance — `level` is one of `strong | solid | care | risky`.

### `blueprint_scene({ repo })`

Maps how the repo is built and returns a laid-out scene — `nodes` (key parts) and
`edges` (how they relate), with positions — ready for a `<DependencyGraph>`-style
component. Heavier than `scan_repo`: it reads source and makes two model calls
(atoms, then lineage). Edges are engine-shaped (`{ id, from, to, rel }`), not
`{ source, target }`.

```json
{
  "id": "repo:...",
  "scope": "blueprint",
  "repoId": "honojs/hono",
  "nodes": [
    {
      "id": "app",
      "label": "Hono app",
      "kind": "entrypoint",
      "x": 120,
      "y": 40,
      "layer": "entrypoint",
      "ref": { "root": true, "purpose": "...", "files": ["src/hono.ts"] }
    }
  ],
  "edges": [{ "id": "e123", "from": "app", "to": "router", "rel": "depends-on" }],
  "camera": { "x": 0, "y": 0, "zoom": 1 }
}
```

### `deep_dive({ repo })`

Explains how the repo actually works in plain language, with the weak spots named.
Returns a from-scratch `explanation`, the `gaps` and `assumptions` behind it,
self-test `questions`, per-claim `confidence`, plus the underlying `atoms` and
`lineage`. **Heaviest tool** — reads source and makes three model calls
(atoms → lineage → Feynman).

```json
{
  "repoId": "honojs/hono",
  "degraded": false,
  "explanation": "Hono is a small web framework that ...",
  "gaps": ["..."],
  "assumptions": ["..."],
  "questions": [{ "q": "What runs a request?", "a": "..." }],
  "confidence": [{ "claim": "...", "level": "high", "note": "..." }],
  "atoms": [{ "id": "router", "name": "Router", "kind": "subsystem", "purpose": "..." }],
  "lineage": {
    "links": [{ "from": "app", "to": "router", "relation": "depends-on" }],
    "roots": ["app"],
    "leaves": []
  }
}
```

## Setup

```bash
cd mcp
npm install
export ANTHROPIC_API_KEY=sk-ant-...       # required
export ANTHROPIC_MODEL=claude-sonnet-4-6  # optional override
export ANTHROPIC_TIMEOUT_MS=60000         # optional; hard per-call timeout (default 60s)
export GITHUB_TOKEN=ghp_...               # optional; lifts GitHub 60/hr → 5000/hr
node server.js                            # speaks MCP over stdio
```

A `GITHUB_TOKEN` is **strongly recommended** for `blueprint_scene` and `deep_dive`:
each makes 10+ GitHub calls per run and will hit the 60 req/hr anonymous limit
(surfacing as a mid-scan `GitHub 403`) without one.

### Add to Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "repolens": {
      "command": "node",
      "args": ["/absolute/path/to/repolens/mcp/server.js"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-...", "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

## Notes

- `deep_dive` and `blueprint_scene` are GitHub-deep but README-shallow elsewhere:
  only GitHub exposes a file tree, so on other platforms they degrade (`deep_dive`
  sets `degraded: true`).
- Next (follow-ups): multi-provider (reuse the extension's `providers.js` registry),
  npm / PyPI / GitLab inputs for `scan_repo` (the fetcher already supports them —
  only the input parser is GitHub-only), and a `tools/list` structural smoke test.
