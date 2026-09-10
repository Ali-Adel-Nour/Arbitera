export interface ReputationRecord {
  agent: string;
  totalDeals?: number;
  totalJudged: number;
  successes: number;
  failures: number;
  successRate: number;
  failureRate: number;
  recencyWeightedReliability?: number;
  byTaskCategory?: Record<string, unknown>;
  history?: unknown[];
  settlementHistory?: unknown[];
  source: "graph" | "backend";
  sourceReason?: "graph" | "graph_not_configured" | "graph_empty" | "graph_unavailable" | "graph_invalid";
}

export interface IndexedDeal {
  dealId: string;
  buyer: string;
  seller: string;
  token: string;
  amount: string;
  criteriaHash: string;
  deadline: string;
  state: string;
  deliverableHash?: string;
  approved?: boolean;
  createdTransactionHash: string;
  createdBlockNumber: string;
  submittedTransactionHash?: string;
  submittedBlockNumber?: string;
  resolvedTransactionHash?: string;
  resolvedBlockNumber?: string;
  verdictReasoningHash?: string;
  createdAt?: string;
  updatedAt?: string;
  source: "graph" | "backend";
}

interface GraphDeal {
  id?: unknown; dealId?: unknown; buyer?: unknown; seller?: unknown; token?: unknown;
  amount?: unknown; criteriaHash?: unknown; deadline?: unknown; state?: unknown;
  deliverableHash?: unknown; approved?: unknown; createdTransactionHash?: unknown;
  createdBlockNumber?: unknown; submittedTransactionHash?: unknown; submittedBlockNumber?: unknown;
  resolvedTransactionHash?: unknown; resolvedBlockNumber?: unknown; verdictReasoningHash?: unknown;
  createdAt?: unknown; updatedAt?: unknown;
}
interface GraphResponse { data?: { escrows?: unknown[]; escrow?: unknown }; errors?: unknown[] }

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Graph field ${field} is invalid`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  return asString(value, field);
}

function mapDeal(value: unknown): IndexedDeal {
  if (!value || typeof value !== "object") throw new Error("Graph deal is invalid");
  const deal = value as GraphDeal;
  return {
    dealId: asString(deal.dealId ?? deal.id, "dealId"),
    buyer: asString(deal.buyer, "buyer"), seller: asString(deal.seller, "seller"),
    token: asString(deal.token, "token"), amount: asString(deal.amount, "amount"),
    criteriaHash: asString(deal.criteriaHash, "criteriaHash"), deadline: asString(deal.deadline, "deadline"),
    state: asString(deal.state, "state"),
    deliverableHash: optionalString(deal.deliverableHash, "deliverableHash"),
    approved: deal.approved === null || deal.approved === undefined ? undefined : Boolean(deal.approved),
    createdTransactionHash: asString(deal.createdTransactionHash, "createdTransactionHash"),
    createdBlockNumber: asString(deal.createdBlockNumber, "createdBlockNumber"),
    submittedTransactionHash: optionalString(deal.submittedTransactionHash, "submittedTransactionHash"),
    submittedBlockNumber: optionalString(deal.submittedBlockNumber, "submittedBlockNumber"),
    resolvedTransactionHash: optionalString(deal.resolvedTransactionHash, "resolvedTransactionHash"),
    resolvedBlockNumber: optionalString(deal.resolvedBlockNumber, "resolvedBlockNumber"),
    verdictReasoningHash: optionalString(deal.verdictReasoningHash, "verdictReasoningHash"),
    createdAt: optionalString(deal.createdAt, "createdAt"),
    updatedAt: optionalString(deal.updatedAt, "updatedAt"),
    source: "graph",
  };
}

export class GraphAdapter {
  constructor(private readonly endpoint: string, private readonly apiKey?: string) {}

  private async query(query: string, variables: Record<string, unknown>): Promise<GraphResponse> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`Graph request failed: ${response.status}`);
    const data = await response.json() as GraphResponse;
    if (data.errors?.length || !data.data) throw new Error("Graph returned an invalid response");
    return data;
  }

  async getDeals(agent?: string): Promise<IndexedDeal[]> {
    const query = agent ? `query Escrows($seller: Bytes!) {
      escrows(where: { seller: $seller }, orderBy: createdBlockNumber, orderDirection: asc) {
        id dealId buyer seller token amount criteriaHash deadline state deliverableHash approved verdictReasoningHash
        createdTransactionHash createdBlockNumber submittedTransactionHash submittedBlockNumber
        resolvedTransactionHash resolvedBlockNumber createdAt updatedAt
      }
    }` : `query Escrows {
      escrows(orderBy: createdBlockNumber, orderDirection: asc) {
        id dealId buyer seller token amount criteriaHash deadline state deliverableHash approved
        verdictReasoningHash createdTransactionHash createdBlockNumber submittedTransactionHash submittedBlockNumber
        resolvedTransactionHash resolvedBlockNumber createdAt updatedAt
      }
    }`;
    const result = await this.query(query, agent ? { seller: agent.toLowerCase() } : {});
    if (!Array.isArray(result.data?.escrows)) throw new Error("Graph returned an invalid escrow list");
    return result.data.escrows.map(mapDeal);
  }

  async getDeal(dealId: string): Promise<IndexedDeal | null> {
    const result = await this.query(`query Escrow($id: ID!) {
      escrow(id: $id) {
        id dealId buyer seller token amount criteriaHash deadline state deliverableHash approved verdictReasoningHash
        createdTransactionHash createdBlockNumber submittedTransactionHash submittedBlockNumber
        resolvedTransactionHash resolvedBlockNumber createdAt updatedAt
      }
    }`, { id: dealId.toLowerCase() });
    if (result.data?.escrow === null || result.data?.escrow === undefined) return null;
    return mapDeal(result.data.escrow);
  }

  async getReputation(agent: string): Promise<ReputationRecord> {
    const history = await this.getDeals(agent);
    if (history.length === 0) throw new Error("Graph returned no escrow history");
    const settled = history.filter((deal) => deal.approved !== undefined);
    const successes = settled.filter((deal) => deal.approved).length;
    const totalJudged = settled.length;
    const now = Date.now();
    const weightFor = (deal: IndexedDeal): number => {
      const timestamp = deal.updatedAt ?? deal.createdAt;
      if (!timestamp) return 1;
      const ageDays = Math.max(0, (now - Number(timestamp) * 1000) / 86_400_000);
      return Math.exp(-ageDays / 30);
    };
    const weightedTotal = settled.reduce((sum, deal) => sum + weightFor(deal), 0);
    const weightedSuccesses = settled.reduce((sum, deal) => sum + (deal.approved ? weightFor(deal) : 0), 0);
    return { agent, totalDeals: history.length, totalJudged, successes, failures: totalJudged - successes,
      successRate: totalJudged ? successes / totalJudged : 0,
      failureRate: totalJudged ? (totalJudged - successes) / totalJudged : 0,
      recencyWeightedReliability: weightedTotal ? weightedSuccesses / weightedTotal : 0,
      history, settlementHistory: settled, source: "graph", sourceReason: "graph" };
  }
}

export class ArbiteraDataService {
  private readonly graph?: GraphAdapter;
  constructor(
    private readonly backendUrl = process.env.ARBITRA_BACKEND_URL ?? "http://localhost:3000",
    graphEndpoint = process.env.GRAPH_ENDPOINT,
    graphApiKey = process.env.GRAPH_API_KEY,
  ) { if (graphEndpoint?.trim()) this.graph = new GraphAdapter(graphEndpoint, graphApiKey); }

  async getReputation(agent: string): Promise<ReputationRecord> {
    let sourceReason: ReputationRecord["sourceReason"] = this.graph ? "graph_unavailable" : "graph_not_configured";
    if (this.graph) {
      try { return await this.graph.getReputation(agent); }
      catch (error) {
        if (error instanceof Error && error.message.includes("no escrow history")) sourceReason = "graph_empty";
        else if (error instanceof TypeError || (error instanceof Error && error.message.includes("Graph request failed"))) sourceReason = "graph_unavailable";
        else sourceReason = "graph_invalid";
      }
    }
    const response = await fetch(`${this.backendUrl}/api/reputation/${encodeURIComponent(agent)}`);
    if (!response.ok) throw new Error(`Backend reputation request failed: ${response.status}`);
    const data = await response.json() as Omit<ReputationRecord, "source">;
    return { ...data, source: "backend", sourceReason };
  }

  async getIndexedDeal(dealId: string): Promise<IndexedDeal | null> {
    if (!this.graph) return null;
    return this.graph.getDeal(dealId);
  }

  async getAudit(dealId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.backendUrl}/api/judgments/${encodeURIComponent(dealId)}`);
    if (!response.ok) throw new Error(`Backend audit request failed: ${response.status}`);
    const data = await response.json() as Record<string, unknown>;
    return { ...data, source: "backend" };
  }

  async getDeal(dealId: string): Promise<IndexedDeal | Record<string, unknown>> {
    try {
      const deal = await this.getIndexedDeal(dealId);
      if (deal) return deal;
    } catch { /* explicit backend fallback below */ }
    return this.getAudit(dealId);
  }
}
