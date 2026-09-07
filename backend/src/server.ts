import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { judgeDeliverable } from "./ai-judge/index.js";

const PORT = Number(process.env.PORT ?? 3000);

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
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

const server = createServer(
  async (request: IncomingMessage, response: ServerResponse) => {
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

    if (request.method === "POST" && request.url === "/judge") {
      try {
        const body = await readJsonBody(request);

        if (!validateJudgeInput(body)) {
          sendJson(response, 400, {
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

    sendJson(response, 404, {
      error: "Route not found",
    });
  }
);

server.listen(PORT, () => {
  console.log(`Arbitra AI Judge API listening on http://localhost:${PORT}`);
});