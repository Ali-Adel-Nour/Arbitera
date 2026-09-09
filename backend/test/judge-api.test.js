import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "mocha";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";

process.env.ARBITRA_NO_LISTEN = "true";
process.env.LLM_API_KEY = "test-key";
process.env.LLM_BASE_URL = "http://llm.test/v1";
process.env.LLM_MODEL = "test-model";
process.env.LLM_MODEL_VERSION = "test-model-2026-01";
process.env.VERDICT_STORE_PATH = join(tmpdir(), "arbitra-verdicts-test.jsonl");

const { server } = await import("../dist/server.js");
const { buildVerdict, verifyVerdictHash } = await import("../dist/ai-judge/verdict.js");
const { parseJudgeResponse } = await import("../dist/ai-judge/judge.js");
const { settlementGateway } = await import("../dist/server.js");
const { prisma } = await import("../dist/lib/prisma.js");
const realFetch = globalThis.fetch;
let judgeResponse = {
  approved: true,
  verdict: "PASS",
  reasoning: "All criteria are satisfied.",
};
let lastJudgeRequest;

describe("POST /api/judge", function () {
  before(async function () {
    await rm(process.env.VERDICT_STORE_PATH, { force: true });
    await prisma.escrowDeal.deleteMany({ where: { sellerAddress: "agent-b" } });
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith("http://llm.test/")) {
        lastJudgeRequest = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(judgeResponse) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return realFetch(input, init);
    };

    server.listen(0);
    await once(server, "listening");
  });

  after(async function () {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  it("returns the normalized structured verdict", async function () {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealId: "deal-123",
        acceptanceCriteria: ["The report contains the requested analysis."],
        deliverable: "The requested analysis is included.",
        deadline: "2099-01-01T00:00:00.000Z",
        seller: "agent-b",
      }),
    });

    assert.equal(response.status, 200);
    const verdict = await response.json();
    assert.equal(verdict.dealId, "deal-123");
    assert.equal(verdict.approved, true);
    assert.equal(verdict.score, 100);
    assert.equal(verdict.modelId, "test-model");
    assert.equal(verdict.modelVersion, "test-model-2026-01");
    assert.match(verdict.rubricHash, /^0x[0-9a-f]{64}$/);
    assert.match(verdict.deliverableHash, /^0x[0-9a-f]{64}$/);
    assert.match(verdict.verdictHash, /^0x[0-9a-f]{64}$/);
    assert.equal(verdict.deadline, "2099-01-01T00:00:00.000Z");
    assert.equal(lastJudgeRequest.response_format.type, "json_schema");
    assert.deepEqual(lastJudgeRequest.response_format.json_schema.schema.required, ["approved", "verdict", "reasoning"]);

    const persisted = await prisma.escrowDeal.findUnique({
      where: { dealId: "deal-123" },
    });
    assert.ok(persisted);
    assert.equal(persisted.sellerAddress, "agent-b");
    assert.equal(persisted.aiVerdict, true);
    assert.equal(persisted.aiScore, 100);
    assert.equal(persisted.verdictHash, verdict.verdictHash);
    assert.equal(persisted.state, "JUDGED");

    const repeatResponse = await fetch(`http://127.0.0.1:${address.port}/api/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealId: "deal-123",
        acceptanceCriteria: ["The report contains the requested analysis."],
        deliverable: "The requested analysis is included.",
        deadline: "2099-01-01T00:00:00.000Z",
        seller: "agent-b",
      }),
    });
    assert.equal((await repeatResponse.json()).verdictHash, verdict.verdictHash);
    assert.equal(
      await prisma.escrowDeal.count({ where: { dealId: "deal-123" } }),
      1
    );
  });

  it("returns a bounded FAIL verdict", async function () {
    judgeResponse = {
      approved: false,
      verdict: "FAIL",
      reasoning: "The deliverable misses the required analysis.",
    };

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealId: "deal-fail",
        acceptanceCriteria: ["Include the analysis."],
        deliverable: "No analysis.",
        deadline: Math.floor(Date.now() / 1000) + 3600,
        seller: "agent-b",
      }),
    });

    const verdict = await response.json();
    assert.equal(response.status, 200);
    assert.equal(verdict.approved, false);
    assert.equal(verdict.score, 0);

    const persisted = await prisma.escrowDeal.findUnique({
      where: { dealId: "deal-fail" },
    });
    assert.ok(persisted);
    assert.equal(persisted.aiVerdict, false);
    assert.equal(persisted.aiScore, 0);
    assert.equal(persisted.verdictHash, verdict.verdictHash);
  });

  it("rejects malformed input before calling the judge", async function () {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId: "deal-123", deliverable: "work" }),
    });

    assert.equal(response.status, 400);
  });

  it("rejects an expired deadline", async function () {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealId: "deal-expired",
        acceptanceCriteria: ["Complete the work."],
        deliverable: "Work",
        deadline: "2000-01-01T00:00:00.000Z",
      }),
    });

    assert.equal(response.status, 400);
  });

  it("advertises the settlement auth header for browser clients", async function () {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/judge-and-settle`, {
      method: "OPTIONS",
    });

    assert.equal(response.status, 204);
    assert.match(
      response.headers.get("access-control-allow-headers") ?? "",
      /X-Arbitra-Internal-Key/i
    );
  });

  it("changes the hash when audited inputs change", function () {
    const base = {
      dealId: "deal-hash",
      acceptanceCriteria: ["criterion"],
      deliverable: "deliverable",
      deadline: "2099-01-01T00:00:00.000Z",
    };
    const result = {
      approved: true,
      verdict: "PASS",
      reasoning: "approved",
      evaluationPrompt: "prompt-a",
      rawResponse: "raw-a",
    };
    const original = buildVerdict(base, result);

    assert.notEqual(buildVerdict({ ...base, deliverable: "changed" }, result).verdictHash, original.verdictHash);
    assert.notEqual(buildVerdict(base, { ...result, evaluationPrompt: "prompt-b" }).verdictHash, original.verdictHash);
    assert.notEqual(buildVerdict(base, { ...result, rawResponse: "raw-b" }).verdictHash, original.verdictHash);
    process.env.LLM_MODEL_VERSION = "changed-version";
    assert.notEqual(buildVerdict(base, result).verdictHash, original.verdictHash);
    process.env.LLM_MODEL_VERSION = "test-model-2026-01";
  });

  it("serves reputation data for an agent", async function () {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/reputation/agent-b`);
    const reputation = await response.json();
    assert.equal(response.status, 200);
    assert.equal(reputation.totalJudged, 2);
    assert.equal(reputation.successes, 1);
    assert.equal(reputation.failures, 1);
    assert.equal(reputation.successRate, 1 / 2);
    assert.equal(reputation.byTaskCategory.uncategorized.total, 2);
    assert.ok(reputation.recencyWeightedReliability >= 0);
    assert.ok(reputation.recencyWeightedReliability <= 1);
  });

  it("accepts a fenced verdict with surrounding explanation", function () {
    assert.deepEqual(
      parseJudgeResponse('Result follows:\n```json\n{"approved":true,"verdict":"PASS","reasoning":"done"}\n```'),
      { approved: true, verdict: "PASS", reasoning: "done" },
    );
  });

  it("rejects malformed JSON, missing fields, and wrong field types", function () {
    assert.throws(() => parseJudgeResponse("not json"), /invalid JSON/);
    assert.throws(() => parseJudgeResponse('{"approved":true,"verdict":"PASS"}'), /invalid schema/);
    assert.throws(() => parseJudgeResponse('{"approved":"true","verdict":"PASS","reasoning":"done"}'), /invalid field types/);
  });

  it("settles through the structured verdict and persists its canonical hash", async function () {
    process.env.ARBITRA_INTERNAL_KEY = "test-internal-key";
    judgeResponse = { approved: true, verdict: "PASS", reasoning: "settlement criteria satisfied" };
    const originalSettlement = settlementGateway.settleEscrow;
    settlementGateway.settleEscrow = async (dealId, approved, reasoning, verdictHash) => {
      assert.equal(dealId, "deal-settle");
      assert.equal(approved, true);
      assert.equal(reasoning, "settlement criteria satisfied");
      assert.match(verdictHash, /^0x[0-9a-f]{64}$/);
      return { transactionHash: "0xsettlement", reasoningHash: verdictHash };
    };

    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/judge-and-settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Arbitra-Internal-Key": "test-internal-key" },
        body: JSON.stringify({
          dealId: "deal-settle",
          acceptanceCriteria: ["Return the requested result."],
          deliverable: "The requested result.",
          deadline: "2099-01-01T00:00:00.000Z",
          seller: "agent-b",
        }),
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.settlement.transactionHash, "0xsettlement");
      assert.equal(body.verdict.verdictHash, body.settlement.reasoningHash);
      const persisted = await prisma.escrowDeal.findUnique({ where: { dealId: "deal-settle" } });
      assert.equal(persisted.state, "RESOLVED");
    } finally {
      settlementGateway.settleEscrow = originalSettlement;
      delete process.env.ARBITRA_INTERNAL_KEY;
    }
  });

  it("serves and verifies the canonical persisted judgment record", async function () {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/judgments/deal-123`);
    const record = await response.json();
    assert.equal(response.status, 200);
    assert.equal(record.dealId, "deal-123");
    assert.equal(record.acceptanceCriteria[0], "The report contains the requested analysis.");
    assert.equal(record.deliverable, "The requested analysis is included.");
    assert.equal(record.modelId, "test-model");
    assert.equal(record.modelVersion, "test-model-2026-01");
    assert.equal(record.verified, true);
    assert.equal(verifyVerdictHash(record), true);

    for (const changed of [
      { evaluationPrompt: `${record.evaluationPrompt} changed` },
      { deliverable: `${record.deliverable} changed` },
      { modelVersion: "tampered-version" },
      { rawResponse: `${record.rawResponse} changed` },
    ]) {
      assert.equal(verifyVerdictHash({ ...record, ...changed }), false);
    }
  });
});
