import { createInterface } from "node:readline";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

import { ArbiteraDataService } from "./data-service.js";
import { GraphIntelligence } from "./graph-intelligence.js";

const backendUrl = process.env.ARBITRA_BACKEND_URL ?? "http://localhost:3000";
const service = new ArbiteraDataService(backendUrl);

// Graph Intelligence — requires GRAPH_API_KEY for live subgraph access
let intelligence: GraphIntelligence | null = null;
const graphApiKey = process.env.GRAPH_API_KEY;
const llmApiKey = process.env.LLM_API_KEY;
if (graphApiKey?.trim() && llmApiKey?.trim()) {
  intelligence = new GraphIntelligence(
    service,
    graphApiKey,
    llmApiKey,
    process.env.LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
    process.env.LLM_MODEL ?? "gemini-2.5-flash",
  );
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────

function reply(id: unknown, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function protocolError(id: unknown, code: number, message: string): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

function toolError(id: unknown, message: string): void {
  reply(id, { isError: true, content: [{ type: "text", text: message }], structuredContent: { error: message } });
}

function toolResult(id: unknown, data: unknown): void {
  reply(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data });
}

// ── Tool definitions ──────────────────────────────────────────────────────

const TOOLS = [
  // ─── Existing tools ───
  {
    name: "get_agent_reputation",
    description: "Query indexed/persisted Arbitra seller reliability before hiring.",
    inputSchema: {
      type: "object",
      properties: { agent: { type: "string", description: "Seller agent identifier (wallet address)" } },
      required: ["agent"],
    },
  },
  {
    name: "verify_deal_verdict",
    description: "Fetch and verify a persisted deal verdict hash through the backend.",
    inputSchema: {
      type: "object",
      properties: { dealId: { type: "string", description: "Deal identifier" } },
      required: ["dealId"],
    },
  },
  {
    name: "get_indexed_deal",
    description: "Query an escrow lifecycle record from The Graph, with explicit backend audit fallback.",
    inputSchema: {
      type: "object",
      properties: { dealId: { type: "string", description: "Deal identifier" } },
      required: ["dealId"],
    },
  },
  // ─── New Graph AI tools ───
  {
    name: "assess_seller_risk",
    description: "AI-powered risk assessment before hiring a seller. Queries The Graph for DeFi activity (Uniswap, Aave), combines with Arbitra escrow history, and produces an LLM-synthesized risk report with a LOW/MEDIUM/HIGH rating.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string", description: "Seller wallet address to assess" },
      },
      required: ["wallet"],
    },
  },
  {
    name: "verify_verdict_onchain",
    description: "Cross-verify an AI Judge verdict against on-chain state from The Graph. Checks that the deliverable was submitted, the deadline was met, and the verdict hash matches between on-chain and off-chain records.",
    inputSchema: {
      type: "object",
      properties: {
        dealId: { type: "string", description: "Deal identifier to verify" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "escrow_market_insights",
    description: "Natural-language market analysis of the escrow ecosystem. Aggregates data from Arbitra's subgraph and DeFi subgraphs on The Graph Network, then produces an AI-powered market report.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional natural-language question about the escrow market" },
      },
    },
  },
  {
    name: "search_defi_subgraphs",
    description: "Search 15,000+ subgraphs on The Graph Network by keyword. Returns matching subgraph names, descriptions, networks, and deployment IDs.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Search keyword (e.g., 'escrow', 'lending', 'uniswap', 'nft')" },
      },
      required: ["keyword"],
    },
  },
  {
    name: "query_wallet_activity",
    description: "Analyze a wallet's DeFi footprint across The Graph Network. Queries Uniswap swap history, Aave lending positions, and more, then produces an AI summary.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string", description: "Wallet address to analyze" },
      },
      required: ["wallet"],
    },
  },
];

// ── Message handler ───────────────────────────────────────────────────────

