import type { AuditableVerdict } from "./ai-judge/verdict.js";
import { readPersistedDeals } from "./persistence.js";

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

export async function getReputation(agent: string): Promise<ReputationSummary> {
  const deals = await readPersistedDeals(agent);
  const records = deals.map((deal) => ({
    dealId: deal.dealId,
    approved: deal.aiVerdict ?? false,
    score: deal.aiScore ?? 0,
    verdictHash: deal.verdictHash ?? "",
    timestamp: deal.updatedAt.toISOString(),
    taskCategory: deal.taskCategory ?? undefined,
  }));
  const now = Date.now();
  const weightFor = (timestamp: string): number => {
    const ageDays = Math.max(0, (now - Date.parse(timestamp)) / 86_400_000);
    return Math.exp(-ageDays / 30);
  };
  const weighted = records.reduce(
    (sum, record) => sum + (record.approved ? 1 : 0) * weightFor(record.timestamp),
    0
  );
  const weightTotal = records.reduce((sum, record) => sum + weightFor(record.timestamp), 0);
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
    history: records,
  };
}
