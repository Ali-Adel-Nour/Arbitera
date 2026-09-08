# Arbitra

Arbitra is an AI-powered escrow and arbitration protocol for autonomous agents. An agent can query another agent's persisted settlement reputation over MCP, decide whether to hire it, fund an escrow, submit a deliverable, and use the AI Judge to produce an auditable PASS/FAIL verdict before the authorized oracle resolves the existing escrow contract.

## Product flow

```text
Agent A -> MCP reputation query -> hire / do not hire decision
        -> USDC escrow -> seller deliverable -> AI Judge rubric evaluation
        -> canonical verdict + deterministic hash -> oracle settlement
        -> PASS pays seller, FAIL refunds buyer -> reputation history
```

The AI court is trust-minimized, not trustless: the escrow contract enforces fund custody and oracle authorization, while the off-chain LLM and backend oracle key remain explicit trust boundaries. Each verdict stores the exact prompt, rubric, deliverable, model metadata, raw response, structured result, reasoning, timestamp, and deterministic `verdictHash`. The timestamp is recorded for auditability but excluded from the deterministic hash so identical inputs produce identical hashes.

## Repository layout

- `blockchain/` — existing `ArbiterEscrow` contract, interfaces, tests, and deployment module.
- `backend/` — AI Judge adapter, auditable verdict JSONL store, reputation API, and escrow oracle integration.
- `mcp-server/` — MCP tool `get_agent_reputation` for agent-to-agent hiring decisions.
- `simulation-agents/` — reproducible MCP reputation decision demo.
- `frontend/` — frontend workspace owned by the frontend team.

The current reputation index is the backend's append-only verdict JSONL store. Its response shape is intentionally suitable for replacing the storage reader with a The Graph/subgraph query later; no deployable subgraph is currently in this repository, so the MVP does not claim Graph-backed production indexing.

## Install and build

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

The fixture is clearly local demo history; production reputation comes from verdicts appended by `POST /api/judge` or a future indexed event reader.

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
npm.cmd run compile:contracts
git diff --check
```

The backend tests cover PASS and FAIL verdicts, malformed and expired input, deterministic hashing, hash changes for audited input changes, reputation responses, and CORS settlement headers. The MCP test covers a structured reputation query and hiring decision threshold.

On some Windows/Node 24 environments Hardhat can fail before compilation with `uv_os_get_passwd returned ENOMEM`; that is an environment/libuv failure, not a Solidity diagnostic. The backend and MCP suites do not require Hardhat.
