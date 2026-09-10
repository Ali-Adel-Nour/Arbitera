import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { evaluateDeal } from '../ai-judge/verdict.js';
import { escrowContract, txQueue } from '../blockchain/contractClient.js';

dotenv.config();

export const prisma = new PrismaClient();
export const processedDealsInSession = new Set<string>();

function parseAcceptanceCriteria(criteriaText: string): string[] {
    try {
        const parsed: unknown = JSON.parse(criteriaText);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string' && item.trim())) {
            return parsed;
        }
    } catch {
        // The on-chain criteria field may be a plain hash/string in fallback mode.
    }
    return [criteriaText];
}

// ---------------------------------------------------------------------------
// 2. CORE SETTLEMENT LOGIC (AI Judgment + Canonical Verdict Hash + On-Chain Tx)
// ---------------------------------------------------------------------------
export async function processDealSettlement(dealId: string, deliverableHash: string) {
    if (processedDealsInSession.has(dealId)) {
        return;
    }
    processedDealsInSession.add(dealId);

    console.log(`\n===================================================`);
    console.log(`⚖️  PROCESSING DEAL: ${dealId}`);
    console.log(`===================================================`);

    try {
        // Define the state enum to match the Solidity contract
        enum EscrowState { Created, Funded, Submitted, ResolvedSuccess, ResolvedRefund, ExpiredRefund }

        // Step A: Invariant Check on Smart Contract
        const onChainDeal = await escrowContract.escrows(dealId);
        if (Number(onChainDeal.state) !== EscrowState.Submitted) {
            console.log(`⚠️  Deal ${dealId} is not in 'Submitted' state (State: ${onChainDeal.state}). Skipping.`);
            return;
        }

        // Step B: Fetch Plaintext Content from Database (Prisma)
        const dbDeal = await prisma.escrowDeal.findUnique({
            where: { dealId }
        });

        // Fallback to on-chain hashes if DB record is not yet seeded (hackathon resilience)
        const criteriaText = dbDeal?.criteriaText || onChainDeal.criteriaHash;
        const deliverableText = dbDeal?.deliverableText || deliverableHash;

        console.log(`🔍 Criteria: "${criteriaText.slice(0, 80)}..."`);
        console.log(`📦 Deliverable: "${deliverableText.slice(0, 80)}..."`);

        // Step C: Trigger the AI Judge Engine
        console.log(`🤖 Invoking AI Judge Engine...`);
        const verdict = await evaluateDeal({
            dealId,
            acceptanceCriteria: parseAcceptanceCriteria(criteriaText),
            deliverable: deliverableText,
            deadline: Number(onChainDeal.deadline),
            buyer: onChainDeal.buyer,
            seller: onChainDeal.seller,
        });

        console.log(`⚖️  Judge Verdict: ${verdict.approved ? '✅ APPROVED' : '❌ REJECTED'}`);
        console.log(`📝 Reason: ${verdict.reasoning}`);

        // The canonical verdict hash is also the on-chain audit reference.
        console.log(`🔒 Verdict Hash: ${verdict.verdictHash}`);

        // Step E: Enqueue On-Chain Transaction Execution (Serialized Nonces)
        await txQueue.enqueue(async () => {
            console.log(`⛓️  Submitting resolveEscrow to blockchain...`);
            
            const tx = await escrowContract.resolveEscrow(
                dealId,
                verdict.approved,
                verdict.verdictHash
            );
            console.log(`🚀 Tx Broadcasted: ${tx.hash}. Waiting for block inclusion...`);
            
            const receipt = await tx.wait(1);
            console.log(`🎉 Confirmed in Block #${receipt.blockNumber} (Gas Used: ${receipt.gasUsed.toString()})`);

            // Step F: Update Local Database State
            await prisma.escrowDeal.update({
                where: { dealId },
                data: {
                    state: verdict.approved ? 'ResolvedSuccess' : 'ResolvedRefund',
                    aiVerdict: verdict.approved,
                    aiReasoning: verdict.reasoning,
                    verdictHash: verdict.verdictHash,
                    resolvedTxHash: tx.hash
                }
            }).catch(() => {
                console.log(`ℹ️  Note: Deal record was not registered in PostgreSQL DB.`);
            });
        });

    } catch (error) {
        console.error(`🚨 Failed processing deal ${dealId}:`, error);
        // Remove from memory cache so retry loop can attempt again on next cycle
        processedDealsInSession.delete(dealId);
    }
}
