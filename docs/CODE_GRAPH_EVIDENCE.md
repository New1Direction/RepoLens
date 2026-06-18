# Code Graph Evidence for Deep Scan

RepoLens already has the right product slot: the optional deeper-scan runner provides measured facts from a real checkout. This note defines the next increment: let advanced runners attach structural code-graph evidence without changing the browser extension contract.

## Goal

Ground Verdict and Deep Dive claims with structural facts, not just README text and file-tree heuristics.

Examples:

- public API surface size
- entry points and routes
- important modules / hotspots
- dead or isolated symbols
- call/import density
- cross-service or config-to-code links

## Optional facts schema

The extension now accepts either `facts.codeGraph` or `facts.graph` from the runner. All fields are optional.

```json
{
  "fileCount": 123,
  "languages": [{ "name": "TypeScript", "code": 42000 }],
  "codeGraph": {
    "nodes": 1200,
    "edges": 3400,
    "symbols": {
      "functions": 210,
      "classes": 18,
      "methods": 95,
      "routes": 7
    },
    "routes": ["GET /api/repos"],
    "hotspots": [{ "name": "scanRepository", "file": "src/scan.ts", "inbound": 14, "outbound": 9 }],
    "deadCode": [{ "name": "legacyParser", "file": "src/legacy.ts" }]
  }
}
```

## Product use

- Deep Dive prompt: includes code graph evidence in `MEASURED FACTS` and tells the model to prefer it over inference.
- Deep Dive UI: shows a compact `code graph` row inside the measured-facts panel when fields are present.
- Existing runners remain compatible: no `codeGraph` means no UI/prompt change.

## Implementation path

1. Start with lightweight static extraction in the runner:
   - manifest entry points
   - route-like strings and framework annotations
   - import graph by file
   - top files by inbound imports
2. Then add AST/symbol extraction per high-value language:
   - JS/TS first, then Python/Rust/Go
   - functions/classes/methods counts
   - call-ish edges when reliable
3. Later, optionally bridge to a local MCP/code-index backend when installed.

RepoLens should stay verdict-first. The graph is evidence, not the product surface.
