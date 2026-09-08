export { judgeDeliverable } from "./judge.js";
export { buildJudgePrompt } from "./prompt.js";
export {
  buildVerdict,
  evaluateDeal,
  normalizeDeadline,
} from "./verdict.js";

export type {
  JudgeInput,
  JudgeResult,
} from "./types.js";
export type {
  AuditableVerdict,
  DealJudgeInput,
} from "./verdict.js";
