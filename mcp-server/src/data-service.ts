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

export type GraphSourceReason =
  | "graph"
  | "graph_not_configured"
  | "graph_empty"
  | "graph_unavailable"
  | "graph_invalid";

const DEFAULT_GRAPH_TIMEOUT_MS = 5_000;

export class GraphUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphUnavailableError";
  }
}

export function normalizeIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || /\s/.test(normalized)) {
    throw new Error(`${field} must be a non-empty identifier`);
  }
  return normalized;
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
  if (typeof value !== "string" || !value.trim()) throw new Error(`Graph field ${field} is invalid`);
  return value;
}

function asIntegerString(value: unknown, field: string): string {
  const stringValue = asString(value, field);
  if (!/^\d+$/.test(stringValue)) throw new Error(`Graph field ${field} is invalid`);
  return stringValue;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  return asString(value, field);
}

function optionalIntegerString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  return asIntegerString(value, field);
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`Graph field ${field} is invalid`);
  return value;
}

function mapDeal(value: unknown): IndexedDeal {
  if (!value || typeof value !== "object") throw new Error("Graph deal is invalid");
  const deal = value as GraphDeal;
  return {
    dealId: asString(deal.dealId ?? deal.id, "dealId"),
    buyer: asString(deal.buyer, "buyer"), seller: asString(deal.seller, "seller"),
    token: asString(deal.token, "token"), amount: asIntegerString(deal.amount, "amount"),
    criteriaHash: asString(deal.criteriaHash, "criteriaHash"), deadline: asIntegerString(deal.deadline, "deadline"),
    state: asString(deal.state, "state"),
    deliverableHash: optionalString(deal.deliverableHash, "deliverableHash"),
    approved: optionalBoolean(deal.approved, "approved"),
    createdTransactionHash: asString(deal.createdTransactionHash, "createdTransactionHash"),
    createdBlockNumber: asIntegerString(deal.createdBlockNumber, "createdBlockNumber"),
    submittedTransactionHash: optionalString(deal.submittedTransactionHash, "submittedTransactionHash"),
    submittedBlockNumber: optionalIntegerString(deal.submittedBlockNumber, "submittedBlockNumber"),
    resolvedTransactionHash: optionalString(deal.resolvedTransactionHash, "resolvedTransactionHash"),
    resolvedBlockNumber: optionalIntegerString(deal.resolvedBlockNumber, "resolvedBlockNumber"),
    verdictReasoningHash: optionalString(deal.verdictReasoningHash, "verdictReasoningHash"),
    createdAt: optionalIntegerString(deal.createdAt, "createdAt"),
    updatedAt: optionalIntegerString(deal.updatedAt, "updatedAt"),
    source: "graph",
  };
}

