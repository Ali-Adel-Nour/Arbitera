# Implementation Plan: Arbitra Frontend

## Overview

The build order below follows the seam-and-asset structure from the design: the token layer and build gates land first so the design direction is machine-enforced from commit two, then `types.ts` / `canonicalize.ts` / `verify.ts` (the auditable core), then the fixtures and the single network client, then the five screens in the order the demo argument runs — trust explorer, verdict record, docket, activity, sandbox.

Three constraints shape the sizing of every task:

- **The build is green at every commit.** No task leaves a half-rendered screen or an import to a module that does not exist yet. Where a screen's final home is occupied by a later task (the docket owns `/`), the earlier commit ships an honest interim page rather than a stub with fake data.
- **One concern per commit.** Design tokens land separately from the components that consume them. A fix is its own commit. Every task or task group names the Conventional Commit subject it lands under.
- **Every GitHub-touching action is a task whose first step is asking.** Pushes, remote branch creation, and pull requests are never folded into a build task.

Language: TypeScript. Test runner: `node:test` via `tsx`, with `fast-check` for property tests, per the design's Testing Strategy.

## Tasks

- [x] 1. Repository and branch setup

  - [x] 1.1 Clone the monorepo into the workspace without clobbering `.kiro/specs/`
    - Clone `https://github.com/Ali-Adel-Nour/Arbitra` into a temporary directory, then move the working tree and `.git` into `/Users/starfury/Downloads/Arbitra`, leaving the existing `.kiro/` directory in place
    - Verify `git remote -v` reports `origin` for both fetch and push before continuing; if it does not, stop and report rather than proceeding on a detached tree
    - Verify `.kiro/specs/arbitra-frontend/` still holds `requirements.md`, `design.md`, `tasks.md`, and `.config.kiro` after the move
    - No commit: this task only establishes the tree
    - _Requirements: 17.1_

  - [x] 1.2 Cut `feat/frontend` from `main` and confirm ignore coverage
    - `git checkout main`, fast-forward, then `git checkout -b feat/frontend`
    - Confirm `.gitignore` covers `node_modules`, `.next`, and `.env*`; add only the missing entries
    - Confirm `git status` reports no `.env` file and no key material staged
    - _Commit: `chore: ignore next build output and local env files`_
    - _Requirements: 17.1, 17.2, 17.8, 17.9_

- [ ] 2. Toolchain, design tokens, and build gates

  The gates land here, with the tokens, not at the end. They are what keeps the visual grammar from eroding once screens start arriving, and Property 33 is unenforceable retroactively without a large cleanup commit.

  - [x] 2.1 Replace the Vite workspace manifest with the Next.js toolchain
    - Rewrite `frontend/package.json`: keep the package name `@arbiter/frontend`, set `engines.node >= 22`, add Next.js App Router, React, Tailwind, TypeScript, `ethers@6`, `tsx`, and `fast-check`
    - Add `next.config.ts`, `tailwind.config.ts`, `tsconfig.json` with the `@/*` path alias resolving to `src/`
    - Record the `@arbiter/frontend` retention and the `src/` layout as deliberate deviations in `frontend/README.md`
    - Confirm `npm install --workspace=@arbiter/frontend` and `tsc --noEmit` both succeed
    - _Commit: `chore(frontend): replace vite setup with next app router`_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 2.2 Add the design token layer
    - `src/app/globals.css` as a `@theme` token layer only: the eight-step type scale (`caption` through `ruling`), paper/ink/state colours, the five rule tokens each with its documented meaning in a comment, `--radius-0`, `--radius-chip`, and no shadow tokens at all
    - Load the two families through `next/font/google`; the mono family is referenced by nothing yet
    - Include the `clamp()` reductions for `screen` and `ruling` below 480px
    - _Commit: `chore(design-system): add type scale, colour, and rule tokens`_
    - _Requirements: 14.1, 14.2, 14.4, 14.5, 14.6, 15.5_
    - _Verified by: Property 34_

  - [x] 2.3 Add the three build-gate scripts and wire them into the build chain
    - `scripts/check-copy.mjs` with the banned-pattern table from the design, including the `ARBITRA_INTERNAL_KEY` single-read-site count rule and the `hardcoded-escrow` rule exempting `src/fixtures/`; output `path:line:col [rule-id] match — why`, then a count, then a non-zero exit
    - `scripts/check-design.mjs` for the forbidden visual patterns, bracket-literal font sizes, mono confinement, motion-token confinement, and the boldness-budget assertions on `text-ruling` and the ruling surface tokens
    - The confinement and budget rules are upper bounds, not equalities: `text-ruling`, the ruling surface tokens, and the motion tokens must each appear in **at most one** file, so a count of zero passes. This is what keeps the build green between this task and task 10.2, when `VerdictBanner.tsx` first raises those counts to one; task 11.4 is where the count is asserted to have reached exactly one
    - `src/app/globals.css` is exempt from the mono and ruling-surface confinement rules, since it is the file that declares those tokens. Declaration is not use
    - `scripts/check-bundle.mjs` greping `.next/static/` for the internal key literal and identifier
    - Wire `prebuild` and the inlined `&&` chain in `build`, plus `check:copy`, `check:design`, `check:bundle`, `typecheck`, and `test` scripts
    - _Commit: `chore(scripts): gate the build on copy and design checks`_
    - _Requirements: 10.4, 11.5, 12.5, 12.6, 13.2, 13.3, 13.6, 15.6_
    - _Verified by: Properties 32, 33_

  - [x] 2.4 Write the per-screen review checklist
    - `docs/screen-checklist.md`: a table of route × Requirement 14 criteria 1–11, each cell marked `auto` (naming the `check-design.mjs` pattern that covers it) or `manual` (naming what to look at), with criteria 7 and 12 as the fully-manual cells
    - _Commit: `docs: add the per-screen design review checklist`_
    - _Requirements: 14.12_

  - [ ] 2.5 Build the app shell and the trust-boundary statement
    - `src/app/layout.tsx` with fonts, `Navbar`, and the trust-boundary footer linking `/trust-model`; `src/app/trust-model/page.tsx` stating what the contract enforces and what is trusted infrastructure
    - Seed `src/content/copy.ts` with the shell and trust-model sentences; later screens extend this module in their own commits
    - `src/app/page.tsx` renders the screen title, its one `lede` paragraph, and a route index. It carries no data and no placeholder figures. Task 13.3 replaces its body with the docket. This keeps the build green and the deployment honest between now and then.
    - _Commit: `feat(shell): add app layout, navigation, and trust-model page`_
    - _Requirements: 1.5, 13.1, 13.4, 13.5, 15.2, 15.3_

  - [ ]* 2.6 Write property test for the copy scanner
    - **Property 32: The copy scanner flags exactly the banned content and fails the build when it does**
    - **Validates: Requirements 10.4, 12.5, 12.6, 13.2, 13.3, 13.6, 15.6**

  - [ ]* 2.7 Write property test for the design scanner over the source corpus
    - **Property 33: The visual grammar holds across the whole source corpus**
    - **Validates: Requirements 7.7, 8.9, 14.2, 14.3, 14.6, 14.8, 14.9, 14.10, 14.11**

  - [ ]* 2.8 Write property test for permitted colour pairings
    - **Property 34: Every permitted colour pairing meets its contrast threshold**
    - **Validates: Requirements 15.5**

