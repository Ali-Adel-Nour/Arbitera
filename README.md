# Arbitra

Arbitra is a trust-minimized, auditable AI escrow and arbitration protocol for autonomous agents. Agent A can query Agent B's persisted settlement reputation over MCP, decide whether to hire B, fund an escrow, and use the AI Judge to evaluate a submitted deliverable before an authorized oracle resolves the existing escrow contract.

## Product flow

```text
Agent A -> MCP reputation query -> hire / do not hire decision
        -> USDC escrow -> seller deliverable -> AI Judge rubric evaluation
        -> canonical verdict + deterministic hash -> oracle settlement
        -> PASS pays seller, FAIL refunds buyer -> reputation history
```

This resolves the agent-economy escrow problem: payment before delivery exposes buyers to poor work, while delivery before payment exposes sellers to non-payment. The escrow contract holds funds and enforces state transitions; the AI court evaluates the agreed criteria and provides an auditable settlement input.

The AI court is not fully trustless. The off-chain LLM and backend oracle key remain explicit trust boundaries. Each verdict records the exact evaluation prompt, acceptance rubric, seller deliverable, model ID/version, raw LLM response, structured PASS/FAIL result, score, reasoning, timestamp, and deterministic `verdictHash`. The timestamp is retained for auditability but excluded from the deterministic hash so identical canonical inputs produce identical hashes.

## Escrow lifecycle

1. Agent A specifies acceptance criteria, a future deadline, seller, and payment, then funds `ArbiterEscrow`.
2. Agent B submits a deliverable before the contract deadline.
3. The backend AI Judge evaluates the deliverable against the original task and rubric, with prompt-injection defenses for untrusted deliverable text.
4. The authorized oracle submits the verdict hash through `resolveEscrow`: PASS pays the seller and FAIL refunds the buyer.
5. The persisted verdict becomes reputation data for future agent hiring decisions.

## Repository layout

- `blockchain/` — existing `ArbiterEscrow` contract, interfaces, tests, and deployment module.
- `backend/` — AI Judge adapter, auditable verdict JSONL store, reputation API, and escrow oracle integration.
- `mcp-server/` — MCP tool `get_agent_reputation` for agent-to-agent hiring decisions.
- `simulation-agents/` — reproducible MCP reputation decision demo.
- `frontend/` — frontend workspace owned by the frontend team.

The current MVP reputation index is the backend's append-only verdict JSONL store. Its response shape is compatible with replacing the storage reader with a The Graph/subgraph query later, and the contract already emits escrow lifecycle events suitable for indexing. No production The Graph subgraph is currently implemented, so this README does not claim Graph-backed reputation today.

## Install and build

Prerequisites: Node.js 22+ and npm 10+.

From PowerShell at the repository root:

```powershell
npm.cmd install
npm.cmd run build --workspace=@arbiter/backend
npm.cmd run build --workspace=@arbiter/mcp-server
```

Copy `backend/.env.example` to a local environment file and set the LLM and escrow variables before using the live judge or settlement route. Never commit API keys or private keys.

## Run the agent reputation demo

The demo starts the backend against reproducible persisted settlement history, then queries the backend through the MCP server. Agent A refuses the poor performer and hires the strong performer based on returned data:

```powershell
npm.cmd run demo --workspace=@arbiter/simulation-agents
```

Expected decisions include:

```text
agent-b: 1/4 successful, 25% success, decision = DO NOT HIRE
agent-c: 4/4 successful, 100% success, decision = HIRE
```

The fixture is clearly local demo history; production reputation comes from verdicts appended by `POST /api/judge` or a future indexed event reader. The hiring decision is calculated from the structured MCP response, not hardcoded per agent.

## Backend API

`POST /api/judge` accepts:

```json
{
  "dealId": "deal-123",
  "acceptanceCriteria": ["The report contains the requested analysis."],
  "deliverable": "The requested analysis is included.",
  "deadline": "2099-01-01T00:00:00.000Z",
  "seller": "agent-b",
  "taskCategory": "coding"
}
```

It returns the auditable verdict and appends it to `VERDICT_STORE_PATH` (default `backend/data/verdicts.jsonl`). `GET /api/reputation/:agent` returns total judged deals, successes, failures, success/failure rates, recency-weighted reliability, task-category breakdown, and settlement history. The MCP server forwards this same structured response through `get_agent_reputation`.

`POST /api/judge-and-settle` accepts the same input, requires the `X-Arbitra-Internal-Key` header, and submits the deterministic `verdictHash` to the existing `resolveEscrow` function. The API expects a bytes32 hex `dealId` for actual on-chain settlement. The legacy `/judge` and `/judge-and-settle` routes remain available for compatibility.

## Tests and contract verification

```powershell
npm.cmd test --workspace=@arbiter/backend
npm.cmd test --workspace=@arbiter/mcp-server
npm.cmd run demo --workspace=@arbiter/simulation-agents
npm.cmd run compile:contracts
git diff --check
```

The backend tests cover PASS and FAIL verdicts, malformed and expired input, deterministic hashing, hash changes for audited input changes, reputation responses, and CORS settlement headers. The MCP test covers a structured reputation query and hiring decision threshold.

On some Windows/Node 24 environments Hardhat can fail before compilation with `uv_os_get_passwd returned ENOMEM`; that is an environment/libuv failure, not a Solidity diagnostic. The backend and MCP suites do not require Hardhat.

## License

This project is licensed under the [MIT License](LICENSE).
