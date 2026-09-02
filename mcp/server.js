#!/usr/bin/env node
// RepoLens MCP server. Exposes RepoLens analysis tools over local stdio.
//
// Tools:
//   scan_repo         — verdict-first repo analysis
//   blueprint_scene   — architecture graph
//   deep_dive         — plain-English source explanation
//   compare_repos     — dependency bake-off
//   evaluate_for_goal — repo fit against a concrete goal + constraints
//   analyze_product   — deployed product/website claim + architecture analysis

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { SCAN_TOOL, runScanRepo } from './scan-repo.js';
import { BLUEPRINT_TOOL, runBlueprintScene } from './blueprint-scene.js';
import { DEEP_DIVE_TOOL, runDeepDive } from './deep-dive.js';
import { COMPARE_TOOL, runCompareRepos } from './compare-repos.js';
import { EVALUATE_FOR_GOAL_TOOL, runEvaluateForGoal } from './evaluate-for-goal.js';
import { ANALYZE_PRODUCT_TOOL, runAnalyzeProduct } from './analyze-product.js';

const TOOLS = {
  [SCAN_TOOL.name]: { def: SCAN_TOOL, run: runScanRepo },
  [BLUEPRINT_TOOL.name]: { def: BLUEPRINT_TOOL, run: runBlueprintScene },
  [DEEP_DIVE_TOOL.name]: { def: DEEP_DIVE_TOOL, run: runDeepDive },
  [COMPARE_TOOL.name]: { def: COMPARE_TOOL, run: runCompareRepos },
  [EVALUATE_FOR_GOAL_TOOL.name]: { def: EVALUATE_FOR_GOAL_TOOL, run: runEvaluateForGoal },
  [ANALYZE_PRODUCT_TOOL.name]: { def: ANALYZE_PRODUCT_TOOL, run: runAnalyzeProduct },
};

const server = new Server({ name: 'repolens', version: '0.2.0' }, { capabilities: { tools: {} } });

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
    const reportLine = result?.report?.url
      ? `\n\nOpened local RepoLens HTML report: ${result.report.url}`
      : '';
    const summary =
      result?.bottom_line ||
      result?.verdict ||
      result?.explanation ||
      result?.product_model ||
      result?.title ||
      `${req.params.name} completed.`;
    return {
      content: [{ type: 'text', text: `${summary}${reportLine}` }],
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