- [ ] 3. Type spec, canonicalizer, and verification core

  This is the highest-value test surface in the submission. The hash logic is the core claim, so Properties 1–7 each get their own test file and their own commit.

  - [x] 3.1 Declare the backend contract in `types.ts`
    - The escrow state union plus `Deliberating` as a separately-declared display state; the deal, reputation summary, and auditable verdict shapes; the discriminated error result types for 400, 401, 404, 500, 502, 503
    - A `@derived` annotation block on each of the five Derived_Metrics naming the source data the backend would need to supply
    - Documented request and response shapes for the five mocked routes
    - _Commit: `feat(types): declare the backend contract in one module`_
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ] 3.2 Port canonical hashing to the client in `lib/canonicalize.ts`
    - `canonicalize`, `hashCanonicalValue`, `normalizeDeadline`, `computeRubricHash`, `computeDeliverableHash`, `buildVerdictPreimage` as an explicit seventeen-field literal, `computeVerdictHash`, and the `VERDICT_HASH_FIELDS` tuple as the assertion target
    - No React, no fetch, no `process.env`, no `Date.now()`; `ethers` is the only import
    - _Commit: `feat(canonicalize): port canonical hashing to the client`_
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 3.3 Write property test for canonical form
    - **Property 1: Canonical form is order-independent, whitespace-free, and omits undefined**
    - **Validates: Requirements 5.2**

  - [ ]* 3.4 Write property test for canonical hashing
    - **Property 2: Canonical hashing is keccak256 over the UTF-8 bytes of the canonical form**
    - **Validates: Requirements 5.3**

  - [ ]* 3.5 Write property test for single-field rubric and deliverable hashes
    - **Property 3: Rubric and deliverable hashes read exactly one field each**
    - **Validates: Requirements 5.4**

  - [ ]* 3.6 Write property test for the seventeen-field preimage
    - **Property 4: The verdict preimage is exactly the seventeen named fields**
    - **Validates: Requirements 5.5**

  - [ ]* 3.7 Write property test for timestamp invariance
    - **Property 5: The verdict hash is invariant under timestamp**
    - **Validates: Requirements 5.6**

  - [ ]* 3.8 Write property test for deadline normalisation
    - **Property 6: Deadline normalisation agrees across representations and is idempotent**
    - **Validates: Requirements 5.7**

  - [ ]* 3.9 Write property test for score and verdict coupling
    - **Property 7: Score and verdict are functions of approved, and agree with each other**
    - **Validates: Requirements 5.8**

  - [ ] 3.10 Implement the three-way comparison in `lib/verify.ts`
    - `compareTriple` over the five equality partitions plus `onchain-absent`, the `DISAGREEING_PAIR` table, `verifyRecord` returning `VerificationOutcome`
    - `backendVerifiedFlag` is assigned last and read by no code path that produces `conclusion`
    - _Commit: `feat(verify): compare recomputed, stored, and on-chain hashes`_
    - _Requirements: 8.3, 8.4, 8.6, 8.7_

  - [ ]* 3.11 Write property test for comparison soundness
    - **Property 9: The three-way comparison preserves each source and names only genuine disagreements**
    - **Validates: Requirements 8.4, 8.6**

  - [ ]* 3.12 Write property test for independence from the backend flag
    - **Property 11: The verification conclusion is independent of the backend's own assessment**
    - **Validates: Requirements 8.7**

  - [ ] 3.13 Compute the derived metrics in `lib/derive.ts`
    - `recencyWeightedReliability` with `exp(-ageDays / 30)` weights, `trustScore` with `VOLUME_CONFIDENCE_K = 3`, `badgeTier` with the `totalJudged < 3` floor, `totalUsdcSettled` in `bigint`, `disputeRateByCategory` returning numerator and denominator alongside the rate
    - _Commit: `feat(derive): compute trust score, tiers, and settled totals`_
    - _Requirements: 6.1, 6.3, 6.4_

  - [ ]* 3.14 Write property test for recency-weighted reliability
    - **Property 23: Recency-weighted reliability is a bounded weighted mean with the specified weights**
    - **Validates: Requirements 6.4**

  - [ ]* 3.15 Write property test for trust score bounds
    - **Property 24: Trust score is bounded and cannot be raised by reliability alone**
    - **Validates: Requirements 6.1, 6.3**

  - [ ]* 3.16 Write property test for badge tier totality
    - **Property 25: Badge tier is a total function with no gaps or overlaps**
    - **Validates: Requirements 6.1**

  - [ ] 3.17 Generate the backend contract document from `types.ts`
    - `docs/backend-contract.md` listing each mocked route with its request and response shape and the Derived_Metric annotations, for hand-off to the backend developer
    - _Commit: `docs: hand the backend the generated route contract`_
    - _Requirements: 3.7_

- [ ] 4. Fixtures, mock API, the typed client, and polling

  - [ ] 4.1 Add runtime shape guards in `lib/guards.ts`
    - One guard per Type_Spec shape, each named so a `malformed` error can report the expected shape
    - _Commit: `feat(guards): add runtime shape guards for api payloads`_
    - _Requirements: 3.3, 3.4, 3.5_

  - [ ]* 4.2 Write property test for the shape guards
    - **Property 15: Runtime shape guards accept well-formed values and reject every single-field defect**
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [ ] 4.3 Map errors to cause and recovery copy in `lib/errorCopy.ts`
    - `errorCopy` total over the `ApiError` union, the HTTP status table, and `contractErrorCopy` mapping all ten contract errors to pairwise-distinct messages; the refund-availability sentence for Requirement 16.6
    - _Commit: `feat(errors): map api and contract errors to cause and recovery`_
    - _Requirements: 16.3, 16.4, 16.5, 16.6, 16.7, 11.6_

  - [ ]* 4.4 Write property test for total error mapping
    - **Property 19: Error mapping is total, never throws, and always yields a cause and a recovery**
    - **Validates: Requirements 3.8, 11.6, 16.3, 16.4, 16.7**

  - [ ]* 4.5 Write property test for contract error distinctness
    - **Property 37: Each contract error maps to a distinct, non-empty message**
    - **Validates: Requirements 16.5**

  - [ ] 4.6 Route all network access through `services/api.ts`
    - `services/endpoints.ts` with `normaliseBase`, the endpoint table with per-path `origin`, the `pinned` flag on `judgeAndSettle`, `FORCE_BACKEND`, and `resolve`
    - `services/api.ts` returning `ApiResult<T>`, guarding every body, threading `AbortController` signals, and never throwing; `lib/env.ts` as the single `NEXT_PUBLIC_*` read site
    - _Commit: `feat(api): route all network access through one client`_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 4.7 Write property test for base URL resolution
    - **Property 16: Base URL resolution keeps mock routes same-origin and never double-joins**
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 4.8 Write property test for identifier round-tripping
    - **Property 17: Identifiers survive the round trip into a request path**
    - **Validates: Requirements 2.6**

  - [ ]* 4.9 Write property test for single-client network access
    - **Property 18: All network access passes through the single client**
    - **Validates: Requirements 2.1, 2.7**

  - [ ] 4.10 Make fixture state a pure function of absolute time
    - `fixtures/clock.ts` with `CYCLE_MS`, `STEP_MS`, and `cyclePosition`; `fixtures/timelines.ts` with the tracked deal plus deals covering `Created`, `ResolvedRefund`, and `ExpiredRefund`, each with a distinct `offsetMs`; `fixtures/engine.ts` exposing `stateOf` and `snapshotAt(nowMs)`
    - No module-load epoch anywhere, so two serverless instances agree
    - _Commit: `feat(fixtures): advance deal state as a function of absolute time`_
    - _Requirements: 4.3, 4.4_

  - [ ]* 4.11 Write property test for fixture determinism
    - **Property 12: Fixture state is a pure function of absolute time**
    - **Validates: Requirements 4.4**

  - [ ]* 4.12 Write property test for cycle coverage and observable change
    - **Property 13: Every fixture cycle contains the required progression and produces observable change**
    - **Validates: Requirements 4.3, 4.4**

  - [ ] 4.13 Compute fixture record hashes with the client canonicalizer
    - `fixtures/records.ts` sealing hashes at module load through `computeRubricHash` / `computeDeliverableHash` / `computeVerdictHash`, with on-chain fixture fields populated from the same values; `tamper()` and `TAMPERED_RECORD` corrupting the stored verdict hash only
    - `fixtures/agents.ts` with `agent-b` at 1 of 4 and `agent-c` at 5 of 5, both string and `0x` address forms, and `resolveAgentAlias()`; `fixtures/activity.ts` with `graph` and `backend` source labels
    - _Commit: `feat(fixtures): compute record hashes with the client canonicalizer`_
    - _Requirements: 4.5, 4.6, 4.7, 4.8_

  - [ ]* 4.14 Write property test for fixture hash equality
    - **Property 8: Untampered fixture records reproduce their published and on-chain hashes**
    - **Validates: Requirements 4.5, 5.9**

  - [ ] 4.15 Serve fixture data from the Mock_API route handlers
    - Route handlers under `app/api/` for `deals`, `deals/[dealId]`, `verify/[dealId]`, `judgments/[dealId]`, `reputation/[agent]`, `agents`, `mcp-activity`, and `judge`, each calling `snapshotAt(Date.now())` and reading fixtures directly with no outbound request
    - _Commit: `feat(mock-api): serve fixture data from app route handlers`_
    - _Requirements: 4.1, 4.2, 2.3_

  - [ ]* 4.16 Write property test for mock response conformance
    - **Property 14: Every mock response conforms to its declared shape at every point in the cycle**
    - **Validates: Requirements 4.1, 4.2**

  - [ ] 4.17 Add the shared polling primitive `hooks/usePolling.ts`
    - Self-rescheduling `setTimeout` at `POLL_INTERVAL_MS = 2_500`, no `setInterval`, no data-fetching library; `data` assigned only in the `ok: true` branch with no `setData(null)` anywhere; the next timer armed in a `finally`; abort recognised and producing no state update
    - _Commit: `feat(hooks): add the shared polling primitive`_
    - _Requirements: 9.2, 9.6, 9.7, 10.6_

  - [ ]* 4.18 Write property test for prior-data preservation
    - **Property 20: A failure never clears data that was already fetched**
    - **Validates: Requirements 8.8, 9.6, 9.7**

