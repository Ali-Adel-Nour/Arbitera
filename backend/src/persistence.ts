import type { EscrowDeal } from "@prisma/client";

import type { AuditableVerdict } from "./ai-judge/verdict.js";
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
    where: { sellerAddress },
    orderBy: { createdAt: "asc" },
  });
}
