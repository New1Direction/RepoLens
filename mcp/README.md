# RepoLens MCP server

Let your AI agent audit dependencies before it installs or recommends them.

RepoLens MCP runs locally over stdio. Your agent gets structured JSON, and the MCP
server also writes a self-contained **local HTML report** and opens it in your
browser by default — so users get the full RepoLens visual verdict, not just a
block of text in chat.

## Why agents need this

Coding agents constantly choose packages from README text, stars, or stale blog
posts. RepoLens gives the agent a dependency due-diligence tool:

> “Should I use this repo, what are the risks, and what should I try first?”

It can also inspect a deployed product page without pretending that marketing
claims are implementation facts. Product analysis marks website-only evidence
explicitly and tells the agent what code, contract, runtime, or accounting
evidence would still be needed to verify important claims.

## Tools

- `scan_repo` — verdict-first report: fit, health, pros, cons, red flags,
  capabilities, bottom line.
- `deep_dive` — plain-English architecture explanation, weak spots, assumptions,
  self-test questions, atoms + lineage.
- `blueprint_scene` — graph-shaped architecture map with nodes/edges/positions.
- `compare_repos` — compare 2-5 repos/packages for a use case, pick a winner,
  and open a visual bake-off report.
- `evaluate_for_goal` — evaluate one repo against a concrete goal and explicit
  constraints; returns adopt/trial/hold/reject, fit score, blockers, costs,
  dependency risk, evidence, and a short trial plan.
- `analyze_product` — inspect a public product URL and return its product model,
  core loop, dependencies, critical systems, failure modes, and a claim/evidence
  verification map. Website claims remain unverified unless separate evidence is
  supplied later.

Single-repo tools accept:

```json
{
  "repo": "honojs/hono",
  "report": true,
  "openReport": true
}
```

`evaluate_for_goal` accepts:

```json
{
  "repo": "honojs/hono",
  "goal": "HTTP layer for a deterministic autonomous agent runtime",
  "constraints": [
    "low dependency count",
    "edge compatible",
    "actively maintained",
    "no mandatory cloud dependency"
  ],
  "report": true,
  "openReport": true
}
```

`analyze_product` accepts:

```json
{
  "url": "https://www.orbio.so/",
  "goal": "Understand the fee-to-inference loop and identify what must be verified before trusting the accounting",
  "report": true,
  "openReport": true
}
```

`compare_repos` accepts:

```json
{
  "repos": ["honojs/hono", "fastify/fastify", "npm:@tinyhttp/app"],
  "useCase": "edge API on Cloudflare Workers",
  "report": true,
  "openReport": true
}
```

- `report` defaults to `true` and writes a local `.html` file.
- `openReport` defaults to `true` and opens that file in the browser.
- Set `openReport: false` if the agent should only return the report path.
- Set `report: false` for pure JSON/tool-only usage.

The returned JSON includes:

```json
{
  "report": {
    "path": "/tmp/repolens-mcp-reports/honojs-hono-scan_repo-....html",
    "url": "file:///tmp/repolens-mcp-reports/honojs-hono-scan_repo-....html",
    "opened": true
  }
}
```

## Setup

After npm publish, the intended one-command path is:

```bash
ANTHROPIC_API_KEY=sk-ant-... npx repolens-mcp
```

From a repo checkout today:

```bash
cd mcp
npm install
export ANTHROPIC_API_KEY=sk-ant-...       # one provider key is required
export GITHUB_TOKEN=ghp_...               # optional; lifts GitHub 60/hr → 5000/hr
node server.js                            # speaks MCP over stdio
```

Provider environment variables:

```bash
# Auto-pick order: Anthropic → OpenAI → OpenRouter → Google
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export OPENROUTER_API_KEY=sk-or-...
export GOOGLE_API_KEY=AIza...

# Optional model overrides
export ANTHROPIC_MODEL=claude-sonnet-4-6
export OPENAI_MODEL=gpt-4.1-mini
export OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
export GOOGLE_MODEL=gemini-2.5-flash

# Force one provider instead of auto-pick
export REPOLENS_MCP_PROVIDER=openai # anthropic | openai | openrouter | google
export REPOLENS_MCP_TIMEOUT_MS=60000
```

Optional report environment variables:

```bash
export REPOLENS_MCP_OPEN_REPORT=0          # never auto-open reports
export REPOLENS_MCP_REPORT_DIR=/tmp/reports # custom report directory
```

A `GITHUB_TOKEN` is strongly recommended for `blueprint_scene` and `deep_dive`:
each makes multiple GitHub calls and anonymous GitHub API limits are low.

## Claude Desktop config

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "repolens": {
      "command": "node",
      "args": ["/absolute/path/to/repolens/mcp/server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

## Example prompts

```text
Use RepoLens to check whether I should use honojs/hono for an edge API.
```

```text
Before you add this dependency, run RepoLens scan_repo and open the report.
```

```text
Use RepoLens evaluate_for_goal on honojs/hono for a deterministic agent API runtime.
```

```text
Analyze https://www.orbio.so/ as a product. Separate website claims from verified implementation facts and tell me what evidence is still needed.
```