- [ ] 5. Checkpoint — the auditable core and the data layer
  - Run `npm run typecheck`, `npm run test`, and `npm run build` in `frontend/`. Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Machine value and state primitives

  - [ ] 6.1 Add the machine value primitives
    - `lib/formatMachine.ts` (hex truncation threshold, full copy payload) and `lib/format.ts` (numbers, dates, USDC from `bigint`)
    - `primitives/MachineValue.tsx` as the only component referencing `--font-mono`, and `primitives/CopyAffordance.tsx`
    - Plain identifiers such as `agent-b` render untruncated; hex truncates in display and copies in full
    - _Commit: `feat(primitives): render machine values in mono with full-value copy`_
    - _Requirements: 7.4, 7.5, 14.3_

  - [ ]* 6.2 Write property test for machine value rendering
    - **Property 30: Machine values are always copyable in full, and only hex is truncated**
    - **Validates: Requirements 7.4, 7.5**

  - [ ] 6.3 Add the settlement reference in `lib/settlementLink.ts`
    - The `link` and `degraded` branches, single-slash joining via `base.replace(/\/+$/, '')`, and no anchor element emitted in the degraded branch
    - **No default explorer host.** When `NEXT_PUBLIC_EXPLORER_TX_BASE` is absent, empty, or whitespace-only, take the degraded branch: the hash in mono with a copy affordance, no host name and no scheme anywhere in the output, and exactly one note. This task is not yet done, so it absorbs the removal of the Sepolia default rather than needing a follow-up commit for the Arc retarget
    - No hardcoded escrow address anywhere; the address is read only from `NEXT_PUBLIC_ESCROW_ADDRESS`. All chain copy names Arc Testnet and states chain 5042002 by interpolating `ARC_TESTNET` from `lib/chain.ts`, never by typing the digits
    - _Commit: `feat(settlement): degrade the settlement link to a copyable hash`_
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_
    - _Verified by: Property 50_

  - [ ]* 6.4 Write property test for the settlement reference
    - **Property 31: The settlement reference degrades to a copyable value rather than a dead link**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**

  - [ ] 6.5 Add the state, empty, error, and loading primitives
    - `primitives/StateChip.tsx` pairing every state colour with a text label and an accessible name; `primitives/EmptyState.tsx` and `primitives/ErrorState.tsx` reading from the keyed copy table
    - Loading skeletons in the row geometry of the content they replace, static, no pulse
    - _Commit: `feat(primitives): add state chips and empty, error, loading states`_
    - _Requirements: 14.5, 16.1, 16.2, 16.3_

  - [ ]* 6.6 Write property test for state indicator labels
    - **Property 29: Every state indicator carries a text label**
    - **Validates: Requirements 14.5**

  The two sub-tasks below are the Arc Testnet retarget. They are appended here rather than inserted into task 2 so no existing sub-task is renumbered, but they run **early** — before 2.6 and before 6.3 — because one of them changes the copy gate every later commit passes through and the other is a dependency of 6.3 and of the wallet layer. The dependency graph places them in wave 4 accordingly.

  - [ ] 6.7 Retarget the copy gate from Sepolia to Arc
    - Remove the `arc-network` rule from `scripts/check-copy.mjs` entirely. Requirement 13.7 inverts what it encoded: Arc Testnet is now the target, Requirement 12.5 requires the interface to name it, and the rule as written fails the build on the mandated sentence. There is no useful narrowed version
    - Reword the script's own header comment in the same commit — it asserts "a network other than Sepolia", and the file is inside its own scan scope
    - Add `no-resolve-escrow`: `/\bresolveEscrow\b|\bclaimExpiredRefund\b/`, scoped to `src/**` only, so `README.md` and `docs/backend-contract.md` can still describe the oracle's settlement call when explaining what this application does not do
    - Add `chain-literals`: `5042002` and `0x4CEF52` permitted at most twice and only in `src/lib/chain.ts`. Spell the scope inversion out in the script — matches outside that file are reported unconditionally, matches inside it count against the budget — because `internal-key-reads` reads the other way round and a copied shape would make this rule vacuous
    - Keep `verified-inference`, `trustless-ai`, `ai-trustless`, `live-subgraph`, `self-praise`, and `hardcoded-escrow` unchanged. `hardcoded-escrow` keeps its pattern and its exemption list stays at `src/fixtures/` with nothing added to it: the form's token address comes from `NEXT_PUBLIC_USDC_ADDRESS` or the field itself, and a test needing an address derives one with `('0x' + id('seller-a').slice(-40))` rather than earning an exemption
    - _Commit: `chore(scripts): retarget the copy gate from sepolia to arc`_
    - _Requirements: 13.6, 13.7, 20.7, 12.5_
    - _Verified by: Properties 32, 51_

  - [ ] 6.8 Add the Arc Testnet constants in `lib/chain.ts`
    - `ARC_TESTNET` with `chainId: 5042002`, `chainIdHex: '0x4CEF52'` (mixed case exactly as the requirement states it), `name: 'Arc Testnet'`, and `nativeCurrency` with symbol USDC
    - **Both decimals constants, separately.** `nativeCurrency.decimals: 18` exists only for the `wallet_addEthereumChain` payload, because MetaMask validates that field as 18 and rejects any other value. `USDC_DECIMALS = 6` is exported for every escrow amount and is the only one the amount helpers see. Conflating them would scale an escrow amount by 10^12, so a buyer would be asked to sign an approval a trillion times larger than the one displayed. Two named constants, one file, a comment on each
    - `rpcUrls()` from `NEXT_PUBLIC_ARC_RPC_URL`; `blockExplorerUrls()` derived from `NEXT_PUBLIC_EXPLORER_TX_BASE` and returning an empty array when unset, so the add-chain payload omits the key rather than registering a guessed host in someone's wallet permanently
    - `isOnArc` compares numerically after `Number(hex)`, never as a string: providers return `0x4cef52`, `0x4CEF52`, and occasionally a decimal, and a string comparison reports a mismatch on the correct chain
    - Assert `Number(ARC_TESTNET.chainIdHex) === ARC_TESTNET.chainId`, which catches a typo in either literal
    - This is the only module in the source tree where either literal appears, which is what makes 6.7's `chain-literals` rule enforceable
    - _Commit: `feat(chain): add arc testnet constants with separate decimals`_
    - _Requirements: 12.5, 12.7_
    - _Verified by: Property 46_

- [ ] 7. Agent trust explorer

  - [ ] 7.1 List agents with drillable trust scores
    - `primitives/DrillableMetric.tsx` with `href` as a required prop and no default, `primitives/AgentRow.tsx` with tabular figures on `rule/derived`, `lib/resolutionsHref.ts` as the only producer of a destination
    - `components/AgentExplorer.tsx` and `app/agents/page.tsx`: client-side search over identifier, address, and task category names; the standing copy naming the MCP reputation endpoint and labelling the derived metrics; the zero-agent empty state
    - _Commit: `feat(explorer): list agents with drillable trust scores`_
    - _Requirements: 6.1, 6.2, 6.6, 6.7, 6.8_
    - _Verified by: Properties 26, 28_

  - [ ]* 7.2 Write property test for agent search
    - **Property 26: Agent search returns exactly the matching agents, in input order**
    - **Validates: Requirements 6.2**

  - [ ] 7.3 Add the agent detail view
    - `hooks/useAgentReputation.ts` (no polling), `app/agents/[agent]/page.tsx` with both identifier forms in the header and four regions: deal history, dispute rate by task category, recency-weighted reliability, total USDC settled
    - The three derived regions carry `rule/derived`; the volume-cap sentence renders on `agent-c`; the zero-judgment empty state names the action that produces a first record
    - _Commit: `feat(explorer): add agent detail with derived reliability regions`_
    - _Requirements: 6.3, 6.4, 6.7, 6.8_

  - [ ] 7.4 Add the resolutions drill-down route
    - `app/agents/[agent]/resolutions/page.tsx` reading `metric` and `category` search params, rendering the resolutions the metric was computed from plus the arithmetic that reproduces it
    - _Commit: `feat(explorer): drill down from trust score to resolutions`_
    - _Requirements: 6.5_

  - [ ]* 7.5 Write property test for metric drill-down
    - **Property 27: Every displayed reputation number has a destination that reproduces it**
    - **Validates: Requirements 6.5**

  - [ ] 7.6 Review `/agents` and its detail routes against the screen checklist
    - Walk criteria 1–11 in `docs/screen-checklist.md` and fill the route's rows
    - If the screen reads as a generic dashboard — identical rounded cards, an eyebrow label, hover motion, decorative rules — revise it and state in the commit body what changed and why
    - _Commit: `style(explorer): revise treatment flagged by the screen checklist`_
    - _Requirements: 14.7, 14.12_

- [ ] 8. First deployment — fixtures only, live URL early

  - [ ] 8.1 Verify the fixture build passes every gate locally
    - With `NEXT_PUBLIC_API_BASE` unset, run `npm run build --workspace=@arbiter/frontend` and confirm `check:copy`, `check:design`, `next build`, and `check:bundle` all pass
    - _Requirements: 1.6, 18.3_

  - [ ] 8.2 Hand control to the user to run the Vercel deploy in the foreground
    - Ask the user to run `vercel` from `frontend/` themselves and complete the interactive authentication. This is not automatable and must not be backgrounded or wrapped in a script.
    - Leave `NEXT_PUBLIC_API_BASE` unset so the deployment serves its own Mock_API
    - Wait for the user to report the returned URL before continuing
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [ ] 8.3 Record the deployment URL
    - Add the returned URL to `frontend/README.md` with a note that it serves fixture data
    - _Commit: `docs: record the fixture deployment url`_
    - _Requirements: 18.4_

- [ ] 9. Gated remote operation — first push

  - [ ] 9.1 Ask the user for approval, then push `feat/frontend`
    - First action is asking. State exactly what will be pushed: the branch name, the commit count, and that this creates the remote branch.
    - Only on explicit approval, run `git push -u origin feat/frontend`. If approval is withheld, continue with local commits only.
    - _Requirements: 17.10, 17.11_

