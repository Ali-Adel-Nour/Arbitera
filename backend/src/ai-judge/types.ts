export interface JudgeInput {
  task: string;
  acceptanceCriteria: string[];
  deliverable: string;
}

export interface JudgeResult {
  approved: boolean;
  verdict: "PASS" | "FAIL";
  reasoning: string;
  /** Audit trace fields are populated by the LLM adapter, not used for judging. */
  evaluationPrompt?: string;
  rawResponse?: string;
  modelId?: string;
  modelVersion?: string;
}

export interface JudgeVerdict {
  approved: boolean;
  verdict: "PASS" | "FAIL";
  reasoning: string;
}
