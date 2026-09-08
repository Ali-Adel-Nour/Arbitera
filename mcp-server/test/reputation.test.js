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
});
