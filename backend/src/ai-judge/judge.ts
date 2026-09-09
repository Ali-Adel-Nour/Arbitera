import type { JudgeInput, JudgeResult, JudgeVerdict } from "./types.js";
import { buildJudgePrompt } from "./prompt.js";

export const JUDGE_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "verdict", "reasoning"],
  properties: {
    approved: { type: "boolean" },
    verdict: { type: "string", enum: ["PASS", "FAIL"] },
    reasoning: { type: "string" },
  },
} as const;

function findJsonObject(raw: string): unknown {
  const text = raw.trim();

  try {
    return JSON.parse(text);
  } catch {
    // Providers occasionally add Markdown or a short explanation despite the
    // structured-output instruction. Continue with a balanced-object scan.
  }

  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, index + 1));
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("Judge returned invalid JSON");
}

export function parseJudgeResponse(raw: string): JudgeVerdict {
  const parsed = findJsonObject(raw);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("approved" in parsed) ||
    !("verdict" in parsed) ||
    !("reasoning" in parsed)
  ) {
    throw new Error("Judge response has an invalid schema");
  }

  const allowedFields = new Set(["approved", "verdict", "reasoning"]);
  if (Object.keys(parsed).some((field) => !allowedFields.has(field))) {
    throw new Error("Judge response has an invalid schema");
  }

  const result = parsed as {
    approved: unknown;
    verdict: unknown;
    reasoning: unknown;
  };

  if (
    typeof result.approved !== "boolean" ||
    (result.verdict !== "PASS" && result.verdict !== "FAIL") ||
    typeof result.reasoning !== "string"
  ) {
    throw new Error("Judge response has invalid field types");
  }

  if (
    (result.approved && result.verdict !== "PASS") ||
    (!result.approved && result.verdict !== "FAIL")
  ) {
    throw new Error(
      "Judge response verdict does not match approved flag"
    );
  }

  return {
    approved: result.approved,
    verdict: result.verdict,
    reasoning: result.reasoning,
  };
}

export async function judgeDeliverable(
  input: JudgeInput
): Promise<JudgeResult> {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl =
    process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const modelVersion = process.env.LLM_MODEL_VERSION ?? model;

  if (!apiKey) {
    throw new Error("Missing LLM_API_KEY");
  }

  const evaluationPrompt = buildJudgePrompt(
    input.task,
    input.acceptanceCriteria,
    input.deliverable
  );
  const requestBody = {
    model,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "judge_verdict",
        strict: true,
        schema: JUDGE_RESPONSE_SCHEMA,
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You are an impartial AI escrow judge. Follow the evaluation rules exactly.",
      },
      {
        role: "user",
        content: evaluationPrompt,
      },
    ],
  };

  let response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  // Some older OpenAI-compatible gateways reject response_format even though
  // they otherwise implement the chat-completions API. Preserve compatibility
  // while still preferring structured output whenever the provider supports it.
  if (response.status === 400) {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...requestBody,
        response_format: undefined,
      }),
    });
  }

  if (!response.ok) {
    throw new Error(
      `LLM request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("LLM returned an empty response");
  }

  return {
    ...parseJudgeResponse(content),
    evaluationPrompt,
    rawResponse: content,
    modelId: model,
    modelVersion,
  };
}
