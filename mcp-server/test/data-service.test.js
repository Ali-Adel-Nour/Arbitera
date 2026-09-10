import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, it } from "mocha";
import { GraphAdapter, GraphUnavailableError } from "../dist/data-service.js";

function deal(overrides = {}) {
  return {
    id: "0xdeal",
    dealId: "0xdeal",
    buyer: "0xbuyer",
    seller: "0xseller",
    token: "0xtoken",
    amount: "100",
    criteriaHash: "criteria",
    deadline: "200",
    state: "ResolvedRefund",
    deliverableHash: null,
    approved: false,
    createdTransactionHash: "0xcreate",
    createdBlockNumber: "10",
    submittedTransactionHash: "0xsubmit",
    submittedBlockNumber: "11",
    resolvedTransactionHash: "0xresolve",
    resolvedBlockNumber: "12",
    verdictReasoningHash: "0xreasoning",
    createdAt: "1000",
    updatedAt: "1000",
    ...overrides,
  };
}

async function graphServer(payload, delay = 0) {
  const server = createServer(async (request, response) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    response.statusCode = payload.status ?? 200;
    response.setHeader("Content-Type", "application/json");
    if (payload.body !== undefined) response.end(payload.body);
    else response.end(JSON.stringify(payload.json ?? { data: { escrows: [deal()] } }));
  });
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, endpoint: `http://127.0.0.1:${address.port}` };
}

describe("GraphAdapter validation and reliability", function () {
  it("accepts real booleans and rejects string booleans", async function () {
    const valid = await graphServer({ json: { data: { escrows: [deal({ approved: true })] } } });
    const adapter = new GraphAdapter(valid.endpoint);
    assert.equal((await adapter.getDeals("0xseller"))[0].approved, true);
    await new Promise((resolve) => valid.server.close(resolve));

    const invalid = await graphServer({ json: { data: { escrows: [deal({ approved: "false" })] } } });
    await assert.rejects(() => new GraphAdapter(invalid.endpoint).getDeals("0xseller"), /approved is invalid/);
    await new Promise((resolve) => invalid.server.close(resolve));
  });

  it("excludes unresolved and expired refunds from AI judgment counts", async function () {
    const fixture = [
      deal({ dealId: "1", id: "1", approved: null, state: "Submitted" }),
      deal({ dealId: "2", id: "2", approved: null, state: "ExpiredRefund" }),
      deal({ dealId: "3", id: "3", approved: false, state: "ResolvedRefund" }),
    ];
    const server = await graphServer({ json: { data: { escrows: fixture } } });
    const result = await new GraphAdapter(server.endpoint, undefined, 5000, () => 1000 * 1000).getReputation("0xseller");
    assert.equal(result.totalDeals, 3);
    assert.equal(result.totalJudged, 1);
    assert.equal(result.successes, 0);
    assert.equal(result.failures, 1);
    await new Promise((resolve) => server.server.close(resolve));
  });

  it("rejects malformed required and numeric fields", async function () {
    for (const override of [{ buyer: undefined }, { amount: "not-a-number" }, { createdAt: "not-a-timestamp" }]) {
      const server = await graphServer({ json: { data: { escrows: [deal(override)] } } });
      await assert.rejects(() => new GraphAdapter(server.endpoint).getDeals("0xseller"), /Graph field/);
      await new Promise((resolve) => server.server.close(resolve));
    }
  });

  it("keeps recency deterministic with an injected clock", async function () {
    const server = await graphServer({ json: { data: { escrows: [deal({ approved: true, createdAt: "900000", updatedAt: "900000" })] } } });
    const adapter = new GraphAdapter(server.endpoint, undefined, 5000, () => 1_000_000_000);
    const first = await adapter.getReputation("0xseller");
    const second = await adapter.getReputation("0xseller");
    assert.deepEqual(first, second);
    assert.ok(Number.isFinite(first.recencyWeightedReliability));
    await new Promise((resolve) => server.server.close(resolve));
  });

  it("classifies timeout, non-2xx, and GraphQL errors", async function () {
    const slow = await graphServer({ json: { data: { escrows: [] } } }, 100);
    await assert.rejects(() => new GraphAdapter(slow.endpoint, undefined, 10).getDeals("0xseller"), (error) => error instanceof GraphUnavailableError && /timed out/.test(error.message));
    await new Promise((resolve) => slow.server.close(resolve));

    const status = await graphServer({ status: 503, json: { error: "offline" } });
    await assert.rejects(() => new GraphAdapter(status.endpoint).getDeals("0xseller"), (error) => error instanceof GraphUnavailableError);
    await new Promise((resolve) => status.server.close(resolve));

    const graphql = await graphServer({ json: { errors: [{ message: "bad query" }] } });
    await assert.rejects(() => new GraphAdapter(graphql.endpoint).getDeals("0xseller"), /invalid response/);
    await new Promise((resolve) => graphql.server.close(resolve));
  });
});