export class GraphAdapter {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
    private readonly timeoutMs = DEFAULT_GRAPH_TIMEOUT_MS,
    private readonly clock: () => number = Date.now,
  ) {}

  private async query(query: string, variables: Record<string, unknown>): Promise<GraphResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!response.ok) throw new GraphUnavailableError(`Graph request failed: ${response.status}`);
      let data: GraphResponse;
      try {
        data = await response.json() as GraphResponse;
      } catch {
        throw new Error("Graph returned invalid JSON");
      }
      if (!data || data.errors?.length || !data.data || typeof data.data !== "object") throw new Error("Graph returned an invalid response");
      return data;
    } catch (error) {
      if (error instanceof GraphUnavailableError || (error instanceof Error && error.message.startsWith("Graph returned"))) throw error;
      const timedOut = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      throw new GraphUnavailableError(`Graph request ${timedOut ? "timed out" : "is unavailable"}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async getDeals(agent?: string): Promise<IndexedDeal[]> {
    const normalizedAgent = agent === undefined ? undefined : normalizeIdentifier(agent, "agent");
    const query = normalizedAgent ? `query Escrows($seller: Bytes!) {
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
    const result = await this.query(query, normalizedAgent ? { seller: normalizedAgent.toLowerCase() } : {});
    if (!Array.isArray(result.data?.escrows)) throw new Error("Graph returned an invalid escrow list");
    return result.data.escrows.map(mapDeal);
  }

  async getDeal(dealId: string): Promise<IndexedDeal | null> {
    const normalizedDealId = normalizeIdentifier(dealId, "dealId");
    const result = await this.query(`query Escrow($id: ID!) {
      escrow(id: $id) {
        id dealId buyer seller token amount criteriaHash deadline state deliverableHash approved verdictReasoningHash
        createdTransactionHash createdBlockNumber submittedTransactionHash submittedBlockNumber
        resolvedTransactionHash resolvedBlockNumber createdAt updatedAt
      }
    }`, { id: normalizedDealId.toLowerCase() });
    if (result.data?.escrow === null || result.data?.escrow === undefined) return null;
    return mapDeal(result.data.escrow);
  }

  async getReputation(agent: string): Promise<ReputationRecord> {
    const normalizedAgent = normalizeIdentifier(agent, "agent");
    const history = await this.getDeals(normalizedAgent);
    if (history.length === 0) throw new Error("Graph returned no escrow history");
    const settled = history.filter((deal) => deal.approved !== undefined);
    const successes = settled.filter((deal) => deal.approved === true).length;
    const totalJudged = settled.length;
    const now = this.clock();
    const weightFor = (deal: IndexedDeal): number => {
      const timestamp = deal.updatedAt ?? deal.createdAt;
      if (!timestamp) return 1;
      const timestampMs = Number(timestamp) * 1000;
      if (!Number.isFinite(timestampMs)) return 1;
      const ageDays = Math.max(0, (now - timestampMs) / 86_400_000);
      const weight = Math.exp(-ageDays / 30);
      return Number.isFinite(weight) && weight >= 0 ? weight : 1;
    };
    const weightedTotal = settled.reduce((sum, deal) => sum + weightFor(deal), 0);
    const weightedSuccesses = settled.reduce((sum, deal) => sum + (deal.approved === true ? weightFor(deal) : 0), 0);
    return { agent: normalizedAgent, totalDeals: history.length, totalJudged, successes, failures: totalJudged - successes,
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
    graphTimeoutMs = DEFAULT_GRAPH_TIMEOUT_MS,
    clock: () => number = Date.now,
  ) { if (graphEndpoint?.trim()) this.graph = new GraphAdapter(graphEndpoint, graphApiKey, graphTimeoutMs, clock); }

  async getReputation(agent: string): Promise<ReputationRecord> {
    const normalizedAgent = normalizeIdentifier(agent, "agent");
    let sourceReason: ReputationRecord["sourceReason"] = this.graph ? "graph_unavailable" : "graph_not_configured";
    if (this.graph) {
      try { return await this.graph.getReputation(normalizedAgent); }
      catch (error) {
        if (error instanceof Error && error.message.includes("no escrow history")) sourceReason = "graph_empty";
        else if (error instanceof GraphUnavailableError || error instanceof TypeError) sourceReason = "graph_unavailable";
        else sourceReason = "graph_invalid";
      }
    }
    const response = await fetch(`${this.backendUrl}/api/reputation/${encodeURIComponent(normalizedAgent)}`);
    if (!response.ok) throw new Error(`Backend reputation request failed: ${response.status}`);
    const data = await response.json() as Omit<ReputationRecord, "source">;
    return { ...data, source: "backend", sourceReason };
  }

  async getIndexedDeal(dealId: string): Promise<IndexedDeal | null> {
    if (!this.graph) return null;
    return this.graph.getDeal(normalizeIdentifier(dealId, "dealId"));
  }

  async getAudit(dealId: string, sourceReason?: GraphSourceReason): Promise<Record<string, unknown>> {
    const normalizedDealId = normalizeIdentifier(dealId, "dealId");
    const response = await fetch(`${this.backendUrl}/api/judgments/${encodeURIComponent(normalizedDealId)}`);
    if (!response.ok) throw new Error(`Backend audit request failed: ${response.status}`);
    const data = await response.json() as Record<string, unknown>;
    return { ...data, source: "backend", ...(sourceReason ? { sourceReason } : {}) };
  }

  async getDeal(dealId: string): Promise<IndexedDeal | Record<string, unknown>> {
    const normalizedDealId = normalizeIdentifier(dealId, "dealId");
    let sourceReason: GraphSourceReason = this.graph ? "graph_unavailable" : "graph_not_configured";
    try {
      const deal = await this.getIndexedDeal(normalizedDealId);
      if (deal) return deal;
      sourceReason = "graph_empty";
    } catch (error) {
      sourceReason = error instanceof GraphUnavailableError ? "graph_unavailable" : "graph_invalid";
    }
    return this.getAudit(normalizedDealId, sourceReason);
  }
}
