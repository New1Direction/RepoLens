#!/usr/bin/env node
// RepoLens MCP server. Exposes RepoLens's repo analysis as MCP tools over local
// stdio, bring-your-own Anthropic key. Each tool reuses the extension's own
// pipeline modules; the only MCP-specific piece is the env-key Anthropic call.
//
// Tools:
//   scan_repo       — verdict-first analysis (fit/health/pros/cons/flags)
//   blueprint_scene — laid-out nodes/edges graph of how the repo is built
//   deep_dive       — plain-English explanation + gaps + confidence (heaviest)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { SCAN_TOOL, runScanRepo } from './scan-repo.js';
import { BLUEPRINT_TOOL, runBlueprintScene } from './blueprint-scene.js';
import { DEEP_DIVE_TOOL, runDeepDive } from './deep-dive.js';

const TOOLS = {
  [SCAN_TOOL.name]: { def: SCAN_TOOL, run: runScanRepo },
  [BLUEPRINT_TOOL.name]: { def: BLUEPRINT_TOOL, run: runBlueprintScene },
  [DEEP_DIVE_TOOL.name]: { def: DEEP_DIVE_TOOL, run: runDeepDive },
};

const server = new Server({ name: 'repolens', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.values(TOOLS).map((t) => t.def),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS[req.params.name];
  if (!tool) {
    return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
  }
  try {
    const result = await tool.run(req.params.arguments || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `${req.params.name} failed: ${err.message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
