# RepoLens MCP server

A local [MCP](https://modelcontextprotocol.io) server that exposes RepoLens's repo
analysis as a tool. An LLM client (Claude Desktop, Cursor, etc.) calls `scan_repo`
and gets RepoLens's verdict-first JSON back — ready to render as components.

This is a **thin proof**: one tool, GitHub-only, Anthropic-only. It reuses the
extension's own pipeline (`fetcher.js` → `prompt.js` → `parser.js`); only the
provider call is MCP-specific.

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
  "fit": "strong",
  "health": { "score": 92 },
  "pros": ["..."],
  "cons": ["..."],
  "red_flags": [],
  "capabilities": ["routing", "middleware", "edge"]
}
```

### `blueprint_scene({ repo })`

Maps how the repo is built and returns a laid-out graph — `nodes` (key parts) and
`edges` (how they relate), with positions — ready for a `<DependencyGraph>`-style
component. Heavier than `scan_repo`: it reads source and makes two model calls
(atoms, then lineage).

```json
{
  "id": "repo:...", "scope": "blueprint", "repoId": "honojs/hono",
  "nodes": [{ "id": "app", "label": "Hono app", "kind": "entrypoint", "x": 120, "y": 40 }],
  "edges": [{ "source": "app", "target": "router", "label": "depends-on" }],
  "camera": { "x": 0, "y": 0, "zoom": 1 }
}
```

## Setup

```bash
cd mcp
npm install
export ANTHROPIC_API_KEY=sk-ant-...     # required
export ANTHROPIC_MODEL=claude-sonnet-4-6 # optional override
node server.js                           # speaks MCP over stdio
```

### Add to Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "repolens": {
      "command": "node",
      "args": ["/absolute/path/to/repolens/mcp/server.js"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

## Notes

- Unauthenticated GitHub requests are rate-limited. For heavier use, a `GITHUB_TOKEN`
  pass-through is a follow-up.
- Next (follow-ups): `deep_dive` (the plain-English layer), multi-provider, and
  npm / PyPI / GitLab support; a `GITHUB_TOKEN` pass-through for higher rate limits.
