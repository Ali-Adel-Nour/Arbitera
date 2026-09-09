-- CreateTable
CREATE TABLE "EscrowDeal" (
    "dealId" TEXT NOT NULL PRIMARY KEY,
    "buyerAddress" TEXT,
    "sellerAddress" TEXT,
    "criteriaText" TEXT,
    "deliverableText" TEXT,
    "taskCategory" TEXT,
    "deadline" DATETIME,
    "state" TEXT,
    "aiVerdict" BOOLEAN,
    "aiReasoning" TEXT,
    "aiScore" REAL,
    "verdictHash" TEXT,
    "resolvedTxHash" TEXT,
    "evaluationPrompt" TEXT,
    "modelId" TEXT,
    "modelVersion" TEXT,
    "rawLlmResponse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
