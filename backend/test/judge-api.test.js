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
const { buildVerdict } = await import("../dist/ai-judge/verdict.js");
const realFetch = globalThis.fetch;
let judgeResponse = {
  approved: true,
  verdict: "PASS",
  reasoning: "All criteria are satisfied.",
};

describe("POST /api/judge", function () {
  before(async function () {
    await rm(process.env.VERDICT_STORE_PATH, { force: true });
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith("http://llm.test/")) {
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
    assert.equal(reputation.totalJudged, 3);
    assert.equal(reputation.successes, 2);
    assert.equal(reputation.failures, 1);
    assert.equal(reputation.successRate, 2 / 3);
    assert.equal(reputation.byTaskCategory.uncategorized.total, 3);
  });
});
