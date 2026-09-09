import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const backendPort = Number(process.env.ARBITRA_DEMO_PORT ?? 3317);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
process.env.DATABASE_URL = "file:./demo.db";
execFileSync(process.execPath, [
  "node_modules/prisma/build/index.js",
  "migrate",
  "deploy",
  "--schema",
  "backend/prisma/schema.prisma",
], { cwd: repositoryRoot, stdio: "ignore", env: process.env });

const { buildVerdict } = await import("../../backend/dist/ai-judge/verdict.js");
const { persistVerdict } = await import("../../backend/dist/persistence.js");
const { prisma } = await import("../../backend/dist/lib/prisma.js");
const verdictStorePath = fileURLToPath(
  new URL("../data/demo-verdicts.jsonl", import.meta.url)
);

async function seedDemoPersistence(): Promise<void> {
  const fixture = await readFile(verdictStorePath, "utf8");
  const records = fixture.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as {
    dealId: string;
    seller: string;
    approved: boolean;
    score: number;
    verdictHash: string;
    timestamp: string;
    taskCategory: string;
  });

  for (const record of records) {
    const timestamp = new Date(record.timestamp);
    await prisma.escrowDeal.upsert({
      where: { dealId: record.dealId },
      create: {
        dealId: record.dealId,
        sellerAddress: record.seller,
        criteriaText: JSON.stringify(["Demo fixture judgment"]),
        deliverableText: record.approved ? "Completed demo deliverable" : "Incomplete demo deliverable",
        taskCategory: record.taskCategory,
        deadline: new Date("2099-01-01T00:00:00.000Z"),
        state: "JUDGED",
        aiVerdict: record.approved,
        aiReasoning: "Deterministic demo fixture record.",
        aiScore: record.score,
        verdictHash: record.verdictHash,
        evaluationPrompt: "Demo fixture evaluation prompt",
        modelId: "demo-fixture",
        modelVersion: "demo-fixture-1",
        rawLlmResponse: JSON.stringify({ approved: record.approved }),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      update: {
        sellerAddress: record.seller,
        aiVerdict: record.approved,
        aiScore: record.score,
        verdictHash: record.verdictHash,
        taskCategory: record.taskCategory,
        updatedAt: timestamp,
      },
    });
  }

  const audit = buildVerdict(
    {
      dealId: "demo-audit-1",
      acceptanceCriteria: ["The demo audit record is complete."],
      deliverable: "The demo audit record is complete.",
      deadline: "2099-01-01T00:00:00.000Z",
      seller: "agent-c",
      taskCategory: "coding",
    },
    {
      approved: true,
      verdict: "PASS",
      reasoning: "The demo record satisfies its criterion.",
      evaluationPrompt: "Demo audit evaluation prompt",
      rawResponse: JSON.stringify({ approved: true, verdict: "PASS" }),
      modelId: "demo-model",
      modelVersion: "demo-model-1",
    }
  );
  await persistVerdict(audit);
}

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
  await seedDemoPersistence();
  const backend = start("backend/dist/server.js", [], {
    ...process.env,
    PORT: String(backendPort),
    DATABASE_URL: "file:./demo.db",
    ARBITRA_PERSISTENCE: "prisma",
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
    console.log("MCP source: Prisma-backed reputation records");
    for (const reputation of [agentB, agentC]) {
      console.log(
        `Agent A → MCP reputation query → ${reputation.agent}: ` +
          `${reputation.successes}/${reputation.totalJudged} successful, ` +
          `${(reputation.successRate * 100).toFixed(0)}% success, ` +
          `reasoning = successRate ${reputation.successRate.toFixed(2)} and ` +
          `recency ${reputation.recencyWeightedReliability.toFixed(2)}; ` +
          `${decisionFor(reputation)}`
      );
    }

    const mcp = start("mcp-server/dist/index.js", [], {
      ...process.env,
      ARBITRA_BACKEND_URL: backendUrl,
    });
    try {
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
      mcp.stdin.end(`${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "verify_deal_verdict", arguments: { dealId: "demo-audit-1" } },
      })}\n`);
      const verification = JSON.parse(await output).result?.structuredContent;
      console.log(`Deal demo-audit-1 → ${verification.verdict} → ${verification.verdictHash}`);
      console.log(`Independent verification → ${verification.verified ? "VERIFIED" : "FAILED"}`);
    } finally {
      mcp.kill();
    }
  } finally {
    backend.kill();
    await prisma.$disconnect();
  }
}

await main();
