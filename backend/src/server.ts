import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  evaluateDeal,
  judgeDeliverable,
} from "./ai-judge/index.js";
import { settleEscrow } from "./oracle.js";
import { getReputation } from "./reputation.js";
import { markDealResolved } from "./persistence.js";
import { readPersistedJudgment } from "./persistence.js";
import { verifyVerdictHash } from "./ai-judge/verdict.js";
import { startResilientOracle } from "./blockchain/eventListener.js";

const PORT = Number(process.env.PORT ?? 3000);

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Arbitra-Internal-Key"
  );
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  setCorsHeaders(response);

  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });

  response.end(JSON.stringify(payload));
}

async function readJsonBody(
  request: IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf-8");

  if (!body.trim()) {
    throw new Error("Request body is empty");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function validateJudgeInput(
  body: unknown
): body is {
  task: string;
  acceptanceCriteria: string[];
  deliverable: string;
} {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const input = body as Record<string, unknown>;

  return (
    typeof input.task === "string" &&
    Array.isArray(input.acceptanceCriteria) &&
    input.acceptanceCriteria.every(
      (item) => typeof item === "string"
    ) &&
    typeof input.deliverable === "string"
  );
}

function isBadRequestError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Request body is empty" ||
      error.message === "Request body must be valid JSON")
  );
}

interface ApiJudgeInput {
  dealId: string;
  acceptanceCriteria: string[];
  deliverable: string;
  deadline: string | number;
  buyer?: string;
  seller?: string;
  taskCategory?: string;
}

function parseDeadline(value: unknown): string | number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : value;
}

function validateApiJudgeInput(
  body: unknown
): body is ApiJudgeInput {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const input = body as Record<string, unknown>;
  const deadline = parseDeadline(input.deadline);

  if (deadline === undefined) {
    return false;
  }

  return (
    typeof input.dealId === "string" &&
    input.dealId.trim().length > 0 &&
    Array.isArray(input.acceptanceCriteria) &&
    input.acceptanceCriteria.length > 0 &&
    input.acceptanceCriteria.every(
      (item) => typeof item === "string" && item.trim().length > 0
    ) &&
    typeof input.deliverable === "string" &&
    input.deliverable.trim().length > 0 &&
    (input.buyer === undefined || typeof input.buyer === "string") &&
    (input.seller === undefined || typeof input.seller === "string") &&
    (input.taskCategory === undefined || typeof input.taskCategory === "string") &&
    (typeof deadline === "number" || typeof deadline === "string") &&
    new Date(
      typeof deadline === "number" ? deadline * 1000 : deadline
    ).getTime() > Date.now()
  );
}

function validateSettlementInput(
  body: unknown
): body is {
  dealId: string;
  task: string;
  acceptanceCriteria: string[];
  deliverable: string;
} {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const input = body as Record<string, unknown>;

  return (
    typeof input.dealId === "string" &&
    validateJudgeInput({
      task: input.task,
      acceptanceCriteria: input.acceptanceCriteria,
      deliverable: input.deliverable,
    })
  );
}

function isAuthorizedSettlementRequest(
  request: IncomingMessage
): boolean {
  const expectedKey = process.env.ARBITRA_INTERNAL_KEY;
  const providedKey = request.headers["x-arbitra-internal-key"];

  if (!expectedKey || typeof providedKey !== "string") {
    return false;
  }

  return providedKey === expectedKey;
}

