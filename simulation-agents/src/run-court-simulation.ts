import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendPort = Number(process.env.ARBITRA_DEMO_PORT ?? 3317);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const verdictStorePath = fileURLToPath(
  new URL("../data/demo-verdicts.jsonl", import.meta.url)
);

interface Reputation {
  agent: string;
  totalJudged: number;
  successes: number;
  failures: number;
  successRate: number;
  recencyWeightedReliability: number;
  byTaskCategory: Record<string, { total: number; successes: number; successRate: number }>;
}

function start(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawn(process.execPath, [command, ...args], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function waitForBackend(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${backendUrl}/health`);
      if (response.ok) return;
    } catch {
      // The backend may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Backend did not become healthy at ${backendUrl}`);
}

async function queryMcp(
  mcp: ChildProcessWithoutNullStreams,
  agent: string
): Promise<Reputation> {
  const output = new Promise<string>((resolve, reject) => {
    const chunks: string[] = [];
    mcp.stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
    mcp.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) reject(new Error(message));
    });
    mcp.on("error", reject);
    mcp.on("close", () => resolve(chunks.join("")));
  });

  mcp.stdin.end(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_agent_reputation", arguments: { agent } },
    })}\n`
  );

  const response = JSON.parse(await output) as {
    result?: { structuredContent?: Reputation; isError?: boolean };
  };
  if (response.result?.isError || !response.result?.structuredContent) {
    throw new Error(`MCP reputation query failed for ${agent}`);
  }
  return response.result.structuredContent;
}

function decisionFor(reputation: Reputation): "HIRE" | "DO NOT HIRE" {
  return reputation.successRate >= 0.7 && reputation.recencyWeightedReliability >= 0.7
    ? "HIRE"
    : "DO NOT HIRE";
}

async function main(): Promise<void> {
  const backend = start("backend/dist/server.js", [], {
    ...process.env,
    PORT: String(backendPort),
    VERDICT_STORE_PATH: verdictStorePath,
    ARBITRA_PERSISTENCE: "jsonl",
    ARBITRA_NO_LISTEN: "false",
  });

  try {
    await waitForBackend();
    const query = async (agent: string): Promise<Reputation> => {
      const mcp = start("mcp-server/dist/index.js", [], {
        ...process.env,
        ARBITRA_BACKEND_URL: backendUrl,
      });
      try {
        return await queryMcp(mcp, agent);
      } finally {
        mcp.kill();
      }
    };

    const agentB = await query("agent-b");
    const agentC = await query("agent-c");

    console.log("Arbitra agent hiring decision demo");
    console.log("MCP source: backend reputation index backed by persisted verdicts");
    for (const reputation of [agentB, agentC]) {
      console.log(
        `${reputation.agent}: ${reputation.successes}/${reputation.totalJudged} successful, ` +
          `${(reputation.successRate * 100).toFixed(0)}% success, ` +
          `decision = ${decisionFor(reputation)}`
      );
    }
    console.log("Agent A refuses agent-b and hires agent-c based on returned data.");
  } finally {
    backend.kill();
  }
}

await main();