- [ ] 10. Verdict record

  - [ ] 10.1 Render deal evidence as labelled exhibits
    - `primitives/EvidenceExhibit.tsx` with the label inside the top-left over a `rule/record`, `rule/hashed` or `rule/excluded` on the left edge, and machine bodies switching to `--paper-sunk`
    - `components/VerdictRecord.tsx` and `app/deals/[dealId]/page.tsx`: the three-column evidence row at ≥1024px, the two transcript exhibits with distinct accessible names, and the recorded-metadata exhibit stating that `timestamp` is excluded from the hashed payload
    - The refund-availability sentence renders on this screen
    - _Commit: `feat(record): render deal evidence as labelled exhibits`_
    - _Requirements: 7.1, 7.2, 7.6, 16.6_
    - _Verified by: Property 28_

  - [ ] 10.2 Add the verdict banner and its single motion moment
    - `primitives/VerdictBanner.tsx`: the only dark block, the `ruling` type step used once, the 6px state rule drawing `scaleX(0) → scaleX(1)` over 320ms as the only animation in the application
    - Fires once per mount keyed to `dealId`, only on the absent-or-pending → settled transition; under `prefers-reduced-motion: reduce` the rule renders full width with `animation: none` and the outcome is announced through an `aria-live="polite"` region
    - _Commit: `feat(record): add the verdict banner and its one motion moment`_
    - _Requirements: 7.7, 15.4_
    - _Verified by: Property 33_

  - [ ] 10.3 Add the hash strip with its own on-chain track
    - `primitives/HashStripRow.tsx` as a four-track grid at a fixed 40px row height with `rule/boundary` before the on-chain track and a `CopyAffordance` per cell
    - Three hash rows, then `modelId` with `modelVersion` and the Settlement_Link on `rule/record`, then the backend `verified` flag on `rule/excluded` labelled "Backend's own assessment (not used above)"
    - Mismatched rows take `rule/tampered` and a "Mismatch" chip
    - _Commit: `feat(record): add the hash strip with the on-chain track`_
    - _Requirements: 7.3, 7.4, 7.5, 12.3, 12.4_

  - [ ]* 10.4 Write unit tests for the verdict motion moment
    - Assert the reduced-motion static end state is identical to the animated end state, and that a poll returning the same verdict does not replay the animation
    - _Requirements: 7.7, 15.4_

- [ ] 11. Verify panel

  - [ ] 11.1 Recompute hashes in the browser and compare three sources
    - `hooks/useVerification.ts` (user-triggered, per Requirement 8.1) and `components/VerifyPanel.tsx`
    - The recompute path runs `lib/canonicalize.ts` in the browser on the preimage from `GET /api/verify/:dealId` with no network hop; the control reads "Recompute hashes in this browser"
    - The conclusion renders as **tamper-evident** or **mismatch** with the scope sentence in both cases, plus the `DISAGREEING_PAIR` sentence on mismatch. The word "verified" appears only on the backend-flag label.
    - On a 404 the previously displayed hashes stay visible with the preimage-unavailable `ErrorState` above them
    - _Commit: `feat(verify): recompute hashes in the browser and compare sources`_
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7, 8.8, 13.4, 13.5_

  - [ ]* 11.2 Write unit test for the tampered fixture classification
    - Assert `TAMPERED_RECORD` classifies as `stored-differs`, so the browser and the chain agree and the backend record is named as the odd source
    - _Requirements: 4.6, 8.6_

  - [ ]* 11.3 Write property test for the tamper-evident conclusion and its scope
    - **Property 10: Agreement across all three sources yields a tamper-evident conclusion with its scope stated**
    - **Validates: Requirements 8.5, 13.4, 13.5**

  - [ ] 11.4 Confine the boldest treatment to the ruling block
    - Confirm through `check-design.mjs` that `text-ruling` and the ruling surface tokens each occur exactly once across `src/`, and that no other screen carries a display-scale heading, an inverted surface, or an animation
    - _Commit: `style(verify): confine the ruling step to the ruling block`_
    - _Requirements: 8.9_
    - _Verified by: Property 33_

  - [ ] 11.5 Review `/deals/[dealId]` against the screen checklist
    - Walk criteria 1–11 and fill the route's rows. This review covers the whole route, evidence exhibits through verify panel.
    - If the screen reads as a generic dashboard, revise and state in the commit body what changed
    - _Commit: `style(record): revise treatment flagged by the screen checklist`_
    - _Requirements: 14.7, 14.12_

- [ ] 12. Checkpoint — the verification claim end to end
  - Open a fixture deal, recompute in the browser, confirm the three-way match, then confirm the tampered record reports `stored-differs`. Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Courtroom docket with polling

  - [ ] 13.1 Derive the display state and partition deals by state
    - `lib/deriveState.ts` returning `Deliberating` only when `judgeRequestedAt` is present and no judgment has landed, and `Submitted` otherwise; `lib/group.ts` partitioning a deal list across the seven display states
    - _Commit: `feat(docket): derive deliberating state and partition by state`_
    - _Requirements: 9.1, 9.4_

  - [ ]* 13.2 Write property test for docket partitioning
    - **Property 21: Docket grouping partitions the deal list**
    - **Validates: Requirements 9.1, 9.3**

  - [ ] 13.3 Poll the deal list and make the docket the demo home
    - `primitives/DocketEntry.tsx` as a three-track ledger row whose whole row is a link, with a 0ms background swap on hover and a 2px focus outline; `hooks/useEscrows.ts` over `usePolling`
    - `components/CourtroomDocket.tsx` and `components/StatsOverview.tsx`; all seven groups always render so an arriving deal is a visible event rather than a layout reflow
    - Replace the interim body of `src/app/page.tsx` with the docket; the `Deliberating` header carries `rule/derived` and its off-chain sentence; the footer names the 48-second fixture cycle when `NEXT_PUBLIC_API_BASE` is unset and names the variable when a poll fails
    - _Commit: `feat(docket): poll the deal list and group entries by state`_
    - _Requirements: 9.2, 9.3, 9.5, 9.6, 9.7_

  - [ ]* 13.4 Write property test for docket entry destinations
    - **Property 22: Every docket entry addresses its own deal record**
    - **Validates: Requirements 9.5**

  - [ ] 13.5 Review `/` against the screen checklist
    - Walk criteria 1–11 and fill the route's rows. The docket is the screen most at risk of reading as a generic dashboard, so check the container treatment against Requirement 14.7 specifically: rules between entries, not a card per deal.
    - If it reads generic, revise and state in the commit body what changed
    - _Commit: `style(docket): revise treatment flagged by the screen checklist`_
    - _Requirements: 14.7, 14.12_

- [ ] 14. MCP activity feed

  - [ ] 14.1 Stream MCP reputation queries as a transcript
    - `primitives/LogLine.tsx` inside a continuous `--paper-sunk` well with a fixed 72px timestamp column, a 2ch hanging indent, and no separators; `hooks/useMcpActivity.ts` polling at 2.5s
    - `components/McpActivityFeed.tsx` and `app/activity/page.tsx`: each line names the querying agent, the queried agent, the reliability figure, the hiring decision, and the `graph` or `backend` source label
    - The three standing sentences: the fallback explanation, the no-live-subgraph disclaimer, and the off-chain-judge-record provenance note; plus the empty state naming the agent action that produces a first entry
    - _Commit: `feat(activity): stream mcp reputation queries as a transcript`_
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 14.2 Write property test for activity entry completeness
    - **Property 39: Every activity entry names all four facts and its source**
    - **Validates: Requirements 10.1, 10.2**

  - [ ] 14.3 Review `/activity` against the screen checklist
    - Walk criteria 1–11 and fill the route's rows; confirm the well reads as a console transcript rather than a list of cards
    - If it reads generic, revise and state in the commit body what changed
    - _Commit: `style(activity): revise treatment flagged by the screen checklist`_
    - _Requirements: 14.7, 14.12_

- [ ] 15. Injection sandbox

  - [ ] 15.1 Proxy settlement through a server-only key
    - `lib/serverEnv.ts` with `import 'server-only'` as the single read site for `ARBITRA_INTERNAL_KEY`; `content/presets.ts` typed as a non-empty tuple of non-empty criteria, asserted at module load
    - `app/api/judge-and-settle/route.ts` accepting only `presetId` and constructing the deal identifier, deadline, and criteria server-side; falls back to a labelled simulated verdict when no backend origin is configured
    - _Commit: `feat(sandbox): proxy settlement through a server-only key`_
    - _Requirements: 11.4, 11.5, 11.6_

  - [ ]* 15.2 Write property test for settlement preconditions
    - **Property 40: Every sandbox submission satisfies the backend's settlement preconditions**
    - **Validates: Requirements 11.1, 11.4**

  - [ ] 15.3 Submit two preset payloads for live judging
    - `hooks/useJudgeSubmission.ts` keying in-flight state by preset id, and `components/InjectionSandbox.tsx` with `app/sandbox/page.tsx`
    - Exactly two presets, the injection payload shown verbatim, one control each, no input fields; the pending control is `aria-disabled` with `aria-busy` and reads "Judging…" while the other preset stays live
    - The verdict renders in place beneath the payload it judged; a 401 names `ARBITRA_INTERNAL_KEY`, a 400 renders the backend's text verbatim and accents the named field's exhibit
    - _Commit: `feat(sandbox): submit two preset payloads for live judging`_
    - _Requirements: 11.1, 11.2, 11.3, 11.7, 11.8_

  - [ ]* 15.4 Write property test for submission concurrency
    - **Property 41: At most one sandbox request per preset is ever in flight**
    - **Validates: Requirements 11.8**

  - [ ]* 15.5 Write property test for rejected judge requests
    - **Property 42: A rejected judge request surfaces the backend's own text and attributes it**
    - **Validates: Requirements 11.7**

  - [ ]* 15.6 Write unit test for the missing-authorization copy
    - Assert the 401 copy states that nothing was settled and names `ARBITRA_INTERNAL_KEY`
    - _Requirements: 11.6_

  - [ ] 15.7 Assert the internal key is absent from the client bundle
    - Run the production build with `ARBITRA_INTERNAL_KEY` set in the environment and confirm `check-bundle.mjs` finds neither the literal value nor the identifier under `.next/static/`
    - Confirm `check-copy.mjs` still reports exactly one read site
    - _Requirements: 11.5_
    - _Verified by: Property 32_

  - [ ] 15.8 Review `/sandbox` against the screen checklist
    - Walk criteria 1–11 and fill the route's rows
    - If it reads generic, revise and state in the commit body what changed
    - _Commit: `style(sandbox): revise treatment flagged by the screen checklist`_
    - _Requirements: 14.7, 14.12_

