import { createInterface } from "node:readline";
import { ArbiteraDataService } from "./data-service.js";

const backendUrl = process.env.ARBITRA_BACKEND_URL ?? "http://localhost:3000";
const service = new ArbiteraDataService(backendUrl);

function reply(id: unknown, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

async function handle(message: { id?: unknown; method?: string; params?: any }): Promise<void> {
  if (message.method === "initialize") {
    reply(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "arbitra-reputation", version: "1.0.0" },
    });
    return;
  }

  if (message.method === "notifications/initialized") return;

  if (message.method === "tools/list") {
    reply(message.id, {
      tools: [{
        name: "get_agent_reputation",
        description: "Query indexed/persisted Arbitra seller reliability before hiring.",
        inputSchema: {
          type: "object",
          properties: { agent: { type: "string", description: "Seller agent identifier" } },
          required: ["agent"],
        },
      }, {
        name: "verify_deal_verdict",
        description: "Fetch and verify a persisted deal verdict hash through the backend.",
        inputSchema: {
          type: "object",
          properties: { dealId: { type: "string", description: "Deal identifier" } },
          required: ["dealId"],
        },
      }, {
        name: "get_indexed_deal",
        description: "Query an escrow lifecycle record from The Graph, with explicit backend audit fallback.",
        inputSchema: {
          type: "object",
          properties: { dealId: { type: "string", description: "Deal identifier" } },
          required: ["dealId"],
        },
      }],
    });
    return;
  }

  if (message.method === "tools/call" && message.params?.name === "verify_deal_verdict") {
    const dealId = message.params.arguments?.dealId;
    if (typeof dealId !== "string" || !dealId.trim()) {
      reply(message.id, { isError: true, content: [{ type: "text", text: "dealId is required" }] });
      return;
    }
    const data = await service.getAudit(dealId) as {
      verified?: boolean;
      verdictHash?: string;
      verdict?: string;
      score?: number;
      modelId?: string;
      modelVersion?: string;
      source?: string;
      [key: string]: unknown;
    };
    const result = "verified" in data || "verdictHash" in data ? {
      verified: data.verified, verdictHash: data.verdictHash, verdict: data.verdict,
      score: data.score, modelId: data.modelId, modelVersion: data.modelVersion, source: data.source,
    } : data;
    reply(message.id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
    return;
  }

  if (message.method === "tools/call" && message.params?.name === "get_agent_reputation") {
    const agent = message.params.arguments?.agent;
    if (typeof agent !== "string" || !agent.trim()) {
      reply(message.id, { isError: true, content: [{ type: "text", text: "agent is required" }] });
      return;
    }
    const data = await service.getReputation(agent);
    reply(message.id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data });
    return;
  }

  if (message.method === "tools/call" && message.params?.name === "get_indexed_deal") {
    const dealId = message.params.arguments?.dealId;
    if (typeof dealId !== "string" || !dealId.trim()) {
      reply(message.id, { isError: true, content: [{ type: "text", text: "dealId is required" }] });
      return;
    }
    const data = await service.getDeal(dealId);
    reply(message.id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data });
    return;
  }

  reply(message.id, { isError: true, content: [{ type: "text", text: `Unknown method: ${message.method}` }] });
}

const input = createInterface({ input: process.stdin });
const pending = new Set<Promise<void>>();
input.on("line", (line) => {
  const task = handle(JSON.parse(line)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  });
  pending.add(task);
  void task.finally(() => pending.delete(task));
});
input.on("close", async () => {
  await Promise.all(pending);
});
