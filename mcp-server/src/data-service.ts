export interface ReputationRecord {
  agent: string;
  totalJudged: number;
  successes: number;
  failures: number;
  successRate: number;
  failureRate: number;
  recencyWeightedReliability?: number;
  byTaskCategory?: Record<string, unknown>;
  history?: unknown[];
  source: "graph" | "backend";
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
  source: "graph" | "backend";
}

interface GraphDeal {
  id?: unknown; dealId?: unknown; buyer?: unknown; seller?: unknown; token?: unknown;
  amount?: unknown; criteriaHash?: unknown; deadline?: unknown; state?: unknown;
  deliverableHash?: unknown; approved?: unknown; createdTransactionHash?: unknown;
  createdBlockNumber?: unknown; submittedTransactionHash?: unknown; submittedBlockNumber?: unknown;
  resolvedTransactionHash?: unknown; resolvedBlockNumber?: unknown;
}
interface GraphResponse { data?: { escrows?: unknown[] }; errors?: unknown[] }

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Graph field ${field} is invalid`);
  return value;
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
    deliverableHash: deal.deliverableHash === undefined ? undefined : asString(deal.deliverableHash, "deliverableHash"),
    approved: deal.approved === undefined ? undefined : Boolean(deal.approved),
    createdTransactionHash: asString(deal.createdTransactionHash, "createdTransactionHash"),
    createdBlockNumber: asString(deal.createdBlockNumber, "createdBlockNumber"),
    submittedTransactionHash: deal.submittedTransactionHash === undefined ? undefined : asString(deal.submittedTransactionHash, "submittedTransactionHash"),
    submittedBlockNumber: deal.submittedBlockNumber === undefined ? undefined : asString(deal.submittedBlockNumber, "submittedBlockNumber"),
    resolvedTransactionHash: deal.resolvedTransactionHash === undefined ? undefined : asString(deal.resolvedTransactionHash, "resolvedTransactionHash"),
    resolvedBlockNumber: deal.resolvedBlockNumber === undefined ? undefined : asString(deal.resolvedBlockNumber, "resolvedBlockNumber"),
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
    if (data.errors?.length || !data.data || !Array.isArray(data.data.escrows)) throw new Error("Graph returned an invalid or empty response");
    return data;
  }

  async getDeals(agent?: string): Promise<IndexedDeal[]> {
    const result = await this.query(`query Escrows($seller: Bytes) {
      escrows(where: { seller: $seller }, orderBy: createdBlockNumber, orderDirection: asc) {
        id dealId buyer seller token amount criteriaHash deadline state deliverableHash approved
        createdTransactionHash createdBlockNumber submittedTransactionHash submittedBlockNumber
        resolvedTransactionHash resolvedBlockNumber
      }
    }`, { seller: agent?.toLowerCase() });
    return result.data!.escrows!.map(mapDeal);
  }

  async getReputation(agent: string): Promise<ReputationRecord> {
    const history = await this.getDeals(agent);
    if (history.length === 0) throw new Error("Graph returned no escrow history");
    const settled = history.filter((deal) => deal.approved !== undefined);
    const successes = settled.filter((deal) => deal.approved).length;
    const totalJudged = settled.length;
    return { agent, totalJudged, successes, failures: totalJudged - successes,
      successRate: totalJudged ? successes / totalJudged : 0,
      failureRate: totalJudged ? (totalJudged - successes) / totalJudged : 0,
      history, source: "graph" };
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
    if (this.graph) { try { return await this.graph.getReputation(agent); } catch { /* fallback below */ } }
    const response = await fetch(`${this.backendUrl}/api/reputation/${encodeURIComponent(agent)}`);
    const data = await response.json() as Omit<ReputationRecord, "source">;
    return { ...data, source: "backend" };
  }

  async getDeal(dealId: string): Promise<IndexedDeal | Record<string, unknown>> {
    if (this.graph) { try {
      const deals = await this.graph.getDeals();
      const deal = deals.find((item) => item.dealId === dealId || item.dealId.toLowerCase() === dealId.toLowerCase());
      if (deal) return deal;
    } catch { /* fallback below */ } }
    const response = await fetch(`${this.backendUrl}/api/judgments/${encodeURIComponent(dealId)}`);
    const data = await response.json() as Record<string, unknown>;
    return { ...data, source: "backend" };
  }
}
