import type { JudgeInput, JudgeResult } from "./types.js";
import { buildJudgePrompt } from "./prompt.js";

function parseJudgeResponse(raw: string): JudgeResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Judge returned invalid JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("approved" in parsed) ||
    !("verdict" in parsed) ||
    !("reasoning" in parsed)
  ) {
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
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
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
    }),
  });

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