async function handle(message: { id?: unknown; method?: string; params?: Record<string, unknown> }): Promise<void> {
  if (message.method === "initialize") {
    reply(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "arbitra-graph-ai", version: "2.0.0" },
    });
    return;
  }

  if (message.method === "notifications/initialized") return;

  if (message.method === "tools/list") {
    reply(message.id, { tools: TOOLS });
    return;
  }

  if (message.method !== "tools/call") {
    protocolError(message.id ?? null, -32601, `Unknown method: ${message.method}`);
    return;
  }

  const toolName = message.params?.name as string | undefined;
  const args = (message.params?.arguments ?? {}) as Record<string, unknown>;

  // ─── Existing tools (unchanged logic) ───

  if (toolName === "get_agent_reputation") {
    const agent = args.agent;
    if (typeof agent !== "string" || !agent.trim()) { toolError(message.id ?? null, "agent is required"); return; }
    const data = await service.getReputation(agent);
    toolResult(message.id, data);
    return;
  }

  if (toolName === "verify_deal_verdict") {
    const dealId = args.dealId;
    if (typeof dealId !== "string" || !dealId.trim()) { toolError(message.id ?? null, "dealId is required"); return; }
    const data = await service.getAudit(dealId) as {
      verified?: boolean; verdictHash?: string; verdict?: string;
      score?: number; modelId?: string; modelVersion?: string; source?: string;
      [key: string]: unknown;
    };
    const result = "verified" in data || "verdictHash" in data ? {
      verified: data.verified, verdictHash: data.verdictHash, verdict: data.verdict,
      score: data.score, modelId: data.modelId, modelVersion: data.modelVersion, source: data.source,
    } : data;
    toolResult(message.id, result);
    return;
  }

  if (toolName === "get_indexed_deal") {
    const dealId = args.dealId;
    if (typeof dealId !== "string" || !dealId.trim()) { toolError(message.id ?? null, "dealId is required"); return; }
    const data = await service.getDeal(dealId);
    toolResult(message.id, data);
    return;
  }

  // ─── New Graph AI tools ───

  if (toolName === "assess_seller_risk") {
    if (!intelligence) { toolError(message.id ?? null, "Graph intelligence not configured. Set GRAPH_API_KEY and LLM_API_KEY."); return; }
    const wallet = args.wallet;
    if (typeof wallet !== "string" || !wallet.trim()) { toolError(message.id ?? null, "wallet is required"); return; }
    const data = await intelligence.assessSellerRisk(wallet);
    toolResult(message.id, data);
    return;
  }

  if (toolName === "verify_verdict_onchain") {
    if (!intelligence) { toolError(message.id ?? null, "Graph intelligence not configured. Set GRAPH_API_KEY and LLM_API_KEY."); return; }
    const dealId = args.dealId;
    if (typeof dealId !== "string" || !dealId.trim()) { toolError(message.id ?? null, "dealId is required"); return; }
    const data = await intelligence.verifyVerdictOnchain(dealId);
    toolResult(message.id, data);
    return;
  }

  if (toolName === "escrow_market_insights") {
    if (!intelligence) { toolError(message.id ?? null, "Graph intelligence not configured. Set GRAPH_API_KEY and LLM_API_KEY."); return; }
    const query = typeof args.query === "string" ? args.query : undefined;
    const data = await intelligence.getMarketInsights(query);
    toolResult(message.id, data);
    return;
  }

  if (toolName === "search_defi_subgraphs") {
    if (!intelligence) { toolError(message.id ?? null, "Graph intelligence not configured. Set GRAPH_API_KEY and LLM_API_KEY."); return; }
    const keyword = args.keyword;
    if (typeof keyword !== "string" || !keyword.trim()) { toolError(message.id ?? null, "keyword is required"); return; }
    const data = await intelligence.searchSubgraphs(keyword);
    toolResult(message.id, data);
    return;
  }

  if (toolName === "query_wallet_activity") {
    if (!intelligence) { toolError(message.id ?? null, "Graph intelligence not configured. Set GRAPH_API_KEY and LLM_API_KEY."); return; }
    const wallet = args.wallet;
    if (typeof wallet !== "string" || !wallet.trim()) { toolError(message.id ?? null, "wallet is required"); return; }
    const data = await intelligence.queryWalletActivity(wallet);
    toolResult(message.id, data);
    return;
  }

  toolError(message.id ?? null, `Unknown tool: ${toolName ?? "undefined"}`);
}

// ── Stdin JSON-RPC transport ──────────────────────────────────────────────

async function handleLine(line: string): Promise<void> {
  let message: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    message = JSON.parse(line) as { id?: unknown; method?: string; params?: Record<string, unknown> };
  } catch {
    protocolError(null, -32700, "Parse error");
    return;
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    protocolError(null, -32600, "Invalid Request");
    return;
  }
  try {
    await handle(message);
  } catch (error) {
    toolError(message.id ?? null, error instanceof Error ? error.message : "Tool execution failed");
  }
}

const input = createInterface({ input: process.stdin });
const pending = new Set<Promise<void>>();
input.on("line", (line) => {
  const task = handleLine(line);
  pending.add(task);
  void task.finally(() => pending.delete(task));
});
input.on("close", async () => {
  await Promise.all(pending);
});