- [ ] 16. Quality floor and cross-screen invariants

  - [ ] 16.1 Close the responsive, keyboard, and reduced-motion gaps
    - Confirm no horizontal overflow from 375px upward on every screen, with `overflow-wrap: anywhere` on machine values; every pointer action reachable and activatable by keyboard with a visible focus indicator; the reduced-motion path exercised
    - No interface copy announcing its own accessibility or responsiveness
    - _Commit: `fix(a11y): expose pointer actions to keyboard with visible focus`_
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.6_

  - [ ]* 16.2 Write property test for horizontal overflow
    - **Property 35: No content produces horizontal overflow at any supported width**
    - **Validates: Requirements 15.1**

  - [ ]* 16.3 Write property test for keyboard operability
    - **Property 36: Every action is keyboard-operable and visibly focusable**
    - **Validates: Requirements 15.2, 15.3**

  - [ ]* 16.4 Write property test for the three data states per screen
    - **Property 38: Every remote-reading screen renders all three data states**
    - **Validates: Requirements 16.1, 16.2**

  - [ ]* 16.5 Write property test for structural rule token meanings
    - **Property 28: Structural rule tokens correspond exactly to their documented meanings**
    - **Validates: Requirements 6.7, 7.6, 14.4**

  - [ ]* 16.6 Write route integration tests
    - With `NEXT_PUBLIC_API_BASE` unset, assert every route returns 200 with fixture-derived content
    - _Requirements: 1.5, 2.3, 4.1_

  - [ ] 16.7 Audit the commit history against the repository workflow rules
    - Walk `git log --oneline main..feat/frontend` and confirm every subject is a Conventional Commit of type `feat`, `fix`, `refactor`, `style`, or `chore`/`docs`, in imperative mood, at 72 characters or fewer, and covering one concern
    - Confirm each commit whose reason is not evident from its diff carries a body stating the reason, what it replaces, and what it unblocks; confirm token, component, and fix commits were not combined
    - Spot-check that the production build passes at the head of each section boundary commit, and confirm no `.env` file or key material appears anywhere in the history
    - Report findings. If a subject or a body needs correcting, land the correction as a new commit; do not rewrite history without asking the user first
    - _Requirements: 17.3, 17.4, 17.5, 17.6, 17.7_

- [ ] 22. The wallet layer

  Positioned here — after the quality floor, before the final checkpoint — because the evidence surface is demo-ready at every commit and the write path lands on top of it. Numbered 22 rather than 17 because 17 through 21 are taken and eight commits plus the execution history already reference the existing identifiers; see the Notes.

  ethers v6 takes everything downstream of a connected account. Discovery, connection, and chain switching are hand-rolled against a scripted mock provider, which is the surface where the behaviour is specific to Arc rather than generic.

  - [ ] 22.1 Discover injected providers with EIP-6963
    - `lib/wallet/detect.ts`: `discoverProviders()` listens for `eip6963:announceProvider`, dispatches `eip6963:requestProvider`, keys announcements by `info.rdns` so a wallet announcing twice counts once, settles on a short timer, and never rejects
    - `window.ethereum` is the fallback only, returned as a single entry identified `unknown.injected`. It is not sufficient on its own: with two wallets installed it is whichever extension wrote last, so a buyer can sign a real transaction from the wrong account while the interface shows a correct-looking address
    - More than one entry renders a chooser — wallet name at the `record` step, one per row, `rule/instance` between them, no icon above 16px, nothing pre-selected and no first-entry default. Exactly one entry connects directly, because a chooser with one option is friction carrying no information. No entries renders no control at all
    - The chosen `rdns` is written to `localStorage` as a preference that decides which provider to ask, never as evidence that an account is connected
    - _Commit: `feat(wallet): discover injected providers with eip-6963`_
    - _Requirements: 19.1, 19.6, 21.2_
    - _Verified by: Property 49_

  - [ ] 22.2 Track connection state from the provider alone
    - `lib/wallet/state.ts` and `hooks/useWallet.ts`: a three-status `WalletState` — `unavailable`, `disconnected`, `connected` — with `connected` carrying address and `chainId` together so "connected but the chain is unknown" is not representable
    - Wrong-network is derived through `isOnArc`, not a fourth status. A fourth status would make every consumer switch on four cases when the only question most of them ask is whether a write is possible
    - **On mount call `eth_accounts`, never `eth_requestAccounts`.** The silent call returns the accounts already authorised for this origin; the prompting one would pop a wallet dialog at a reviewer who opened the docket to read a record. While the first call is outstanding the state is `disconnected` with the control `aria-busy`: a flash of "not connected" is honest, a flash of a stale address is not
    - `accountsChanged` and `chainChanged` listeners registered on the discovered provider rather than on `window.ethereum`, with `removeListener` cleanup on the same function identity so switching wallets leaves nothing behind. No page reload on `chainChanged`
    - An emitted empty account list returns the interface to `disconnected` rather than retaining the last address. Nothing in `localStorage` is treated as evidence of connection
    - _Commit: `feat(wallet): track connection state from the provider alone`_
    - _Requirements: 19.1, 19.2, 19.7_
    - _Verified by: Property 55_

  - [ ] 22.3 Switch to Arc Testnet and add it when the provider does not know it
    - `lib/wallet/request.ts` wrapping the five provider methods into `WalletOutcome`, and `lib/wallet/chainSwitch.ts` with `ensureArc`: `wallet_switchEthereumChain` with `0x4CEF52`, then `wallet_addEthereumChain` only on the unrecognised-chain error, then retry the switch. Adding first would ask a wallet that already knows the chain to re-register it
    - `isUnrecognisedChain` checks `error.code`, `error.data.originalError.code`, and falls back to matching `/unrecognized chain|4902/i` on the message, because 4902 is not reliably at one depth. Unit-test it against all three shapes; the ugliness stays confined to this predicate
    - The add-chain payload takes `chainIdHex`, the name, `nativeCurrency` at 18 decimals, and `rpcUrls()`, and omits `blockExplorerUrls` entirely when none is configured
    - Every chain comparison is numeric after `Number(hex)`, never a string comparison
    - Do not re-read `eth_chainId` after a successful switch: the resolution and the `chainChanged` event write the same value in either order, and re-reading is what produces the flicker
    - _Commit: `feat(wallet): switch to arc testnet and add it when unknown`_
    - _Requirements: 19.3, 19.4, 19.5_
    - _Verified by: Property 54_

  - [ ] 22.4 Map wallet failures to cause and recovery
    - `lib/wallet/errorCopy.ts`: a `WalletError` closed union parallel to `ApiError`, and `walletErrorCopy` total over it returning the same cause-and-recovery pair, so `ErrorState` renders both unions with no second component
    - **A rejection is a third arm of `WalletOutcome`, not a member of `WalletError`.** `{ status: 'rejected' }` (EIP-1193 code 4001) carries no `error` field, so there is nothing to pass the copy function and no error state is reachable from it; the interface returns to the state it held before the request. A `{ kind: 'rejected' }` member with empty copy works until someone writes a generic `if (!ok) showError(...)` and every cancelled signature becomes a red panel
    - `insufficient-gas` names USDC and never mentions ETH as the gas token, since an ETH faucet is a dead end on this chain. `chain-mismatch` interpolates both the reported chain identifier and 5042002. `locked` stays separate from `no-provider` because the recovery differs — collapsing them tells a reviewer with MetaMask installed that they have no wallet
    - _Commit: `feat(wallet): map wallet failures to cause and recovery`_
    - _Requirements: 19.8, 19.9, 12.7_
    - _Verified by: Property 47_

  - [ ] 22.5 Add the connect control to the navigation
    - `components/WalletButton.tsx` in `Navbar`, rendered entirely through the design system: the connected address via `MachineValue` (mono, truncated in display, full value on copy), `--radius-chip`, no arrow glyph on the label, no hover animation, and a visible 2px focus outline
    - With `status: 'unavailable'` no button element is rendered at all. In its place one sentence stating that no wallet was detected, that creation and submission need one, and that every record on the site can be read without one — the same resolution as the degraded settlement link, for the same reason
    - _Commit: `feat(wallet): add the connect control to the navigation`_
    - _Requirements: 19.2, 19.6, 14.9, 14.11, 15.2, 15.3, 21.2_

  - [ ]* 22.6 Write property test for the chain constants
    - **Property 46: The chain constants agree, and every network identification derives from them**
    - **Validates: Requirements 12.5, 19.4**

  - [ ]* 22.7 Write property test for wallet failure copy and rejection
    - **Property 47: Wallet failure copy is total, and a rejection can produce none of it**
    - **Validates: Requirements 19.8, 19.9, 12.7**

  - [ ]* 22.8 Write property test for rendering with no wallet present
    - **Property 49: Every read-only screen renders with no wallet present**
    - **Validates: Requirements 21.1, 21.2, 21.3, 21.4, 19.6**

  - [ ]* 22.9 Write property test for the switch-then-add sequence
    - **Property 54: An approval is requested exactly when the allowance is short, and never after the funding call**
    - **Validates: Requirements 20.2, 19.3, 19.5**

  - [ ]* 22.10 Write property test for provider events and listener cleanup
    - **Property 55: Provider events update state without a reload and leave no listener behind**
    - **Validates: Requirements 19.7**