export const server = createServer(
  async (
    request: IncomingMessage,
    response: ServerResponse
  ) => {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "arbitra-ai-judge",
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/judge") {
      try {
        const body = await readJsonBody(request);

        if (!validateApiJudgeInput(body)) {
          sendJson(response, 400, {
            success: false,
            error:
              "Invalid input. Expected dealId, acceptanceCriteria[], deliverable, and deadline.",
          });
          return;
        }

        sendJson(response, 200, await evaluateDeal(body));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown server error";

        sendJson(response, isBadRequestError(error) ? 400 : 502, {
          success: false,
          error: `AI Judge request failed: ${message}`,
        });
      }

      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/reputation/")) {
      let agent: string;
      try {
        const path = new URL(request.url, "http://localhost").pathname;
        agent = decodeURIComponent(path.slice("/api/reputation/".length));
      } catch {
        sendJson(response, 400, { error: "Agent must be URL encoded" });
        return;
      }

      if (!agent.trim()) {
        sendJson(response, 400, { error: "Agent is required" });
        return;
      }
      try {
        sendJson(response, 200, await getReputation(agent));
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : "Unable to read reputation" });
      }
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/judgments/")) {
      let dealId: string;
      try {
        const path = new URL(request.url, "http://localhost").pathname;
        dealId = decodeURIComponent(path.slice("/api/judgments/".length));
      } catch {
        sendJson(response, 400, { error: "Deal ID must be URL encoded" });
        return;
      }

      if (!dealId.trim()) {
        sendJson(response, 400, { error: "Deal ID is required" });
        return;
      }

      try {
        const record = await readPersistedJudgment(dealId);
        if (!record) {
          sendJson(response, 404, { error: "Judgment not found" });
          return;
        }
        sendJson(response, 200, { ...record, verified: verifyVerdictHash(record) });
      } catch (error) {
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : "Unable to read judgment",
        });
      }
      return;
    }

    if (
      request.method === "POST" &&
      request.url === "/api/judge-and-settle"
    ) {
      if (!process.env.ARBITRA_INTERNAL_KEY) {
        sendJson(response, 503, {
          success: false,
          error: "Settlement endpoint is not configured",
        });
        return;
      }

      if (!isAuthorizedSettlementRequest(request)) {
        sendJson(response, 401, {
          success: false,
          error: "Unauthorized settlement request",
        });
        return;
      }

      try {
        const body = await readJsonBody(request);

        if (!validateApiJudgeInput(body)) {
          sendJson(response, 400, {
            success: false,
            error:
              "Invalid input. Expected dealId, acceptanceCriteria[], deliverable, and a future deadline.",
          });
          return;
        }

        const verdict = await evaluateDeal(body);
        const settlement = await settleEscrow(
          body.dealId,
          verdict.approved,
          verdict.reasoning,
          verdict.verdictHash
        );
        await markDealResolved(body.dealId, settlement.transactionHash);

        sendJson(response, 200, { verdict, settlement });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown server error";

        sendJson(response, isBadRequestError(error) ? 400 : 502, {
          success: false,
          error: `AI Judge settlement failed: ${message}`,
        });
      }

      return;
    }

    if (request.method === "POST" && request.url === "/judge") {
      try {
        const body = await readJsonBody(request);

        if (!validateJudgeInput(body)) {
          sendJson(response, 400, {
            success: false,
            error:
              "Invalid input. Expected task, acceptanceCriteria[], and deliverable.",
          });
          return;
        }

        const result = await judgeDeliverable({
          task: body.task,
          acceptanceCriteria: body.acceptanceCriteria,
          deliverable: body.deliverable,
        });

        sendJson(response, 200, {
          success: true,
          result,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown server error";

        sendJson(response, 500, {
          success: false,
          error: message,
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      request.url === "/judge-and-settle"
    ) {
      if (!process.env.ARBITRA_INTERNAL_KEY) {
        sendJson(response, 503, {
          success: false,
          error: "Settlement endpoint is not configured",
        });
        return;
      }

      if (!isAuthorizedSettlementRequest(request)) {
        sendJson(response, 401, {
          success: false,
          error: "Unauthorized settlement request",
        });
        return;
      }

      try {
        const body = await readJsonBody(request);

        if (!validateSettlementInput(body)) {
          sendJson(response, 400, {
            success: false,
            error:
              "Invalid input. Expected dealId, task, acceptanceCriteria[], and deliverable.",
          });
          return;
        }

        const result = await judgeDeliverable({
          task: body.task,
          acceptanceCriteria: body.acceptanceCriteria,
          deliverable: body.deliverable,
        });

        const settlement = await settleEscrow(
          body.dealId,
          result.approved,
          result.reasoning
        );

        sendJson(response, 200, {
          success: true,
          result,
          settlement,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown server error";

        sendJson(response, 500, {
          success: false,
          error: message,
        });
      }

      return;
    }

    sendJson(response, 404, {
      success: false,
      error: "Route not found",
    });
  }
);

if (process.env.ARBITRA_NO_LISTEN !== "true") {
  server.listen(PORT, () => {
    console.log(
      `Arbitra AI Judge API listening on http://localhost:${PORT}`
    );
  });

  // Start the background blockchain listener alongside the REST API
  startResilientOracle().catch(console.error);
}
