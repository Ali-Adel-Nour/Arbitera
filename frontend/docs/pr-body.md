Builds the Arbitra frontend: nine screens, a dark UI system, and a set of
build gates that fail on the specific ways an interface like this drifts into
claiming more than it can support.

Branch is cut from `origin/main` and touches no teammate-owned code — zero files
under `backend/`, `blockchain/`, `mcp-server/`, `simulation-agents/`, or
`subgraph/`.

## Screens

| Route | What it does |
| --- | --- |
| `/` | Courtroom docket. All seven lifecycle groups, polled every 2.5s |
| `/deals/:id` | Verdict record. Seven evidence exhibits, shown in full |
| `/deals/:id/verify` | Three-way hash comparison, recomputed in the browser |
| `/agents` | Trust explorer, filtered client-side |
| `/agents/:agent` | One agent, every figure drillable |
| `/agents/:agent/resolutions` | The arithmetic behind each figure |
| `/activity` | MCP reputation-query feed |
| `/sandbox` | Injection sandbox against the live judge |
| `/create`, `/submit` | Buyer and seller write paths |

## The things worth reviewing closely

**The verify panel reaches its own conclusion.** The backend's `verified` flag is
rendered in its own panel with copy stating it is not used, and no code path from
that flag reaches the conclusion. The whole value of recomputing locally
evaporates if the answer comes from the party being checked.

**Persist before sign is enforced by the compiler.** The escrow stores a hash of
the criteria and the deliverable, not the text — so a transaction whose text was
never written down produces a commitment nobody can ever check, including its
author. `lib/persisted.ts` brands stored text with a `unique symbol`; the
transaction builders demand the branded type; `markPersisted` is the only
producer. A file passing raw `string[]`/`string` to the builders fails to compile
with TS2322 on both. There is no arrangement of the JSX that reaches a signature
with unstored text.

**The settlement credential cannot reach a browser.** Four layers: the endpoint is
`pinned` and asserted `local` at compile time, `lib/serverEnv.ts` carries
`import 'server-only'`, `check-copy` allows the identifier at one site under
`src/`, and `check-bundle` greps every emitted chunk. Verified on a build with the
secret set — the public addresses appear in client chunks because they must, and
neither the secret's value nor its identifier appears anywhere.

**Nothing on screen is a placeholder.** Every figure on the docket is computed in
the browser from the same deals array the rows below display, so any of them can
be checked by counting. An absent figure renders as a sentence rather than a dash
or a zero: a dash reads "nothing happened" and a zero reads as a measurement,
and neither is true when nothing has settled yet.

**The one derived state is quarantined.** `Deliberating` is not on-chain.
`lib/deriveState.ts` is the single place the interface infers anything, it can
only ever move a deal from `Submitted` to `Deliberating`, and the group carries a
visible notice saying the contract has no such state.

## Verified behaviour, not asserted

- Injection sandbox: honest deliverable → `PASS`, score 100. Injection attempt →
  `FAIL`, score 0, with the reasoning quoting the instruction it found verbatim.
  Both reasonings open by stating no model was called — a sentence inside the
  verdict hash, so such a record cannot later be presented as one that had a model.
- Tamper detection: the untampered fixture gives `all-match` on all three
  commitments and reports tamper-evident. `?tampered=1` gives `stored-differs` on
  the verdict row and reports a mismatch — the correct diagnosis, since the
  corruption is in the stored hash while the browser's recomputation and the
  chain's commitment agree with each other.
- Trust scores: `agent-b` 4 judged / 1 success → 14, Unproven, ceiling 57.
  `agent-c` 5 / 5 → 63, Established, sitting exactly at its ceiling. The
  drill-down's per-row recency weights reproduce `recencyWeightedReliability` to
  within 1e-12, and `round(reliability × volume × 100)` equals the displayed score.
- Write calldata decoded back with an independent `ethers.Interface`: `approve`
  targets the token with the exact deal amount and not an unlimited allowance,
  `createAndFundEscrow` round-trips all six arguments, and `criteriaHash`
  round-trips as a `string` — the contract's own choice, and encoding it as
  `bytes32` would commit to a different value than the backend's record hashes to.
- Amounts never touch floating point: `toBaseUnits("0.1")` is exactly `100000`.

## The gates

`check-copy` (0/99), `check-design` (0/94), and `check-bundle` (0/36) run in
`prebuild`, so a violation fails the build rather than reaching review. They
enforce the budgets that keep the visual language meaningful:

- monospace confined to two files, because it marks a value you compare byte for
  byte — spend it on chrome and a hash is no longer marked as anything
- the high-chroma ground, the top type step, and the only animation confined to
  `VerdictBanner.tsx`, so the loudest thing on any screen is always the verdict
- the accent confined to `Button.tsx`, so it keeps meaning "act here"
- no hover transforms, no shadows, gradients capped at two files
- `uppercase` must co-occur with `text-caption`
- chain literals confined to `lib/chain.ts`; no 40-hex literal outside fixtures
- the contract's settlement entry points may not be named under `src/` at all

Boldness is measured by computed OKLCH chroma rather than contrast, because
contrast inverts on a dark palette — `--text-hi` on `--base` is 17.77:1 and beats
the verdict block's 14.15:1, so a contrast-based rule stops discriminating.

## Two limitations, stated plainly

**The write path stores preimages in `localStorage`.** No backend route accepts a
preimage, so the text lives on the machine that signed. That means the author can
recompute their own commitment but a third party cannot. It is better than a
commitment to text nobody kept and worse than a stored record.
`lib/localRecords.ts` documents exactly what it does and does not buy, and the
branded type was designed so the substitution is a change of function body when a
write-side counterpart to `GET /api/verify/:dealId` exists.

**No block explorer host is configured.** The Arc Testnet explorer is not
confirmed, and a guessed host persists in a user's wallet after the demo and
attaches a confident link to nothing. Unset, settlement references render as
copyable hashes naming the variable to set, and the add-chain payload omits the
key rather than sending an empty array. Set `NEXT_PUBLIC_EXPLORER_TX_BASE` to turn
them into links.

## Backend asks

`src/types.ts` is written as the contract between this interface and the backend
and marks each gap. The two that unblock the most:

- `EscrowDeal.judgeRequestedAt` — needed for the `Deliberating` group to populate.
  It must mean "in flight now", not "was requested once": the docket cannot fetch
  a judgment per row, so a field left set after a verdict returns would leave every
  judged deal reading as still deliberating.
- `GET /api/verify/:dealId` currently aliases the judgment handler. The panel needs
  the preimage byte-exact as stored, with no re-serialisation, or a recomputation
  reports a mismatch on an untouched record.

## Checks

`typecheck` clean · 28 tests pass · `check-copy` 0/99 · `check-design` 0/94 ·
`check-bundle` 0/36 with the secret set · `next build` green · all eleven screens
and nine API routes return 200, and an unknown path still 404s.
