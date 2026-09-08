import { readFile } from "node:fs/promises";

import type { AuditableVerdict } from "./ai-judge/verdict.js";

export interface ReputationSummary {
  agent: string;
  totalJudged: number;
  successes: number;
  failures: number;
  successRate: number;
  failureRate: number;
  recencyWeightedReliability: number;
  byTaskCategory: Record<string, { total: number; successes: number; successRate: number }>;
  history: Array<Pick<AuditableVerdict, "dealId" | "approved" | "score" | "verdictHash" | "timestamp" | "taskCategory">>;
}

async function readVerdicts(): Promise<AuditableVerdict[]> {
  const filePath = process.env.VERDICT_STORE_PATH ?? "backend/data/verdicts.jsonl";

  try {
    const contents = await readFile(filePath, "utf8");
    return contents
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditableVerdict);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function getReputation(agent: string): Promise<ReputationSummary> {
  const records = (await readVerdicts()).filter((record) => record.seller === agent);
  const now = Date.now();
  const weighted = records.reduce((sum, record) => {
    const ageDays = Math.max(0, (now - Date.parse(record.timestamp)) / 86_400_000);
    return sum + (record.approved ? 1 : 0) * Math.exp(-ageDays / 30);
  }, 0);
  const weightTotal = records.reduce((sum, record) => {
    const ageDays = Math.max(0, (now - Date.parse(record.timestamp)) / 86_400_000);
    return sum + Math.exp(-ageDays / 30);
  }, 0);
  const categories: ReputationSummary["byTaskCategory"] = {};

  for (const record of records) {
    const category = record.taskCategory ?? "uncategorized";
    const current = categories[category] ?? { total: 0, successes: 0, successRate: 0 };
    current.total += 1;
    current.successes += record.approved ? 1 : 0;
    current.successRate = current.successes / current.total;
    categories[category] = current;
  }

  const total = records.length;
  const successes = records.filter((record) => record.approved).length;
  return {
    agent,
    totalJudged: total,
    successes,
    failures: total - successes,
    successRate: total ? successes / total : 0,
    failureRate: total ? (total - successes) / total : 0,
    recencyWeightedReliability: weightTotal ? weighted / weightTotal : 0,
    byTaskCategory: categories,
    history: records.map(({ dealId, approved, score, verdictHash, timestamp, taskCategory }) =>
      ({ dealId, approved, score, verdictHash, timestamp, taskCategory }))
  };
}
