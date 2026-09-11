/**
 * Graph MCP Client — wraps The Graph's Subgraph MCP tools to query 15K+ live
 * subgraphs on the decentralized network via a Subgraph Studio Gateway API key.
 *
 * Instead of spawning the official Subgraph MCP as a child process, this module
 * re-implements the same GraphQL gateway calls directly so the Arbitra MCP
 * server stays self-contained and easy to deploy.
 */

// ── Well-known subgraph deployment IDs for DeFi intelligence ────────────────
export const KNOWN_SUBGRAPHS = {
  /** Uniswap v3 on Ethereum mainnet */
  UNISWAP_V3_ETH: "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
  /** Aave v3 on Ethereum mainnet */
  AAVE_V3_ETH: "Cd2gEDVeqnjBn1hSeqFMitw8Q1iiyV9FYUZkLNRcL87g",
  /** Compound v3 on Ethereum mainnet */
  COMPOUND_V3_ETH: "6TmAFX7Bam5mKHHQ68vUWP8QyveojEoRqDpXFrYfsscQ",
  /** ENS on Ethereum mainnet */
  ENS_ETH: "5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5Qihv",
} as const;

const GATEWAY_BASE = "https://gateway.thegraph.com";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface SubgraphSearchResult {
  id: string;
  displayName: string;
  description?: string;
  network?: string;
  deploymentId?: string;
  currentSignalledTokens?: string;
  queryCount?: string;
}

export interface SubgraphSchema {
  deploymentId: string;
  schema: string;
}

export interface GraphQueryResult {
  data: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

/**
 * Client for querying The Graph's decentralized network.
 * Uses the same gateway that the official Subgraph MCP calls under the hood.
 */
export class GraphMCPClient {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!apiKey?.trim()) throw new Error("GRAPH_API_KEY is required for Subgraph Studio gateway access");
  }

  // ── Core: Execute a GraphQL query against any subgraph ──────────────────

  async executeQuery(deploymentId: string, query: string, variables: Record<string, unknown> = {}): Promise<GraphQueryResult> {
    const url = `${GATEWAY_BASE}/api/subgraphs/id/${deploymentId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Graph gateway error ${response.status}: ${body.slice(0, 200)}`);
      }
      const result = await response.json() as GraphQueryResult;
      if (result.errors?.length) {
        throw new Error(`GraphQL error: ${result.errors.map(e => e.message).join("; ")}`);
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Search subgraphs by keyword ─────────────────────────────────────────

  async searchSubgraphs(keyword: string, first = 10): Promise<SubgraphSearchResult[]> {
    // The Graph Network subgraph indexes all deployed subgraphs
    const NETWORK_SUBGRAPH = "https://gateway.thegraph.com/api/subgraphs/id/DZz4kDTdmzWLWsV373w2bSmoar3umKKH9y82SUKr5t6t";
    const query = `query SearchSubgraphs($text: String!, $first: Int!) {
      subgraphs(
        first: $first,
        where: { displayName_contains_nocase: $text, active: true }
        orderBy: currentSignalledTokens
        orderDirection: desc
      ) {
        id
        displayName
        description
        currentSignalledTokens
        currentVersion {
          subgraphDeployment {
            id
            network { id }
          }
        }
      }
    }`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(NETWORK_SUBGRAPH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query, variables: { text: keyword, first } }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Network subgraph error: ${response.status}`);
      const result = await response.json() as { data?: { subgraphs?: Array<Record<string, unknown>> }; errors?: Array<{ message: string }> };
      if (result.errors?.length) throw new Error(`Search error: ${result.errors[0].message}`);
      const subgraphs = result.data?.subgraphs ?? [];
      return subgraphs.map((sg: Record<string, unknown>) => ({
        id: String(sg.id ?? ""),
        displayName: String(sg.displayName ?? ""),
        description: sg.description ? String(sg.description) : undefined,
        currentSignalledTokens: sg.currentSignalledTokens ? String(sg.currentSignalledTokens) : undefined,
        network: (sg.currentVersion as Record<string, unknown>)?.subgraphDeployment
          ? String(((sg.currentVersion as Record<string, unknown>).subgraphDeployment as Record<string, unknown>)?.network
            ? (((sg.currentVersion as Record<string, unknown>).subgraphDeployment as Record<string, unknown>).network as Record<string, unknown>).id
            : "")
          : undefined,
        deploymentId: (sg.currentVersion as Record<string, unknown>)?.subgraphDeployment
          ? String(((sg.currentVersion as Record<string, unknown>).subgraphDeployment as Record<string, unknown>)?.id ?? "")
          : undefined,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Introspect a subgraph's schema ──────────────────────────────────────

  async getSchema(deploymentId: string): Promise<SubgraphSchema> {
    const result = await this.executeQuery(deploymentId, `{ __schema { types { name kind fields { name type { name kind ofType { name kind } } } } } }`);
    const schema = result.data?.__schema as { types?: Array<{ name: string; kind: string; fields?: Array<{ name: string; type: unknown }> }> };
    if (!schema?.types) throw new Error("Failed to introspect schema");
    // Return only entity types (not internal GraphQL types)
    const entities = schema.types
      .filter(t => t.kind === "OBJECT" && !t.name.startsWith("__") && !["Query", "Subscription"].includes(t.name))
      .map(t => `type ${t.name} { ${(t.fields ?? []).map(f => f.name).join(", ")} }`)
      .join("\n");
    return { deploymentId, schema: entities };
  }

  // ── Query wallet activity across multiple DeFi subgraphs ────────────────

  async queryWalletDeFiActivity(wallet: string): Promise<Record<string, unknown>> {
    const normalizedWallet = wallet.toLowerCase();
    const activity: Record<string, unknown> = { wallet: normalizedWallet, queriedAt: new Date().toISOString() };

    // Query Uniswap v3 for swap activity
    try {
      const uniswapResult = await this.executeQuery(KNOWN_SUBGRAPHS.UNISWAP_V3_ETH, `{
        swaps(first: 10, where: { origin: "${normalizedWallet}" }, orderBy: timestamp, orderDirection: desc) {
          id timestamp amount0 amount1
          token0 { symbol }
          token1 { symbol }
          amountUSD
        }
      }`);
      const swaps = (uniswapResult.data?.swaps ?? []) as unknown[];
      activity.uniswap = { swapCount: swaps.length, recentSwaps: swaps };
    } catch {
      activity.uniswap = { error: "unavailable" };
    }

    // Query Aave v3 for lending positions
    try {
      const aaveResult = await this.executeQuery(KNOWN_SUBGRAPHS.AAVE_V3_ETH, `{
        users(where: { id: "${normalizedWallet}" }) {
          id
          borrowHistory(first: 5, orderBy: timestamp, orderDirection: desc) { id amount timestamp }
          supplyHistory(first: 5, orderBy: timestamp, orderDirection: desc) { id amount timestamp }
        }
      }`);
      const users = (aaveResult.data?.users ?? []) as Array<Record<string, unknown>>;
      activity.aave = users.length > 0
        ? { active: true, data: users[0] }
        : { active: false };
    } catch {
      activity.aave = { error: "unavailable" };
    }

    return activity;
  }
}
