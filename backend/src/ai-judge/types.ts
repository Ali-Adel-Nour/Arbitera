export interface JudgeInput {
  task: string;
  acceptanceCriteria: string[];
  deliverable: string;
}

export interface JudgeResult {
  approved: boolean;
  verdict: "PASS" | "FAIL";
  reasoning: string;
}