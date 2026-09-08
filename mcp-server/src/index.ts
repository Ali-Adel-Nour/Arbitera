import { createInterface } from "node:readline";

const backendUrl = process.env.ARBITRA_BACKEND_URL ?? "http://localhost:3000";

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
      }],
    });
    return;
  }

  if (message.method === "tools/call" && message.params?.name === "get_agent_reputation") {
    const agent = message.params.arguments?.agent;
    if (typeof agent !== "string" || !agent.trim()) {
      reply(message.id, { isError: true, content: [{ type: "text", text: "agent is required" }] });
      return;
    }
    const response = await fetch(`${backendUrl}/api/reputation/${encodeURIComponent(agent)}`);
    const data = await response.json();
    reply(message.id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: !response.ok });
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
