import type { EscrowDeal } from "@prisma/client";

import type {
  AuditableVerdict,
  VerifiableVerdictRecord,
} from "./ai-judge/verdict.js";
import { prisma } from "./lib/prisma.js";

export type PersistedDeal = Pick<
  EscrowDeal,
  | "dealId"
  | "buyerAddress"
  | "sellerAddress"
  | "criteriaText"
  | "deliverableText"
  | "taskCategory"
  | "deadline"
  | "state"
  | "aiVerdict"
  | "aiReasoning"
  | "aiScore"
  | "verdictHash"
  | "resolvedTxHash"
  | "evaluationPrompt"
  | "modelId"
  | "modelVersion"
  | "rawLlmResponse"
  | "createdAt"
  | "updatedAt"
>;

export type JudgmentRecord = VerifiableVerdictRecord & {
  timestamp: string;
  state?: string;
  resolvedTxHash?: string;
};

export async function persistVerdict(
  verdict: AuditableVerdict,
  state = "JUDGED"
): Promise<PersistedDeal> {
  return prisma.escrowDeal.upsert({
    where: { dealId: verdict.dealId },
    create: {
      dealId: verdict.dealId,
      buyerAddress: verdict.buyer,
      sellerAddress: verdict.seller,
      criteriaText: JSON.stringify(verdict.acceptanceCriteria),
      deliverableText: verdict.deliverable,
      taskCategory: verdict.taskCategory,
      deadline: new Date(verdict.deadline),
      state,
      aiVerdict: verdict.approved,
      aiReasoning: verdict.reasoning,
      aiScore: verdict.score,
      verdictHash: verdict.verdictHash,
      evaluationPrompt: verdict.evaluationPrompt,
      modelId: verdict.modelId,
      modelVersion: verdict.modelVersion,
      rawLlmResponse: verdict.rawResponse,
    },
    update: {
      buyerAddress: verdict.buyer,
      sellerAddress: verdict.seller,
      criteriaText: JSON.stringify(verdict.acceptanceCriteria),
      deliverableText: verdict.deliverable,
      taskCategory: verdict.taskCategory,
      deadline: new Date(verdict.deadline),
      state,
      aiVerdict: verdict.approved,
      aiReasoning: verdict.reasoning,
      aiScore: verdict.score,
      verdictHash: verdict.verdictHash,
      evaluationPrompt: verdict.evaluationPrompt,
      modelId: verdict.modelId,
      modelVersion: verdict.modelVersion,
      rawLlmResponse: verdict.rawResponse,
    },
  });
}

export async function markDealResolved(
  dealId: string,
  resolvedTxHash: string
): Promise<void> {
  await prisma.escrowDeal.update({
    where: { dealId },
    data: { resolvedTxHash, state: "RESOLVED" },
  });
}

export async function readPersistedDeals(
  sellerAddress: string
): Promise<PersistedDeal[]> {
  return prisma.escrowDeal.findMany({
    where: { sellerAddress, aiVerdict: { not: null } },
    orderBy: { createdAt: "asc" },
  });
}

function parseAcceptanceCriteria(criteriaText: string | null): string[] {
  if (!criteriaText) return [];

  try {
    const parsed: unknown = JSON.parse(criteriaText);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export async function readPersistedJudgment(
  dealId: string
): Promise<JudgmentRecord | null> {
  const deal = await prisma.escrowDeal.findUnique({ where: { dealId } });
  if (
    !deal ||
    deal.aiVerdict === null ||
    deal.aiReasoning === null ||
    deal.aiScore === null ||
    deal.verdictHash === null ||
    deal.evaluationPrompt === null ||
    deal.modelId === null ||
    deal.modelVersion === null ||
    deal.rawLlmResponse === null ||
    deal.deliverableText === null ||
    deal.deadline === null
  ) {
    return null;
  }

  const acceptanceCriteria = parseAcceptanceCriteria(deal.criteriaText);
  return {
    dealId: deal.dealId,
    buyer: deal.buyerAddress ?? undefined,
    seller: deal.sellerAddress ?? undefined,
    taskCategory: deal.taskCategory ?? undefined,
    deadline: deal.deadline.toISOString(),
    acceptanceCriteria,
    deliverable: deal.deliverableText,
    approved: deal.aiVerdict,
    score: deal.aiScore,
    reasoning: deal.aiReasoning,
    verdict: deal.aiVerdict ? "PASS" : "FAIL",
    modelId: deal.modelId,
    modelVersion: deal.modelVersion,
    evaluationPrompt: deal.evaluationPrompt,
    rawResponse: deal.rawLlmResponse,
    verdictHash: deal.verdictHash,
    timestamp: deal.updatedAt.toISOString(),
    state: deal.state ?? undefined,
    resolvedTxHash: deal.resolvedTxHash ?? undefined,
  };
}