- [ ] 23. The write path

  - [ ] 23.1 Represent every amount as a `bigint` at six decimals in `lib/amount.ts`
    - `parseUsdcAmount(input)` returning either a `bigint` or a named refusal: more than six fractional digits, a non-numeric shape, or a zero value. The regex runs before `parseUnits` so the refusal wording is ours and specific — *"USDC records amounts to six decimal places"* rather than ethers' internal message
    - `formatUsdcAmount(value)` for display. `parseUnits` does the conversion as string arithmetic; no `parseFloat`, no `*` or `/` on a user-supplied value, and no JavaScript `number` anywhere in the write path, because `Number('0.1') * 1e6` is `100000.00000000001`
    - Amounts cross the API seam as decimal strings and live in arithmetic as `bigint`, the convention `totalUsdcSettled` already set. The form echoes `formatUsdcAmount(parsed)` back under the field, so the reader confirms the number the contract will see rather than the one they typed
    - _Commit: `feat(amount): parse usdc amounts to bigint without floating point`_
    - _Requirements: 20.11_
    - _Verified by: Property 45_

  - [ ] 23.2 Mint deal identifiers in `lib/dealId.ts`
    - 32 bytes from `crypto.getRandomValues`, with the lowest bit forced high so the value can never be `bytes32(0)` and trip `InvalidDealId`. A masked bit is unconditional; a loop-until-non-zero has a branch that will never execute and therefore will never be tested
    - Random rather than derived from the deal's inputs: a buyer resubmitting the same deal after a failure would derive the same identifier, and if the first transaction actually landed the retry reverts with `DealAlreadyExists` — the error a fresh identifier avoids
    - **A retry reuses the minted identifier rather than reminting.** The identifier is minted once per form submission and held in the pending record, so an approve-then-create sequence that fails at the create step retries with the same value, keeping the `criteriaHash` already computed and any hash already shown. A new identifier is minted only on a new form submission; Requirement 20.3's "not previously submitted" is about submitted identifiers, and a reverted transaction submitted nothing
    - _Commit: `feat(deal): mint non-zero 32-byte deal identifiers`_
    - _Requirements: 20.3_
    - _Verified by: Property 44_

  - [ ] 23.3 Narrow the contract interface and decode reverts in `lib/contracts/`
    - `escrowAbi.ts` and `erc20Abi.ts` as hand-written fragments containing **only** the functions and events this frontend calls. `resolveEscrow` and `claimExpiredRefund` are absent, so no encoder for either exists in the client — the structural half of Requirement 20.7, with 6.7's `no-resolve-escrow` rule as the other half
    - `escrow.ts` and `erc20.ts` as the call sites: `new Contract(address, abi, signer)`, `tx.wait(1)` for confirmation, and `ensureAllowance` reading `allowance` before requesting anything
    - `revert.ts`: a selector map built once at module load from `CONTRACT_ERROR_NAMES` — the same tuple `contractErrorCopy` is total over — so the ten selectors and the ten messages cannot drift apart. Read `error.revert.name` first, then pull raw data from `error.data` and `error.info.error.data` and look up the four-byte selector. Assert the map has ten distinct keys, which catches a name typo as a collision
    - `revert-undecodable` is its own kind so it cannot borrow another error's copy. When the node returns no data, the copy **enumerates the candidate causes for the attempted operation and says it cannot narrow further** — allowance, balance, duration, or identifier in use for `createAndFundEscrow`; state, deadline, or caller for the submission. Inventing a specific cause here would be the interface doing confidently the exact thing the application exists to argue against
    - Leave gas estimation on: it runs an `eth_call` first, so a certain revert fails before the wallet opens. That is also where `missing revert data` comes from, which is why the undecodable branch is a first-class state
    - _Commit: `feat(contracts): narrow the escrow abi and decode custom errors`_
    - _Requirements: 20.7, 20.10, 16.5_
    - _Verified by: Properties 51, 52_

  - [ ] 23.4 Add the transaction lifecycle in `hooks/useWriteTransaction.ts` and `primitives/TransactionState.tsx`
    - Six phases — `idle`, `awaiting-signature`, `mining`, `confirmed`, `reverted`, `rejected`. `awaiting-signature` carries no `txHash` because no transaction exists yet, and `mining` cannot be constructed without one, so Requirement 20.8's distinction is structural rather than remembered
    - The two phases read differently because they ask different things of the reader: *"Waiting for your wallet. Approve the request to continue."* against *"Submitted. Waiting for the transaction to be included in a block."* Collapsing both into "Processing…" leaves a reader watching a spinner while a wallet popup sits behind the browser window
    - `TransactionState` renders as a two-row record: operation name at the `caption` step, phase sentence at the `body` step, and once a hash exists the hash through the settlement reference treatment. The mining indicator is the same 1px `--ink` progress rule the polled regions use — no spinner, no animation
    - Confirmation is `tx.wait(1)` against the injected provider, not `usePolling`: different transport, and it needs one event rather than a cadence. A receipt with `status === 0` produces `tx-failed` carrying the hash. `rejected` renders as nothing and clears on the next action
    - _Commit: `feat(tx): distinguish awaiting signature from mining`_
    - _Requirements: 20.8, 20.9_
    - _Verified by: Property 53_

  - [ ] 23.5 Add `primitives/FieldSet.tsx` and the costly-action treatment
    - `FieldSet` as the seventh container kind: no box, no card, no radius, no shadow. Label at the `caption` step above the control, the control on `--paper-sunk` with a single 1px `--ink` bottom rule and no other border so it reads as a ruled line on a form, help text at the `meta` step beneath
    - Mono at the `record` step when `valueKind` is `machine`, Archivo at the `body` step when it is prose. This is the second file in the mono allow-list and the reason is the requirement rather than a loophole: a 42-character address typed into an Archivo field is materially harder to check against a clipboard, and an `<input>` cannot render through `MachineValue`
    - The costly action is distinguished by **consequence-naming labels** — "Approve 250.000000 USDC", "Sign and fund 250.000000 USDC", rendered from `formatUsdcAmount(parsed)` so the label tracks the field. Not "Continue", not "Submit"
    - A `meta`-step consequence line directly above the action stating what moves and where: the amount, the escrow address as a truncated `MachineValue`, and *"Your wallet will ask you to sign. Gas on Arc Testnet (chain 5042002) is paid in USDC."*
    - **Rule weight, never fill or colour.** A 2px `--ink` full-width rule above the action row and a 2px box on the costly control against 1px for navigation. Heavier than `rule/record`, lighter than `rule/boundary` so the trust-boundary rule stays unique. The boldness budget belongs to the verdict banner and is not spent here
    - The costly control is last in the form, alone on its row, with no sibling beside it. **No confirmation dialog** — the label and the consequence line already say what happens, and a modal asking "are you sure" adds a click without adding information
    - _Commit: `feat(primitives): add the field set and costly-action treatment`_
    - _Requirements: 14.7, 14.12_

  - [ ] 23.6 Originate funded deals from `CreateDealForm` and `app/create/page.tsx`
    - One column at 68ch, no grid. Five `FieldSet`s in the order a deal is described — seller address, token address (pre-filled from the environment when set), amount, acceptance criteria, deadline in seconds — then the consequence line and the action
    - Read `allowance` first, then request an **exact-amount** `approve` only when the allowance is short, then `createAndFundEscrow`. One control at a time, not two side by side: the label reads "Approve …" until the allowance covers the amount and "Sign and fund …" after, and a `meta`-step note says so when no approval was needed. Exact amount rather than `MaxUint256` because a judge reading the transaction sees either "approve 250.000000 USDC" or a 78-digit number, and an unlimited approval to a hackathon contract is a real standing risk to the approver
    - With `NEXT_PUBLIC_ESCROW_ADDRESS` unset, render no submit control at all: there is no spender to approve
    - **`criteriaHash` is the load-bearing link.** Compute it with `computeRubricHash` from `lib/canonicalize.ts` — the identical export Verify_Panel calls, not a copy and not a wrapper — over `parseAcceptanceCriteria(text)`, which splits on newlines, trims, drops empties, and preserves order as the single point of text-to-`string[]` conversion. Write the returned value **unmodified**: the `0x`-prefixed lowercase 66-character hex string, no `bytes32` conversion, no `0x` stripping, no case change, no CID wrapper. The contract types the field as `string`, so the encoding is the frontend's choice, and if it differed from the recomputation every deal this interface created would show a rubric mismatch and the application would be accusing itself of tampering
    - POST the parsed array verbatim alongside the `dealId` so the judge record holds that array rather than a re-derivation. If the route is unavailable, still write the on-chain commitment and state plainly that the criteria are committed on-chain but not yet on record for judging — a visible degradation rather than a rubric row that disagrees later
    - On confirmation show the minted `dealId`, the `criteriaHash` beside it with *"This is the value Verify_Panel will recompute from the criteria above."*, and a link to `/deals/{dealId}`
    - _Commit: `feat(create): originate funded escrows from the browser`_
    - _Requirements: 20.1, 20.2, 20.4_
    - _Verified by: Properties 43, 54_

  - [ ] 23.7 Submit deliverables from `SubmitWorkForm` and `app/submit/page.tsx`
    - Two `FieldSet`s, deal identifier and deliverable text, then the same action treatment, with a `meta`-step line above it stating *"Your deliverable is saved to the record first, then you sign its hash on-chain."*
    - **Persist before sign, enforced by a type.** `signSubmitDeliverable` takes a `PersistedDeliverable`, a branded interface only `persistDeliverable` can produce, with no constructor and no cast site — inverting the order is a compile error rather than a rule someone remembers. The contract stores a hash and the text lives in the backend, so a signature-first ordering could confirm a commitment referencing text that was never persisted
    - `lib/pendingSubmission.ts` in `localStorage` under `arbitra:pending-submission:{dealId}`, holding `{ dealId, deliverableHash, persistedAt }` and **never the deliverable text**: the text is already server-side, the hash is all the retry needs, and writing someone's work into browser storage has no upside here. `localStorage` rather than component state because the retry must survive a reload, and rather than `sessionStorage` because it should survive closing the tab
    - On persistence success with a rejected signature or a reverted transaction: *"This deliverable is saved but not yet submitted on-chain. The judge will not see it until the submission transaction confirms."* The retry goes straight to the signature with **no second POST**. On mount, read the store and render that state for any entry found; delete the entry when a receipt confirms
    - `deliverableHash` uses `computeDeliverableHash` from the same canonicalizer module, in the same unmodified lowercase hex form
    - Record the migration: this record belongs on the backend as an `onChainSubmittedAt` field on the deal, which needs a route this workspace does not own
    - _Commit: `feat(submit): persist the deliverable before requesting a signature`_
    - _Requirements: 20.5, 20.6_
    - _Verified by: Property 48_

  - [ ] 23.8 Review `/create` and `/submit` against the screen checklist
    - Walk criteria 1–11 in `docs/screen-checklist.md` and fill both routes' rows, matching the pattern of 7.6, 11.5, 13.5, 14.3, and 15.8
    - A form is the easiest place to slide back toward a product dashboard. Check specifically that there is no card around the field group, no filled or coloured primary button, no confirmation modal, and no hover motion on the action row
    - If either screen reads generic, revise it and state in the commit body what changed and why
    - _Commit: `style(write): revise treatment flagged by the screen checklist`_
    - _Requirements: 14.7, 14.12_

  - [ ] 23.9 Confirm the read path still works with no wallet
    - Render every read-only route with no injected provider discovered, no account connected, and `NEXT_PUBLIC_API_BASE` unset. Each must produce content and raise no error, and no wallet-dependent control may throw or hang on activation
    - Add the `wallet-import-scope` rule to `check-design.mjs`: `lib/wallet/`, `lib/contracts/`, `hooks/useWallet.ts`, and `hooks/useWriteTransaction.ts` may be imported only by `WalletButton.tsx`, `CreateDealForm.tsx`, `SubmitWorkForm.tsx`, `TransactionState.tsx`, `app/create/page.tsx`, `app/submit/page.tsx`, and each other. A read-only screen then cannot acquire a wallet dependency without the build saying so
    - Confirm `useEscrows`, `useVerification`, `useAgentReputation`, and `useMcpActivity` are untouched by this feature and that no `services/api.ts` call takes an address from wallet state
    - _Commit: `chore(scripts): confine wallet imports to the write-path modules`_
    - _Requirements: 21.1, 21.2, 21.3, 21.4_
    - _Verified by: Property 49_

  - [ ]* 23.10 Write property test for the write-path and verification equality
    - **Property 43: What the write path commits on-chain is exactly what Verify_Panel recomputes**
    - **Validates: Requirements 20.4, 5.4**
    - This is the one to keep above all others in this group. It is what makes the write path and the verification claim one system rather than two features that happen to ship together

  - [ ]* 23.11 Write property test for deal identifier minting and retry reuse
    - **Property 44: Every minted deal identifier is 32 non-zero bytes, and a retry reuses rather than remints**
    - **Validates: Requirements 20.3**

  - [ ]* 23.12 Write property test for amount round-tripping
    - **Property 45: Token amounts round-trip through `bigint` at six decimals with no floating-point step**
    - **Validates: Requirements 20.11**

  - [ ]* 23.13 Write property test for persist-before-sign and single persistence
    - **Property 48: Persistence precedes signature, and a retry never persists twice**
    - **Validates: Requirements 20.5, 20.6**

  - [ ]* 23.14 Write property test for the absence of a settlement encoder
    - **Property 51: The frontend cannot settle**
    - **Validates: Requirements 20.7**

  - [ ]* 23.15 Write property test for revert decoding
    - **Property 52: Revert decoding names a mapped error or names none at all**
    - **Validates: Requirements 20.10, 16.5**

  - [ ]* 23.16 Write property test for the signature and mining phases
    - **Property 53: Awaiting a signature and mining are distinguishable states**
    - **Validates: Requirements 20.8, 20.9**

