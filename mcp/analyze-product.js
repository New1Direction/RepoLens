import { callModel } from './model.js';
import { attachHtmlReport } from './report.js';

const MAX_HTML_BYTES = 750_000;
const MAX_TEXT_CHARS = 45_000;

export const ANALYZE_PRODUCT_TOOL = {
  name: 'analyze_product',
  description:
    'Analyze a deployed software product from a public URL. Extracts product claims, core loops, dependencies, critical systems, failure modes, and a claim/evidence verification map. ' +
    'Use this when the thing to inspect is a live product or website rather than a repository.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Public http(s) product URL.' },
      goal: { type: 'string', description: 'Optional question or evaluation goal.' },
      report: { type: 'boolean', description: 'Write a local HTML report. Default: true.' },
      openReport: { type: 'boolean', description: 'Open the local HTML report. Default: true.' },
    },
    required: ['url'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      title: { type: 'string' },
      product_model: { type: 'string' },
      core_loop: { type: 'array', items: { type: 'string' } },
      dependencies: { type: 'array', items: { type: 'string' } },
      strengths: { type: 'array', items: { type: 'string' } },
      critical_systems: { type: 'array', items: { type: 'string' } },
      failure_modes: { type: 'array', items: { type: 'string' } },
      claims: { type: 'array' },
      verdict: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      source_scope: { type: 'string' },
      report: { type: 'object' },
    },
    required: ['url', 'product_model', 'claims', 'verdict'],
  },
};

function cleanText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function extractTitle(html, fallback) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(match?.[1] || fallback).slice(0, 200);
}

function normalizeUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('analyze_product requires a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('analyze_product only supports http(s) URLs');
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error('analyze_product does not fetch localhost URLs');
  return url;
}

async function fetchProductPage(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'RepoLens-MCP/0.1 (+https://github.com/New1Direction/RepoLens)' },
    });
    if (!res.ok) throw new Error(`Product page HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('text/html') && !type.includes('text/plain')) {
      throw new Error(`Unsupported product content type: ${type || 'unknown'}`);
    }
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_HTML_BYTES) throw new Error(`Product page exceeds ${MAX_HTML_BYTES} bytes`);
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    return { finalUrl: res.url || url.href, title: extractTitle(html, url.hostname), text: cleanText(html) };
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(rawText) {
  const text = String(rawText || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in product analysis response');
  return JSON.parse(text.slice(start, end + 1));
}

const strings = (xs, max = 12) =>
  Array.isArray(xs) ? xs.map(String).map((s) => s.trim()).filter(Boolean).slice(0, max) : [];

export function buildProductPrompt(page, goal = '') {
  return `You are RepoLens analyzing a deployed software product from its public product page.\n\nURL: ${page.finalUrl}\nTitle: ${page.title}\nEvaluation goal: ${goal || 'Understand how the product works and what must be verified before trusting it.'}\n\nVisible page text:\n${page.text}\n\nImportant rules:\n- Treat page statements as product claims, not verified implementation facts.\n- Never say code, contracts, accounting, security, or runtime behavior is verified unless the supplied page itself proves it.\n- Separate observed website evidence from inferred architecture.\n- Identify what source/code/contract/runtime evidence would be needed to verify important claims.\n\nReturn ONLY valid JSON:\n{\n  \"product_model\": \"One concise explanation of how value/data/actions flow through the product.\",\n  \"core_loop\": [\"Step 1\", \"Step 2\"],\n  \"dependencies\": [\"External dependency or subsystem\"],\n  \"strengths\": [\"Architectural/product strength visible from the page\"],\n  \"critical_systems\": [\"Subsystem whose correctness matters\"],\n  \"failure_modes\": [\"Concrete way the system could fail\"],\n  \"claims\": [{\n    \"claim\": \"Important product claim\",\n    \"website_evidence\": \"Short paraphrase of what the page says\",\n    \"verification_status\": \"website_only | partial | verified | contradicted | unknown\",\n    \"needs\": [\"code\", \"contract\", \"runtime\", \"accounting\"],\n    \"confidence\": \"high | medium | low\"\n  }],\n  \"verdict\": \"Decision-oriented conclusion focused on architecture and verification gaps.\",\n  \"confidence\": \"high | medium | low\"\n}`;
}

export function parseProductResponse(rawText) {
  const data = extractJson(rawText);
  const confidence = ['high', 'medium', 'low'].includes(String(data.confidence)) ? String(data.confidence) : 'low';
  return {
    product_model: String(data.product_model || ''),
    core_loop: strings(data.core_loop),
    dependencies: strings(data.dependencies),
    strengths: strings(data.strengths),
    critical_systems: strings(data.critical_systems),
    failure_modes: strings(data.failure_modes),
    claims: Array.isArray(data.claims) ? data.claims.slice(0, 20) : [],
    verdict: String(data.verdict || ''),
    confidence,
  };
}

export async function runAnalyzeProduct(args) {
  const page = await fetchProductPage(args?.url);
  const goal = String(args?.goal || '').trim();
  const analysis = parseProductResponse(await callModel(buildProductPrompt(page, goal)));
  const result = {
    url: page.finalUrl,
    title: page.title,
    goal,
    ...analysis,
    source_scope: 'Public product-page HTML only. Code, contracts, private APIs, and runtime behavior are unverified unless separately supplied.',
  };
  return attachHtmlReport('analyze_product', page.title || page.finalUrl, result, args);
}
