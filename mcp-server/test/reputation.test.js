import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, it } from "mocha";

describe("reputation MCP tool", function () {
  it("returns structured reputation an agent can use for hiring", async function () {
    const http = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        agent: "agent-b",
        totalJudged: 4,
        successRate: 0.25,
        failureRate: 0.75,
        recencyWeightedReliability: 0.2,
        byTaskCategory: { coding: { total: 4, successes: 1, successRate: 0.25 } },
      }));
    });
    http.listen(0);
    await once(http, "listening");
    const address = http.address();
    assert.ok(address && typeof address !== "string");

    const child = spawn(process.execPath, ["dist/index.js"], {
      env: { ...process.env, ARBITRA_BACKEND_URL: `http://127.0.0.1:${address.port}` },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    const errors = [];
    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk) => errors.push(chunk.toString()));
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_agent_reputation", arguments: { agent: "agent-b" } },
    }) + "\n");
    child.stdin.end();
    await once(child, "close");
    await new Promise((resolve) => http.close(resolve));

    assert.notEqual(output.join(""), "", errors.join(""));
    const result = JSON.parse(output.join(""));
    assert.ok(result.result?.structuredContent, JSON.stringify(result));
    assert.equal(result.result.structuredContent.successRate, 0.25);
    assert.equal(result.result.structuredContent.failureRate, 0.75);
    const shouldHire = result.result.structuredContent.successRate >= 0.7;
    assert.equal(shouldHire, false);
  });

  it("verifies a deal verdict through the backend audit endpoint", async function () {
    const http = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        verified: true,
        verdictHash: "0xabc",
        verdict: "PASS",
        score: 100,
        modelId: "test-model",
        modelVersion: "test-version",
      }));
    });
    http.listen(0);
    await once(http, "listening");
    const address = http.address();
    assert.ok(address && typeof address !== "string");

    const child = spawn(process.execPath, ["dist/index.js"], {
      env: { ...process.env, ARBITRA_BACKEND_URL: `http://127.0.0.1:${address.port}` },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stdin.end(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "verify_deal_verdict", arguments: { dealId: "deal-123" } },
    }) + "\n");
    await once(child, "close");
    await new Promise((resolve) => http.close(resolve));

    const result = JSON.parse(output.join("")).result;
    assert.equal(result.structuredContent.verified, true);
    assert.equal(result.structuredContent.verdict, "PASS");
    assert.equal(result.structuredContent.modelVersion, "test-version");
  });

  it("prefers Graph indexed escrow facts and labels the source", async function () {
    const graph = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      assert.match(body, /Escrows/);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ data: { escrows: [{
        id: "0xdeal", dealId: "0xdeal", buyer: "0xbuyer", seller: "0xseller", token: "0xtoken",
        amount: "100", criteriaHash: "criteria", deadline: "200", state: "ResolvedSuccess",
        approved: true, verdictReasoningHash: "0xreasoning", createdTransactionHash: "0xcreate", createdBlockNumber: "10",
        submittedTransactionHash: "0xsubmit", submittedBlockNumber: "11",
        resolvedTransactionHash: "0xresolve", resolvedBlockNumber: "12",
      }] } }));
    });
    graph.listen(0);
    await once(graph, "listening");
    const graphAddress = graph.address();
    assert.ok(graphAddress && typeof graphAddress !== "string");

    const child = spawn(process.execPath, ["dist/index.js"], {
      env: { ...process.env, GRAPH_ENDPOINT: `http://127.0.0.1:${graphAddress.port}` },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_agent_reputation", arguments: { agent: "0xseller" } } }) + "\n");
    await once(child, "close");
    await new Promise((resolve) => graph.close(resolve));

    const result = JSON.parse(output.join("")).result.structuredContent;
    assert.equal(result.source, "graph");
    assert.equal(result.sourceReason, "graph");
    assert.equal(result.successRate, 1);
    assert.equal(result.history[0].resolvedTransactionHash, "0xresolve");
    assert.equal(result.history[0].verdictReasoningHash, "0xreasoning");
  });

  it("falls back to the backend when Graph is empty or malformed", async function () {
    const graph = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ data: { escrows: [] } }));
    });
    const backend = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ agent: "agent-b", totalJudged: 1, successes: 1, failures: 0, successRate: 1, failureRate: 0 }));
    });
    graph.listen(0); backend.listen(0);
    await Promise.all([once(graph, "listening"), once(backend, "listening")]);
    const graphAddress = graph.address(); const backendAddress = backend.address();
    assert.ok(graphAddress && typeof graphAddress !== "string");
    assert.ok(backendAddress && typeof backendAddress !== "string");

    const child = spawn(process.execPath, ["dist/index.js"], {
      env: { ...process.env, GRAPH_ENDPOINT: `http://127.0.0.1:${graphAddress.port}`, ARBITRA_BACKEND_URL: `http://127.0.0.1:${backendAddress.port}` },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_agent_reputation", arguments: { agent: "agent-b" } } }) + "\n");
    await once(child, "close");
    await new Promise((resolve) => graph.close(resolve));
    await new Promise((resolve) => backend.close(resolve));

    const result = JSON.parse(output.join("")).result.structuredContent;
    assert.equal(result.source, "backend");
    assert.equal(result.sourceReason, "graph_empty");
    assert.equal(result.totalJudged, 1);
  });

  it("labels an unreachable Graph endpoint when using backend fallback", async function () {
    const backend = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ agent: "agent-b", totalJudged: 0, successes: 0, failures: 0, successRate: 0, failureRate: 0 }));
    });
    backend.listen(0);
    await once(backend, "listening");
    const address = backend.address();
    assert.ok(address && typeof address !== "string");

    const child = spawn(process.execPath, ["dist/index.js"], {
      env: { ...process.env, GRAPH_ENDPOINT: "http://127.0.0.1:1", ARBITRA_BACKEND_URL: `http://127.0.0.1:${address.port}` },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_agent_reputation", arguments: { agent: "agent-b" } } }) + "\n");
    await once(child, "close");
    await new Promise((resolve) => backend.close(resolve));

    const result = JSON.parse(output.join(""));
    assert.equal(result.result.structuredContent.source, "backend");
    assert.equal(result.result.structuredContent.sourceReason, "graph_unavailable");
  });
});