- [ ] 17. Final checkpoint — full gate run
  - Run `npm run typecheck`, `npm run test`, and `npm run build` in `frontend/`, and confirm every screen renders on fixtures. Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Final deployment

  - [ ] 18.1 Verify the release build passes every gate
    - Re-run the full build chain with `NEXT_PUBLIC_API_BASE` unset and confirm `check:bundle` passes with the internal key present in the environment
    - _Requirements: 1.6, 11.5, 18.3_

  - [ ] 18.2 Hand control to the user to re-run the Vercel deploy in the foreground
    - Ask the user to run `vercel` from `frontend/` themselves for the production deployment. Foreground only; the interactive auth is theirs to complete.
    - Wait for the user to report the returned URL
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [ ] 18.3 Update the recorded deployment URL
    - _Commit: `docs: update the deployment url after the final build`_
    - _Requirements: 18.4_

- [ ] 19. Gated remote operations — final push and pull request

  - [ ] 19.1 Ask the user for approval, then push `feat/frontend`
    - First action is asking. Name the commit range being pushed.
    - Only on explicit approval, run the push.
    - _Requirements: 17.10, 17.11_

  - [ ] 19.2 Ask the user for approval, then open the pull request into `main`
    - First action is asking. Show the proposed title (under 70 characters) and description before creating anything.
    - Only on explicit approval, create the PR.
    - _Requirements: 17.10_

## Superseded tasks — formerly below the cut line

**These five sub-tasks are superseded and are to be closed without work.** Requirements 19 and 20 were promoted from optional to core and swapped in subject, so the work sketched here now lands as core tasks 22 and 23 above, at full scope: task 22 covers what these called wallet connection, task 23 covers deal creation and deliverable submission, and neither is behind a feature flag. The five sub-task identifiers and their bullet text are left exactly as written, including their now-stale requirement references, because the dependency graph and the execution history address them by identifier. Read tasks 22 and 23 as the live specification; read this section as the record of what it replaced.

- [ ] 20. OPTIONAL — Manual deal forms as a stage fallback

  - [ ]* 20.1 Add the escrow creation form behind a feature flag
    - Buyer, seller, token, amount, acceptance criteria, and deadline fields; visible copy stating the manual path is a fallback and the protocol's normal path is agent-driven over MCP
    - _Commit: `feat(fallback): add a flagged manual escrow creation form`_
    - _Requirements: 19.1, 19.3_

  - [ ]* 20.2 Add the deliverable submission form
    - Submit a deliverable for an existing deal identifier
    - _Commit: `feat(fallback): add a flagged deliverable submission form`_
    - _Requirements: 19.2_

- [ ] 21. OPTIONAL — Wallet connection

  - [ ]* 21.1 Add the connect control behind a feature flag
    - Request accounts from an injected Ethereum provider
    - _Commit: `feat(wallet): add a flagged injected-provider connect control`_
    - _Requirements: 20.1_

  - [ ]* 21.2 Display the connected address through `MachineValue`
    - Mono with truncation, full value on copy
    - _Commit: `feat(wallet): display the connected address as a machine value`_
    - _Requirements: 20.2_

  - [ ]* 21.3 Add the wrong-network statement
    - State the required network and the action needed to switch when the connected chain is not Sepolia
    - _Commit: `feat(wallet): state the required network when the chain is wrong`_
    - _Requirements: 20.3_

## Notes

**The deploy-early tension, and how it is resolved.** A fixture-only deployment lands at task 8, immediately after the app shell and the first complete screen (the trust explorer), so there is a live URL before the majority of the work exists. A second, final deployment lands at task 18. This splits the difference between wanting a URL early and wanting the deploy step last in the sequence: the first deploy proves the pipeline and gives the presenter something to hand out, the second ships the finished surface. Both are foreground, user-driven, and leave `NEXT_PUBLIC_API_BASE` unset.

**Why `/` renders a route index until task 13.** The docket owns the home route, but it arrives sixth in the build order. Rather than ship a stub with invented figures, task 2.5's home page carries only its title, its one `lede` paragraph, and links to the routes that exist. Every commit between task 2 and task 13 therefore builds and deploys truthfully, and task 13.3 replaces the body rather than deleting a placeholder.

**Gated actions.** Tasks 8.2, 9.1, 18.2, 19.1, and 19.2 all begin by asking the user. No push, remote branch creation, or pull request happens without explicit approval for that specific operation, every time. The Vercel deploys run in the foreground with the user completing interactive authentication; they are never backgrounded or scripted. Local commits on `feat/frontend` need no approval.

