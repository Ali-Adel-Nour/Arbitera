/**
 * Graph Intelligence — AI-powered reasoning over live Graph data.
 *
 * This is the load-bearing AI layer that transforms raw subgraph data into
 * actionable intelligence: risk assessments, verdict verification, and market
 * insights. Uses an OpenAI-compatible LLM (Gemini via the same gateway the
 * backend AI Judge already uses).
 */

import { GraphMCPClient, KNOWN_SUBGRAPHS } from "./graph-mcp-client.js";
import type { ArbiteraDataService, IndexedDeal, ReputationRecord } from "./data-service.js";

// ── LLM helper ──────────────────────────────────────────────────────────────

interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

async function callLLM(config: LLMConfig, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`LLM request failed: ${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response");
  return content;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface RiskAssessment {
  wallet: string;
  riskLevel: string;
  summary: string;
  escrowHistory: {
    totalDeals: number;
    successRate: number;
    source: string;
  };
  defiActivity: Record<string, unknown>;
  reasoning: string;
  queriedAt: string;
  dataSources: string[];
}

export interface VerdictVerification {
  dealId: string;
  onChainState: string;
  deliverableSubmitted: boolean;
  deadlineMet: boolean | null;
  hashMatch: boolean | null;
  verificationSummary: string;
  queriedAt: string;
  dataSources: string[];
}

export interface MarketInsights {
  summary: string;
  escrowStats: Record<string, unknown>;
  defiContext: Record<string, unknown>;
  reasoning: string;
  queriedAt: string;
  dataSources: string[];
}

// ── Intelligence Engine ─────────────────────────────────────────────────────

export class GraphIntelligence {
  private readonly graphClient: GraphMCPClient;
  private readonly llmConfig: LLMConfig;

  constructor(
    private readonly dataService: ArbiteraDataService,
    graphApiKey: string,
    llmApiKey: string,
    llmBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai",
    llmModel = "gemini-2.5-flash",
  ) {
    this.graphClient = new GraphMCPClient(graphApiKey);
    this.llmConfig = { apiKey: llmApiKey, baseUrl: llmBaseUrl, model: llmModel };
  }

  // ── 1. Pre-Hire Risk Assessment ─────────────────────────────────────────

  async assessSellerRisk(sellerWallet: string): Promise<RiskAssessment> {
    const dataSources: string[] = [];
    const wallet = sellerWallet.toLowerCase();

    // 1a. Get escrow reputation from Arbitra (backend + optional Graph)
    let reputation: ReputationRecord | null = null;
    try {
      reputation = await this.dataService.getReputation(wallet);
      dataSources.push(`arbitra-reputation (source: ${reputation.source})`);
    } catch {
      // No reputation data available — that's fine, it's a new seller
    }

    // 1b. Query DeFi activity across The Graph Network
    let defiActivity: Record<string, unknown> = {};
    try {
      defiActivity = await this.graphClient.queryWalletDeFiActivity(wallet);
      dataSources.push("the-graph:uniswap-v3", "the-graph:aave-v3");
    } catch {
      defiActivity = { error: "DeFi activity unavailable" };
    }

    // 1c. Synthesize with LLM
    const escrowHistory = reputation
      ? { totalDeals: reputation.totalDeals ?? 0, successRate: reputation.successRate, source: reputation.source }
      : { totalDeals: 0, successRate: 0, source: "none" };

    const reasoning = await callLLM(this.llmConfig,
      `You are a blockchain risk analyst for an AI escrow protocol called Arbitra.
Your job is to assess the risk of hiring a seller based on their on-chain history.
Produce a concise risk assessment with a risk level (LOW, MEDIUM, HIGH, UNKNOWN).
Be specific about what data you observed and what it implies.`,
      `Assess the risk of hiring seller wallet: ${wallet}

ESCROW HISTORY (from Arbitra):
${JSON.stringify(escrowHistory, null, 2)}

DEFI ACTIVITY (from The Graph — Uniswap, Aave):
${JSON.stringify(defiActivity, null, 2)}

Provide:
1. Risk level (LOW / MEDIUM / HIGH / UNKNOWN)
2. A 2-3 sentence summary
3. Detailed reasoning citing specific data points`
    );

    // Extract risk level from LLM response
    const riskMatch = reasoning.match(/\b(LOW|MEDIUM|HIGH|UNKNOWN)\b/i);
    const riskLevel = riskMatch ? riskMatch[1].toUpperCase() : "UNKNOWN";

    return {
      wallet,
      riskLevel,
      summary: reasoning.split("\n").find(l => l.trim().length > 20) ?? reasoning.slice(0, 200),
      escrowHistory,
      defiActivity,
      reasoning,
      queriedAt: new Date().toISOString(),
      dataSources,
    };
  }

  // ── 2. Verdict Cross-Verification ───────────────────────────────────────

  async verifyVerdictOnchain(dealId: string): Promise<VerdictVerification> {
    const dataSources: string[] = [];

    // 2a. Get on-chain deal from Graph / backend
    let deal: IndexedDeal | Record<string, unknown> | null = null;
    try {
      deal = await this.dataService.getDeal(dealId);
      dataSources.push(`arbitra-deal (source: ${(deal as { source?: string }).source ?? "unknown"})`);
    } catch {
      // Fall through with null
    }

    // 2b. Get off-chain verdict from backend
    let audit: Record<string, unknown> = {};
    try {
      audit = await this.dataService.getAudit(dealId);
      dataSources.push("arbitra-backend-audit");
    } catch {
      // Audit not available
    }

    if (!deal) {
      return {
        dealId,
        onChainState: "NOT_FOUND",
        deliverableSubmitted: false,
        deadlineMet: null,
        hashMatch: null,
        verificationSummary: `Deal ${dealId} was not found in any data source.`,
        queriedAt: new Date().toISOString(),
        dataSources,
      };
    }

    const dealRecord = deal as Record<string, unknown>;
    const state = String(dealRecord.state ?? "unknown");
    const deliverableSubmitted = !!dealRecord.deliverableHash || !!dealRecord.submittedTransactionHash;

    // Check deadline
    let deadlineMet: boolean | null = null;
    if (dealRecord.deadline && dealRecord.submittedBlockNumber) {
      // If submitted block exists, deliverable was submitted before expiry
      deadlineMet = true;
    } else if (state === "ExpiredRefund") {
      deadlineMet = false;
    }

    // Check verdict hash match
    let hashMatch: boolean | null = null;
    const onChainHash = dealRecord.verdictReasoningHash;
    const offChainHash = audit.verdictHash;
    if (onChainHash && offChainHash) {
      hashMatch = String(onChainHash) === String(offChainHash);
      dataSources.push("hash-cross-check");
    }

    // Synthesize
    const verificationSummary = await callLLM(this.llmConfig,
      `You are a blockchain verification specialist for the Arbitra escrow protocol.
Produce a concise verification report for a deal, checking that the on-chain state
matches the off-chain AI Judge verdict.`,
      `Verify deal: ${dealId}

ON-CHAIN STATE: ${state}
DELIVERABLE SUBMITTED: ${deliverableSubmitted}
DEADLINE MET: ${deadlineMet ?? "unknown"}
VERDICT HASH MATCH: ${hashMatch ?? "no hashes to compare"}

ON-CHAIN RECORD:
${JSON.stringify(dealRecord, null, 2)}

OFF-CHAIN AUDIT:
${JSON.stringify(audit, null, 2)}

Write a 2-4 sentence verification summary. State whether the verdict is VERIFIED, MISMATCH, or INCONCLUSIVE.`
    );

    return {
      dealId,
      onChainState: state,
      deliverableSubmitted,
      deadlineMet,
      hashMatch,
      verificationSummary,
      queriedAt: new Date().toISOString(),
      dataSources,
    };
  }

  // ── 3. Escrow Market Intelligence ───────────────────────────────────────

  async getMarketInsights(query?: string): Promise<MarketInsights> {
    const dataSources: string[] = [];

    // 3a. Get Arbitra escrow stats
    let escrowStats: Record<string, unknown> = {};
    try {
      // Query the Graph adapter for all deals (if available), else hit backend
      const graphEndpoint = process.env.GRAPH_ENDPOINT;
      if (graphEndpoint?.trim()) {
        const graphAdapter = new (await import("./data-service.js")).GraphAdapter(
          graphEndpoint,
          process.env.GRAPH_API_KEY,
        );
        const deals = await graphAdapter.getDeals();
        const totalDeals = deals.length;
        const resolved = deals.filter(d => d.state?.startsWith("Resolved"));
        const funded = deals.filter(d => d.state === "Funded");
        const submitted = deals.filter(d => d.state === "Submitted");
        const approved = deals.filter(d => d.approved === true);
        escrowStats = {
          totalDeals,
          funded: funded.length,
          submitted: submitted.length,
          resolved: resolved.length,
          approvalRate: resolved.length > 0 ? approved.length / resolved.length : 0,
        };
        dataSources.push("arbitra-subgraph");
      }
    } catch {
      escrowStats = { note: "Arbitra subgraph stats unavailable" };
    }

    // 3b. Get DeFi context from The Graph Network
    let defiContext: Record<string, unknown> = {};
    try {
      // Query Uniswap for recent global activity
      const uniResult = await this.graphClient.executeQuery(
        KNOWN_SUBGRAPHS.UNISWAP_V3_ETH,
        `{ factories(first: 1) { txCount totalVolumeUSD totalFeesUSD poolCount } }`,
      );
      defiContext.uniswapV3 = uniResult.data?.factories;
      dataSources.push("the-graph:uniswap-v3-global");
    } catch {
      defiContext.uniswapV3 = { error: "unavailable" };
    }

    // 3c. Synthesize with LLM
    const userQuery = query?.trim() || "Provide a market overview of the escrow ecosystem and broader DeFi context.";
    const reasoning = await callLLM(this.llmConfig,
      `You are an AI market analyst for Arbitra, a decentralized AI-judged escrow protocol.
Analyze the provided data and answer the user's question with specific numbers and insights.
Cross-reference escrow data with broader DeFi metrics when relevant.`,
      `USER QUESTION: ${userQuery}

ARBITRA ESCROW STATS:
${JSON.stringify(escrowStats, null, 2)}

DEFI MARKET CONTEXT (from The Graph Network):
${JSON.stringify(defiContext, null, 2)}

Provide a clear, data-driven market analysis.`,
    );

    return {
      summary: reasoning,
      escrowStats,
      defiContext,
      reasoning,
      queriedAt: new Date().toISOString(),
      dataSources,
    };
  }

  // ── 4. Search DeFi Subgraphs ────────────────────────────────────────────

  async searchSubgraphs(keyword: string): Promise<{ results: SubgraphSearchResult[]; summary: string }> {
    const results = await this.graphClient.searchSubgraphs(keyword);
    const summary = results.length > 0
      ? `Found ${results.length} subgraphs matching "${keyword}": ${results.slice(0, 5).map(r => r.displayName).join(", ")}${results.length > 5 ? ` and ${results.length - 5} more` : ""}`
      : `No subgraphs found matching "${keyword}"`;
    return { results, summary };
  }

  // ── 5. Query Wallet Activity ────────────────────────────────────────────

  async queryWalletActivity(wallet: string): Promise<{ activity: Record<string, unknown>; summary: string }> {
    const activity = await this.graphClient.queryWalletDeFiActivity(wallet);
    const summary = await callLLM(this.llmConfig,
      `You are a blockchain analyst. Summarize a wallet's DeFi activity in 2-3 sentences.`,
      `Wallet: ${wallet}\nActivity data:\n${JSON.stringify(activity, null, 2)}`,
    );
    return { activity, summary };
  }
}

// Re-export for convenience
type SubgraphSearchResult = import("./graph-mcp-client.js").SubgraphSearchResult;