**Property test file naming.** Property tests for a shared module land in one file per property, named `<module>.p<n>.test.ts`, so each test is one commit's worth of one concern and independent properties can be written in parallel. The test name carries its tag: `Feature: arbitra-frontend, Property {n}: {property text}`. Minimum 100 iterations per property.

**Build gates land with the tokens, not at the end.** Task 2.3 ships `check-copy.mjs`, `check-design.mjs`, and `check-bundle.mjs` before the first screen exists. Properties 32 and 33 are the ones that keep the design direction and the trust-model copy discipline holding past day one, and enforcing them retroactively would mean a large cleanup commit instead of a build failure on the commit that introduced the problem.

Landing the gates that early forces one detail in their design: the confinement rules are written as upper bounds. `text-ruling`, the ruling surface tokens, and the motion tokens must each appear in at most one file, so a count of zero passes and the build stays green from task 2.3 through task 10.1, including the first deployment at task 8.2. `VerdictBanner.tsx` raises each count to one at task 10.2, and task 11.4 is where the count is asserted to be exactly one. An equality rule would have made every commit between 2.3 and 10.2 unbuildable. `src/app/globals.css` is exempt from the mono and ruling-surface rules for the same reason: it declares those tokens, and declaring is not using.

**Commit hygiene is audited, not assumed.** Requirement 17's commit rules — one concern, Conventional Commit subject at 72 characters or fewer, a body where the diff does not explain itself, a green build at every commit, a commit after each meaningful unit of work — are satisfied by every task's `_Commit:` line as the work happens. Task 16.7 is the checkpoint that verifies they actually held, and it runs before the final gate run and before the gated push at 19.1, so a history problem surfaces while it is still local and cheap to correct.

**Per-screen design self-review.** Tasks 7.6, 11.5, 13.5, 14.3, and 15.8 are the five screens' Requirement 14.12 reviews. They are required sub-tasks, not optional, and each one either fills its checklist row unchanged or lands a `style:` commit whose body states what was revised.

**Optional sub-tasks.** Sub-tasks marked `*` can be skipped for a faster path to a working demo. Every test sub-task is marked optional; the canonicalizer property tests (3.3–3.9) and the fixture hash-equality test (4.14) are the ones worth keeping if only a few survive, because the hash logic is the submission's core claim. Property 43 (task 23.10) joins that short list: it is the test that keeps the write path and the verification claim from becoming two features that merely ship together.

**Requirements 19 and 20 were promoted and swapped.** They are no longer optional and no longer behind a feature flag. Requirement 19 is now wallet connection and network; Requirement 20 is now deal origination and deliverable submission; Requirement 21 is new and holds that the write path must not compromise the read path. The numbers were held fixed so existing references stay valid, which means the old optional tasks 20 and 21 in the superseded section carry requirement citations that no longer mean what they meant when written. They are closed without work, not reinterpreted.

**Why the write path is not decoration.** The oracle was failing on settlement with `CALL_EXCEPTION / missing revert data` because the deal existed only as a Prisma row and `resolveEscrow` reverts when no funded escrow is recorded. Either the backend originates the escrow — holding a funded buyer key, which contradicts the trust model the contract exists to enforce — or the browser does, with the buyer signing for themselves. The second is truer and cheaper, so the frontend became the origination surface. Without it the settlement half of the protocol cannot run.

**The chain retargeted to Arc Testnet, 5042002, with USDC as gas.** Requirement 12 no longer names Sepolia. The explorer host has no default and arrives only through `NEXT_PUBLIC_EXPLORER_TX_BASE`; where it is unset the settlement reference degrades rather than guessing a host. The copy gate stops banning Arc as a network name (task 6.7), and the chain literals live in exactly one module (task 6.8). Every place the interface names the network interpolates the constant, which is what makes retargeting again a one-file change.

**Property 31 is superseded by Property 50 on the explorer default.** Property 31 asserts a default Sepolia transaction base under the pre-Arc targeting. Property 50 asserts the opposite: no host is substituted that was not configured. Property 31's wording is left unchanged because task 6.4 references it by number; where the two disagree about a default host, Property 50 governs, and task 6.3 is written to Property 50.

**Build order: the evidence screens stay first and the write path lands on top.** Tasks 22 and 23 sit physically between task 16 and task 17 and execute there. This is a deliberate choice over inserting them before the screens: the fixture deployment at task 8 and every commit after it stay demo-ready without a wallet, and a reviewer can judge the whole verification argument from a plain browser at any point in the build. The write path arrives when there is already a surface for it to write into.

**Numbering was preserved over sequential ordering.** Eight commits exist on `feat/frontend` and the execution history addresses tasks by `{id} {title}`, so renumbering would orphan that metadata and invalidate every dependency-graph entry. The new top-level tasks therefore take 22 and 23 even though they run before 17 through 19, and the Arc retarget takes 6.7 and 6.8 even though it runs before 2.6 and 6.3. Position in the file and position in the dependency graph carry the ordering; the identifiers carry the history. Where the two disagree, the graph is authoritative.

**One consequence for the final tail.** The final checkpoint (17), the release build and deployment (18), and the gated push and pull request (19) all execute after tasks 22 and 23, so the deployment and the pull request include the write path. The dependency graph places their waves accordingly rather than leaving them at the end of the wave list by number.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5", "3.1", "6.7", "6.8"] },
    { "id": 5, "tasks": ["2.6", "2.7", "2.8", "3.2"] },
    { "id": 6, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.13", "3.17"] },
    { "id": 7, "tasks": ["3.11", "3.12", "3.14", "3.15", "3.16", "4.1", "4.3"] },
    { "id": 8, "tasks": ["4.2", "4.4", "4.5", "4.6", "4.10"] },
    { "id": 9, "tasks": ["4.7", "4.8", "4.9", "4.11", "4.12", "4.13", "4.17"] },
    { "id": 10, "tasks": ["4.14", "4.15", "4.18"] },
    { "id": 11, "tasks": ["4.16", "6.1", "6.3", "6.5"] },
    { "id": 12, "tasks": ["6.2", "6.4", "6.6", "7.1"] },
    { "id": 13, "tasks": ["7.2", "7.3"] },
    { "id": 14, "tasks": ["7.4"] },
    { "id": 15, "tasks": ["7.5", "7.6"] },
    { "id": 16, "tasks": ["8.1"] },
    { "id": 17, "tasks": ["8.2"] },
    { "id": 18, "tasks": ["8.3"] },
    { "id": 19, "tasks": ["9.1"] },
    { "id": 20, "tasks": ["10.1", "10.2"] },
    { "id": 21, "tasks": ["10.3"] },
    { "id": 22, "tasks": ["10.4", "11.1"] },
    { "id": 23, "tasks": ["11.2", "11.3", "11.4"] },
    { "id": 24, "tasks": ["11.5"] },
    { "id": 25, "tasks": ["13.1"] },
    { "id": 26, "tasks": ["13.2", "13.3"] },
    { "id": 27, "tasks": ["13.4", "13.5"] },
    { "id": 28, "tasks": ["14.1"] },
    { "id": 29, "tasks": ["14.2", "14.3"] },
    { "id": 30, "tasks": ["15.1"] },
    { "id": 31, "tasks": ["15.2", "15.3"] },
    { "id": 32, "tasks": ["15.4", "15.5", "15.6", "15.7"] },
    { "id": 33, "tasks": ["15.8"] },
    { "id": 34, "tasks": ["16.1"] },
    { "id": 35, "tasks": ["16.2", "16.3", "16.4", "16.5", "16.6", "16.7"] },
    { "id": 36, "tasks": ["22.1"] },
    { "id": 37, "tasks": ["22.2", "22.6"] },
    { "id": 38, "tasks": ["22.4"] },
    { "id": 39, "tasks": ["22.3", "22.7"] },
    { "id": 40, "tasks": ["22.5", "22.9", "22.10"] },
    { "id": 41, "tasks": ["22.8", "23.1", "23.2"] },
    { "id": 42, "tasks": ["23.3", "23.5"] },
    { "id": 43, "tasks": ["23.4"] },
    { "id": 44, "tasks": ["23.6"] },
    { "id": 45, "tasks": ["23.7"] },
    { "id": 46, "tasks": ["23.8", "23.9"] },
    { "id": 47, "tasks": ["23.10", "23.11", "23.12", "23.13", "23.14", "23.15", "23.16"] },
    { "id": 48, "tasks": ["18.1"] },
    { "id": 49, "tasks": ["18.2"] },
    { "id": 50, "tasks": ["18.3"] },
    { "id": 51, "tasks": ["19.1"] },
    { "id": 52, "tasks": ["19.2"] },
    { "id": 53, "tasks": ["20.1", "21.1"] },
    { "id": 54, "tasks": ["20.2", "21.2"] },
    { "id": 55, "tasks": ["21.3"] }
  ]
}
```

Three notes on the waves, because two of them are not inferable from the numbering.

Wave 4 carries `6.7` and `6.8` alongside `2.5` and `3.1`. The copy gate retarget has to precede `2.6`, which tests the scanner, and `lib/chain.ts` has to precede `6.3` and the whole of task 22. Both write files nothing else in wave 4 touches.

Waves 36 through 47 hold tasks 22 and 23, and the previously final waves for tasks 18 and 19 shift to 48 through 52. The release build, the deployment, and the pull request run after the write path, which is the point of building it before them.

Waves 53 through 55 hold the superseded optional sub-tasks. They are retained so every existing identifier still appears exactly once; they are closed without work, so those waves are expected to be empty of actual execution.
