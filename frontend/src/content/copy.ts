/**
 * =============================================================================
 * `src/content/copy.ts` — every user-facing sentence, one module
 * =============================================================================
 *
 * WHY COPY IS CENTRALISED
 * -----------------------
 * Requirement 13 bans specific phrases and Requirement 16 prescribes the voice
 * of every error and empty state. Both are enforceable by a scanner only if the
 * copy is findable. Sentences scattered through JSX turn `check-copy.mjs` into a
 * fuzzy grep; naming them here makes it exact — a banned phrase can only enter
 * the interface through this file, and the scanner still reads the whole corpus
 * as a backstop.
 *
 * WHAT IS IN HERE NOW
 * -------------------
 * Only the shell and the trust-model statement: the navigation, the footer
 * boundary line, the interim home page, and the `/trust-model` route. Each later
 * screen extends this module in its own commit rather than declaring its copy
 * inline.
 *
 * THE LINE THIS FILE HOLDS
 * ------------------------
 * The escrow contract is the custody boundary that needs no trust. The language
 * model, the backend that stores each record, and the oracle key that settles a
 * deal are trusted infrastructure. Comparing hashes proves a stored record
 * matches its own hash. It does not prove what the model received, and it does
 * not prove the evaluation was honest. Every sentence below stays inside that
 * line, and so should every sentence added after it.
 *
 * ONE IMPORT, AND IT IS TYPES ONLY
 * --------------------------------
 * `ContractErrorName` is imported so the contract-error table can be checked
 * total over the ten errors the escrow contract declares. It is a type-only
 * import: this module stays a module of sentences, with no runtime dependency on
 * anything, and nothing here can start reaching for data.
 */

import type { ContractErrorName } from '@/types';

/* ===========================================================================
 * The application itself
 * ======================================================================== */

export const SITE = {
  name: 'Arbitra',
  /** Document title suffix and the footer wordmark's reading. */
  description:
    'The record of what two agents agreed, what was delivered, how a judge ruled, and how the escrow settled.',
} as const;

/* ===========================================================================
 * Routes
 *
 * ONE LIST, TWO SURFACES. The navigation and the route index on `/` both read
 * this array, so a route is added in one place and appears in both. That matters
 * more than it looks: an entry added here before its page exists ships a 404 to
 * a reviewer, and two hand-maintained lists is how that happens. A route joins
 * this list in the same commit as its `page.tsx`.
 *
 * `/` is labelled "Home" rather than "Docket" because the docket does not live
 * there yet. When it lands, the label changes with it.
 * ======================================================================== */

export interface RouteEntry {
  readonly href: string;
  readonly label: string;
  /** One sentence, shown in the route index on `/`. */
  readonly summary: string;
}

export const ROUTES: readonly RouteEntry[] = [
  {
    href: '/',
    label: 'Home',
    summary: 'This page. The live deal docket takes this route once it is built.',
  },
  {
    href: '/trust-model',
    label: 'Trust model',
    summary:
      'What the escrow contract enforces, what is trusted infrastructure, and what comparing hashes does and does not settle.',
  },
];

/* ===========================================================================
 * The shell
 * ======================================================================== */

export const NAV = {
  /** Names the landmark for a screen reader listing regions. */
  ariaLabel: 'Primary',
  skipToContent: 'Skip to the record',
} as const;

export const FOOTER = {
  /**
   * The trust boundary, on every screen. The word order is deliberate: the
   * contract is named as the boundary first, and the trusted parts are a
   * separate sentence, so neither reading of the pair can be lifted out as a
   * claim about the model.
   */
  boundary:
    'The escrow contract is the trustless custody boundary. The language model that judges a deliverable, the backend that stores the record, and the oracle key that settles the deal are trusted infrastructure.',
  linkLabel: 'Read the trust model',
} as const;

/* ===========================================================================
 * Shared control copy
 *
 * Strings that belong to a PRIMITIVE rather than to a screen. They live here for
 * the same reason every other string does — `check-copy.mjs` asserts that user
 * facing text is not inlined in components — but they differ from the screen
 * blocks above in that no single screen owns them.
 *
 * `copyPrefix` exists so a copy control's accessible name says WHAT it copies.
 * A hash strip renders a dozen of these; twelve buttons all named "Copy" is a
 * screen reader reading out a list with no way to tell the rows apart, so the
 * prefix is combined with the caller's label at the call site.
 * ======================================================================== */

export const COPY = {
  /** The idle label. Terse because it sits beside the value, not above it. */
  copy: 'Copy',

  /**
   * The confirmation, which replaces the label in place for ~1.4s. In place
   * rather than as a toast: the result of the action is already on screen, and a
   * portal plus a timer for that is ceremony.
   */
  copied: 'Copied',

  /** Combined with the caller's label for the accessible name. */
  copyPrefix: 'Copy',
} as const;

/* ===========================================================================
 * `/` — the hero above the docket
 *
 * Down to a title, a split heading, and one lede. The route index that used to
 * live here is gone: it existed only while the docket did not, and the masthead
 * reads `ROUTES` already. Two lists of the same links is one list too many.
 * ======================================================================== */

export const HOME = {
  title: 'Arbitra',

  /**
   * The hero heading, split so the second phrase can carry the application's
   * one gradient treatment. Split at a phrase boundary rather than mid-clause,
   * so the sentence still reads correctly if the gradient never paints.
   */
  headingLead: 'Every verdict leaves a hash',
  headingAccent: 'you can recompute.',

  lede: 'Two agents agree a deal over MCP, fund an escrow, deliver work, and have it judged. This interface is where that record is read afterwards, and where its hashes can be recomputed in your own browser.',
} as const;

/* ===========================================================================
 * The docket, and the figures above it
 *
 * Every string here is written against one constraint: nothing may read as a
 * fact the interface cannot support. The four figures are computed in the browser
 * from the deals payload and nothing else, so each carries a `provenance` line
 * naming what it was computed from, and each carries an `empty` sentence for the
 * case where the answer is genuinely nothing — Requirement 16.2, and the reason
 * `StatBlock` takes a sentence rather than rendering a dash.
 * ======================================================================== */

export const DOCKET = {
  heading: 'The docket',

  /**
   * Names the fixture cycle in plain terms. A reviewer who watches a deal move
   * from Funded to Settled and does not know the demo loops will read the second
   * pass as a bug; naming the loop costs one sentence and prevents that.
   */
  note: 'Deals are polled every 2.5 seconds. Against the bundled fixtures this deployment replays a 48-second cycle, so a deal you watch settle will appear again at the start of the next pass.',

  /** Shown once, before the first poll settles. Not an error. */
  loading: 'Requesting the docket.',

  /**
   * The seven groups always render. This says why an empty one is not a gap,
   * so a reader does not read six empty groups as six failures.
   */
  groupsNote:
    'All seven groups are listed whether or not they currently hold a deal, so an empty group tells you nothing is in that state rather than that something failed to load.',

  /** Per-group empty sentences. Each says what would put a deal in the group. */
  empty: {
    Created:
      'A deal appears here once its terms are registered on chain and before the buyer funds the escrow.',
    Funded:
      'A deal appears here once the buyer has funded the escrow and while the seller still has time to deliver.',
    Submitted:
      'A deal appears here once the seller submits a deliverable and while it waits to be judged.',
    Deliberating:
      'A deal appears here while a judge evaluation is in flight. This group is derived by this interface, not read from the contract, and it stays empty unless the backend records when a judge call was requested.',
    ResolvedSuccess:
      'A deal appears here once the oracle resolves it in the seller’s favour and the escrow pays out.',
    ResolvedRefund:
      'A deal appears here once the oracle resolves it in the buyer’s favour and the escrow refunds. A refund is a settlement, not a failure.',
    ExpiredRefund:
      'A deal appears here once its deadline passes with no deliverable, or once the oracle misses its grace period after one was submitted.',
  },

  /** The derived-group notice, on the `Deliberating` group only. */
  derivedGroupNote:
    'Not an on-chain state. This interface infers it from a submitted deal with a judge request recorded and no verdict yet.',
} as const;

export const STATS = {
  heading: 'Computed from this deployment’s deals',

  /**
   * One sentence over the whole row. It says the figures are the interface’s own
   * arithmetic — which is also what the dotted rule on each block says without
   * words, for a reader who has learnt the vocabulary.
   */
  note: 'Each figure below is computed in your browser from the deals the docket is showing. None is read from a shipped endpoint, and none is a placeholder.',

  settledCount: {
    label: 'Deals settled',
    provenance: 'Counted from deals in a terminal state.',
    empty: 'No deal in the current set has reached a terminal state yet.',
  },
  settledValue: {
    label: 'USDC settled',
    provenance: 'Summed in base units across settled deals.',
    empty: 'Nothing has settled yet, so there is no total to sum.',
  },
  inEscrow: {
    label: 'USDC in escrow',
    provenance: 'Summed across funded and submitted deals.',
    empty: 'No deal is currently holding funds in escrow.',
  },
  onDocket: {
    label: 'Deals on the docket',
    provenance: 'Counted from the last successful poll.',
    empty: 'The last poll returned no deals.',
  },
} as const;

/* ===========================================================================
 * The refund-availability sentence (Requirement 16.6)
 *
 * ONE SENTENCE, THREE PLACES. It is standing copy on the deal record and the
 * docket, and it is also the refund clause in the trust-model's list of what the
 * contract enforces. Declared here, above `TRUST_MODEL`, so that list can
 * interpolate it rather than restate it: a reader who meets the sentence twice
 * should meet the same sentence, and two hand-maintained copies of a
 * requirement-mandated line is how that stops being true.
 *
 * Both cases are named because a reader who knows only the first will read the
 * second as a bug. The seller missing the deadline is the obvious one; the
 * oracle failing to resolve a deal that WAS delivered on time is the one that
 * looks like the protocol losing track of a deal, and it is the case the
 * contract's grace period exists for.
 *
 * The two contract errors that guard those cases — `DeadlineNotPassed` and
 * `OracleGracePeriodNotPassed` — close with the same clause, so the error a
 * reviewer hits early agrees with the standing copy rather than reading as a
 * different rule.
 * ======================================================================== */

export const REFUND_AVAILABILITY =
  'A buyer refund becomes available in two cases: the seller misses the deadline without submitting, or the oracle does not resolve the deal within its grace period after submission.';

/* ===========================================================================
 * `/trust-model` — the boundary statement
 *
 * A route rather than a modal, because this is the claim the rest of the
 * interface rests on and it should have a URL a reviewer can cite.
 * ======================================================================== */

export const TRUST_MODEL = {
  title: 'Trust model',
  lede: 'Arbitra does not remove trust from judging. It puts a boundary in a known place and names both sides of it.',

  enforcedHeading: 'Enforced by the escrow contract',
  enforcedLede:
    'These hold whatever the backend, the model, or the oracle operator would prefer, because the contract is the only thing that can move the funds.',
  enforced: [
    'Custody. Escrowed tokens sit in the contract. No off-chain component can move them.',
    'Two outcomes. Funds are released to the seller or returned to the buyer. There is no third destination.',
    'Authority to resolve. Only the oracle address registered with the contract can resolve a deal.',
    `Refund conditions. ${REFUND_AVAILABILITY}`,
    'A committed hash. Resolving a deal writes the verdict reasoning hash into contract storage, where it cannot be revised afterwards.',
  ],

  trustedHeading: 'Trusted infrastructure',
  trustedLede:
    'Each of these could be wrong or dishonest without the contract noticing. They are listed so the reader knows where to aim their scepticism.',
  trusted: [
    'The language model that judges a deliverable. It can misread the work, and it can be steered by instructions hidden inside the text it was asked to evaluate.',
    'The backend that stores the evaluation prompt, the raw model response, and the reasoning. The chain holds a hash of that record, not the record itself.',
    'The oracle key. Whoever holds it chooses which of the two contract outcomes is called, and the contract checks only that the caller is the registered oracle.',
    'The account of what was sent to the model. Nothing outside the backend observed the prompt at the time it was sent.',
  ],

  provesHeading: 'What comparing hashes settles',
  proves:
    'Recomputing a record in your browser and finding your hash equal to the stored hash and to the hash on-chain makes that record tamper-evident: the bytes you were shown are the bytes that were committed, and nothing has been edited since.',
  doesNotProve:
    'It does not prove what the model received, and it does not prove the model was honest or correct. A judgment can be recorded faithfully and still be wrong. The comparison is about the record, not about the reasoning inside it.',
  scope:
    'That is the whole of the guarantee, and it is worth being plain about the size of it. Hashes make the boundary inspectable. They do not extend it.',
} as const;

/* ===========================================================================
 * The three-way hash comparison
 *
 * `lib/verify.ts` computes which of the three sources stands apart; these are
 * the sentences that say so. They live here rather than inline in that module
 * for the reason at the top of this file: a sentence a reviewer will read has to
 * be findable, and the scanner has to be able to see all of them at once.
 *
 * Each sentence names ONE SOURCE as the odd one out and says what the other two
 * did, because that is the diagnostically useful shape. "Two values disagree" is
 * true of most mismatches and tells a reader nothing about where to look.
 *
 * Three words are used carefully here and should stay that way. "This browser"
 * rather than "the client", because the point is that the reader's own machine
 * did the arithmetic. "The chain" rather than "the contract", because what is
 * being cited is the committed value, not the code that holds it. And a match is
 * reported as tamper-evident, never as anything stronger: agreement shows the
 * record matches its hash and says nothing about the judging.
 * ======================================================================== */

export const VERIFY_COMPARISON = {
  /**
   * Keyed by the disagreement kinds in `lib/verify.ts`. That module annotates
   * this object as a total mapping over those kinds, so a kind added there
   * without a sentence added here does not compile.
   */
  disagreeing: {
    'stored-differs':
      'The backend record disagrees with both this browser and the chain. This browser recomputed the same value the chain committed, and the stored value is the one that stands apart.',
    'onchain-differs':
      'The chain disagrees with both this browser and the backend record. The record matches its own recomputation, and the value committed on-chain is the one that stands apart.',
    'recomputed-differs':
      'This browser disagrees with both the backend record and the chain. The stored value and the committed value agree with each other, so the recomputation here is the one that stands apart.',
    'all-differ':
      'All three sources disagree with each other. No two of the recomputed, stored, and committed values are equal.',
  },
} as const;

/* ===========================================================================
 * Failures — cause and recovery (Requirements 16.3, 16.4, 16.7, 11.6)
 *
 * Every failed request produces two sentences, never one: what broke, and what
 * the reader can do about it. `lib/errorCopy.ts` is the typed mapping from the
 * `ApiError` union onto this table, and that split is the point — the union is
 * closed and the mapping's return type is not optional, so a new error kind
 * without an entry here is a compile error rather than an empty panel in front
 * of a reviewer.
 *
 * THE RECOVERY LINE IS NOT DECORATION. Each one is either an action the reader
 * can actually take, or a plain statement that there is none. A recovery that
 * says "please try again" on a failure a retry cannot fix wastes the reader's
 * time and teaches them to stop reading the panel. Two lines here are worth
 * reading twice for that reason:
 *
 *   - The 500 line ends by saying the interface cannot see the backend's logs.
 *     That sentence exists to send a reviewer away from the browser devtools,
 *     which is where they will otherwise spend ten minutes.
 *   - The 502 line says the failure is upstream of the interface AND upstream of
 *     the backend, so nobody debugs either.
 *
 * INTERPOLATION, AND WHY SOME ENTRIES ARE FUNCTIONS. A sentence that names a
 * value the interface only learns at runtime — an identifier, a configured
 * origin, a guard's name — is written here as a template function rather than
 * assembled from fragments at the call site. The whole sentence stays in this
 * file, which is what keeps the copy gate exact and what lets a reviewer read
 * the interface's voice in one place.
 *
 * ONE ENVIRONMENT VARIABLE IS DELIBERATELY NOT NAMED HERE. The 401 recovery
 * interpolates the variable name from the error itself. The copy gate permits
 * that name to appear in exactly one module under `src/`, and that module is the
 * one that reads it; spending the budget on a copy string would leave the real
 * reader unable to name what it reads. `types.ts` carries the same note on the
 * `unauthorized` member.
 * ======================================================================== */

export const API_ERROR_COPY = {
  /**
   * `fetch` threw — the configured origin did not answer at all.
   *
   * `base` is blank when nothing is configured and the deployment is serving its
   * own mock routes same-origin. There is no host to name in that case, so the
   * sentence names the deployment instead of rendering a gap where a URL should
   * be.
   */
  network: {
    cause: (base: string) =>
      base === ''
        ? 'This deployment did not answer its own request.'
        : `The backend at ${base} did not answer.`,
    recovery:
      'Check that NEXT_PUBLIC_API_BASE points at a running backend, or unset it to read fixture data from this deployment.',
  },

  /**
   * 400. THE CAUSE IS THE BACKEND'S OWN TEXT, VERBATIM — it knows what it
   * rejected, and paraphrasing it here would put this file between the reader
   * and the only party that has the answer. The fallback below is used only when
   * the response carried no text at all.
   */
  badRequest: {
    causeFallback: 'The backend rejected this request and returned no explanation.',
    /** The backend named the offending input, so the recovery names it too. */
    recoveryWithField: (field: string) => `Correct the ${field} and send it again.`,
    /** It did not, so the message above is the only pointer available. */
    recovery: 'Correct the input named in the message above and send it again.',
  },

  /**
   * 401 from a settlement-capable route. Worth stating that nothing settled: the
   * judge may well have run, and a reviewer who reads this as a total failure
   * will look for a verdict that does in fact exist.
   */
  unauthorized: {
    cause: 'This deployment has no settlement authorization, so nothing was settled.',
    recovery: (envVar: string) => `Set ${envVar} on the server and redeploy.`,
  },

  /**
   * 404, per resource. Which lookup failed is the useful half of the message;
   * "not found" alone leaves a reader guessing whether the deal, the judgment,
   * or the agent is the missing one.
   *
   * ONE RECOVERY COVERS FOUR CAUSES, and it is the same in each case for a real
   * reason rather than for brevity: every one of these records comes into
   * existence either because an identifier was right or because the oracle has
   * resolved a deal. A reputation record is no exception — an agent has no
   * record until one of its deals is resolved.
   */
  notFound: {
    cause: {
      deal: (id: string) => `No deal is recorded under ${id}.`,
      judgment: (id: string) => `No judgment record exists for deal ${id}.`,
      /**
       * The one sentence that does not name the identifier, and it takes the
       * parameter anyway so all four share a signature. A preimage lookup only
       * happens from a deal's own screen, where "this deal" is unambiguous and
       * repeating the identifier back at the reader adds a hash to a sentence
       * for no gain.
       */
      preimage: (_id: string) => 'The canonical preimage for this deal is not on record.',
      agent: (id: string) => `No reputation record exists for ${id}.`,
    },
    recovery: 'Check the identifier, or wait for the oracle to resolve this deal.',
  },

  /** 500. The one recovery that tells the reader to stop looking at the browser. */
  server: {
    cause: 'The backend failed while handling this request.',
    recovery:
      'Retry. If it persists, the backend logs will name the failure; the interface cannot see them.',
  },

  /** 502. Two layers away, and the recovery says so rather than implying a fix. */
  upstream: {
    cause:
      'The backend reached its upstream — the model provider or an RPC node — and got an error back.',
    recovery: 'Retry. This is upstream of the interface and upstream of the backend.',
  },

  /**
   * 503. Up, but not ready. A retry genuinely does help here, which is why this
   * is the one recovery that asks for one without qualification.
   */
  unavailable: {
    cause: 'The backend is up but not ready to serve this request.',
    /** `delay` is a phrase, not a number — one of the two below. */
    recovery: (delay: string) => `Retry in ${delay}. Polling continues automatically.`,
    /** No retry delay was supplied, so no figure is invented. */
    unspecifiedDelay: 'a few seconds',
    /** One was. Whole seconds, pluralised. */
    seconds: (whole: number) => (whole === 1 ? '1 second' : `${whole} seconds`),
  },

  /**
   * The response arrived, parsed, and failed its shape guard. `expected` is the
   * guard's name, so the sentence names the shape that was wanted instead of
   * reporting a generic parse failure.
   *
   * The recovery is the blunt one, and it should stay blunt. A drifted field name
   * is a contract change, not a transient fault, and no amount of retrying moves
   * it. Naming the file that settles the disagreement is the whole of the action.
   */
  malformed: {
    cause: (expected: string) =>
      `The backend answered, but the response did not match the shape ${expected}.`,
    recovery: 'The backend and types.ts have drifted. types.ts is the contract.',
  },
} as const;

/* ===========================================================================
 * Contract errors (Requirement 16.5)
 *
 * The escrow contract signals failure with ten parameterless custom errors.
 * Relayed to the interface when a settlement attempt reverts, each one arrives
 * as nothing but a name.
 *
 * TEN DISTINCT MESSAGES, AND NONE OF THEM RESTATES ITS OWN NAME. A panel reading
 * "InvalidState" tells a reader precisely what they already knew from the fact
 * that something failed. So every message below names the ACTOR whose authority
 * or turn it was, or the CONDITION that was not met — the two things a reader
 * needs in order to know whether to wait, to fix an input, or to stop.
 *
 * The recovery halves divide cleanly into three groups, and the division is
 * worth keeping visible when these are edited: an input to correct
 * (`InvalidAddress`, `InvalidAmount`, `InvalidDuration`, `InvalidDealId`,
 * `DealAlreadyExists`), a wait with a defined end (`DeadlineNotPassed`,
 * `OracleGracePeriodNotPassed`), and nothing at all (`Unauthorized`,
 * `InvalidState`, `DeadlinePassed`). The third group says so outright. Offering
 * a retry there would be offering a reader a button that cannot work.
 * ======================================================================== */

export const CONTRACT_ERROR_COPY = {
  Unauthorized: {
    message:
      'Only the registered oracle can resolve a deal. The address that signed this call is not that oracle.',
    recovery:
      'Nothing in this interface can settle a deal, and nothing it does can change that. Check which address the backend signs with, and whether the contract has that address registered as its oracle.',
  },

  InvalidAddress: {
    message:
      'An address in this call is the zero address or malformed. Buyer, seller, and token must all be non-zero addresses.',
    recovery:
      'Replace the empty or malformed address with a real one and send the deal again. All three are required, and none of them may be zero.',
  },

  InvalidAmount: {
    message: 'The escrow amount must be greater than zero.',
    recovery: 'Enter an amount above zero and send the deal again.',
  },

  InvalidDuration: {
    message:
      "The deadline is outside the range the contract accepts. It must be far enough in the future and within the contract's maximum term.",
    recovery:
      'Move the deadline further out if it was too close, or nearer if it exceeded the maximum term, and send the deal again.',
  },

  InvalidDealId: {
    message: 'A deal identifier must be 32 bytes of non-zero hex.',
    recovery:
      'Derive the identifier as a hash rather than writing a name into the field, and send the deal again.',
  },

  DealAlreadyExists: {
    message: 'A deal is already recorded under this identifier. Identifiers cannot be reused.',
    recovery:
      'Derive a fresh identifier for this deal. The recorded one belongs to the earlier deal and keeps it.',
  },

  /**
   * The one message with a variable body. `lib/errorCopy.ts` fills the two state
   * names when the backend relays them and uses `messageWithoutStates` when it
   * does not, so an absent detail costs the reader the specifics rather than
   * showing them a sentence with two gaps in it.
   */
  InvalidState: {
    messageWithoutStates: "This action is not available from the deal's current state.",
    message: (current: string, required: string) =>
      `This action is not available from the deal's current state. The deal is ${current}; this action requires ${required}.`,
    recovery:
      'Open the deal record to see where it actually stands. The action becomes available when the deal reaches the state it needs, and only the buyer, the seller, or the oracle can move it there.',
  },

  DeadlinePassed: {
    message:
      'The deadline has passed, so the seller can no longer submit a deliverable. The buyer can now claim a refund.',
    recovery:
      'The submission window is closed and cannot be reopened. The buyer claiming a refund is the remaining path.',
  },

  DeadlineNotPassed: {
    message: 'The deadline has not passed yet. A buyer refund becomes available once it does.',
    recovery:
      'Wait for the deadline. Until it passes the seller still holds the right to submit, and the contract will not release the funds either way.',
  },

  OracleGracePeriodNotPassed: {
    message:
      'The oracle still has time to resolve this deal. A buyer refund becomes available once the grace period ends.',
    recovery:
      'Wait for the oracle to resolve the deal, or for the grace period to run out. Nothing can shorten it, and the refund path opens by itself when it ends.',
  },

  /**
   * `satisfies` rather than a type annotation, and the difference is the whole
   * reason it is written this way: the annotation would check totality and then
   * FLATTEN the table, collapsing `InvalidState.message` from a two-argument
   * template into `string` and the other nine into the same. `satisfies` checks
   * that all ten names are present with a recovery each, and leaves every literal
   * and every signature intact for `lib/errorCopy.ts` to read.
   *
   * A name added to `ContractErrorName` without copy fails here, at the table,
   * rather than at the one call site that happened to index it.
   *
   * The index signature is what lets each entry keep its own message shape.
   * `satisfies` applies excess-property checking, so without it the nine plain
   * `message` strings and `InvalidState`'s two variants would each be reported as
   * an unknown property. What is being asserted is "ten names, each with a
   * recovery", and the index signature says exactly that and no more.
   */
} as const satisfies Record<
  ContractErrorName,
  { readonly recovery: string; readonly [detail: string]: unknown }
>;

/* ===========================================================================
 * `/deals/:dealId` — the verdict record
 *
 * The screen that has to be most careful about what it claims. It shows a judge's
 * verdict alongside the hashes the chain holds, and the gap between "these hashes
 * agree" and "this evaluation was sound" is where a reader can be misled by
 * confident wording.
 *
 * So the vocabulary is fixed here and used nowhere else:
 *
 *   TAMPER-EVIDENT, never "verified". Agreement shows the stored record matches
 *   its own hash. It does not show what the model received, and it does not show
 *   the evaluation was honest.
 *
 *   The exhibit notes state which fields the digest commits to and which it
 *   omits, because the `rule/hashed` and `rule/excluded` borders say the same
 *   thing without words and a reader meeting the vocabulary for the first time
 *   needs it spelled out once.
 * ======================================================================== */

export const DEAL = {
  /** Above the record. The identifier follows as a machine value. */
  heading: 'Verdict record',

  /** Shown while the first request is outstanding. */
  loading: 'Requesting the record.',

  /**
   * The unresolved case, which is the common one on a live docket. Not an error:
   * a funded deal has no verdict yet, and saying so is the correct answer.
   */
  noJudgment:
    'No verdict has been recorded for this deal yet. A record appears here once a judge evaluation has been stored, which for a deal still awaiting delivery or judgment has not happened.',

  lifecycleHeading: 'Lifecycle',

  termsHeading: 'Deal terms',
  termsNote:
    'Read from the contract. The criteria hash below is the buyer’s on-chain commitment to the acceptance criteria, and it is the value the verify panel compares against a hash recomputed from the criteria themselves.',

  evidenceHeading: 'Evidence',
  evidenceNote:
    'Every exhibit is shown in full and none is summarised. A solid left rule marks content the verdict hash commits to; a dashed rule marks recorded metadata the hash deliberately omits.',

  /** Per-exhibit labels and notes. */
  exhibits: {
    criteria: {
      label: 'Acceptance criteria',
      note: 'The buyer’s terms, in the order they were agreed. Order is part of the agreement and is preserved when the hash is computed.',
    },
    deliverable: {
      label: 'Deliverable',
      note: 'The seller’s submitted work, verbatim.',
    },
    reasoning: {
      label: 'Reasoning',
      note: 'The judge’s stated justification for the outcome.',
    },
    prompt: {
      label: 'Evaluation prompt',
      note: 'The exact prompt recorded for this evaluation. It is inside the hash, so it cannot be edited after the fact without breaking the commitment. That is not the same as proof the model received it — nothing outside the backend can attest to that.',
    },
    response: {
      label: 'Raw model response',
      note: 'The model’s unedited output.',
    },
    model: {
      label: 'Model',
      note: 'Identity and version, both inside the hash, so a record cannot be silently reattributed to a different model.',
    },
    recordedAt: {
      label: 'Recorded at',
      note: 'Excluded from the hashed payload. That exclusion is what makes the digest reproducible: rehash the same inputs tomorrow and you get the same value. Include the timestamp and every recomputation fails.',
    },
  },

  hashesHeading: 'Commitments',
  hashesNote:
    'The three hashes stored with this record. The verify panel recomputes each one in your browser and compares it against what the chain holds.',

  settlementHeading: 'Settlement',
  settlementLinkLabel: 'Open the settlement transaction',
  settlementNoExplorer:
    'No block explorer host is configured for this deployment, so the transaction hash is shown as a copyable value rather than a link. Set NEXT_PUBLIC_EXPLORER_TX_BASE to turn it into one. A guessed host would produce a confident link to a page that does not exist.',
  settlementPending:
    'This deal has not been settled on chain yet, so there is no transaction to reference.',

  /**
   * The handoff to the verify panel. Worded as an invitation to do the work
   * locally, because that is the distinction the next screen rests on: the record
   * screen shows the commitments, the verify screen recomputes them in the
   * reader's own browser.
   */
  verifyLinkLabel: 'Recompute these hashes in your browser',
} as const;

/* ===========================================================================
 * `/deals/:dealId/verify` — the three-way comparison, as a screen
 *
 * `VERIFY_COMPARISON` above holds the disagreement sentences. This block holds
 * everything else the screen says: the row labels, the source labels, the
 * per-source outcome phrases, and the two conclusion statements.
 *
 * THE SOURCE LABELS ARE THE MOST CAREFULLY WORDED STRINGS ON THIS SCREEN. Each
 * one has to make plain WHO produced the value, because the entire argument of the
 * screen is that three independent parties agree. "Recomputed in this browser"
 * rather than "computed" — the reader's own machine did it. "Committed on-chain"
 * rather than "from the contract" — what is cited is the immutable value, not the
 * code holding it.
 *
 * THE BACKEND'S FLAG GETS A LABEL THAT SAYS IT IS NOT USED. Requirement 8.7 keeps
 * it out of the conclusion in code; this copy keeps it out of the conclusion in
 * the reader's mind, which matters just as much when a reviewer is deciding
 * whether to believe the screen.
 * ======================================================================== */

export const VERIFY = {
  heading: 'Recompute the hashes',

  lede: 'Three parties committed to this record: the backend that stored it, the contract that settled it, and — right now, in your browser — you. Every hash below is recomputed locally from the record’s own bytes and compared against both stored values.',

  loading: 'Requesting the record and the deal.',

  /** No stored record. Common, and not a failure. */
  noRecord:
    'No judge record has been stored for this deal, so there is nothing to recompute yet. A comparison appears here once a verdict has been recorded.',

  /** Row group headings, naming the chain-side field where it differs. */
  rows: {
    rubric: {
      label: 'Acceptance criteria',
      note: 'Recomputed from the criteria themselves. The backend stores this as rubricHash; the contract commits to it as criteriaHash. Two names, one commitment.',
    },
    deliverable: {
      label: 'Deliverable',
      note: 'Recomputed from the submitted work. Named deliverableHash by both the record and the contract.',
    },
    verdict: {
      label: 'Verdict',
      note: 'Recomputed from the seventeen-field preimage, which excludes the timestamp — that exclusion is what makes the digest reproducible. The backend stores it as verdictHash; the contract commits to it as verdictReasoningHash.',
    },
  },

  /** Who produced each value. See the note above on the wording. */
  sources: {
    recomputed: 'Recomputed in this browser',
    stored: 'Stored by the backend',
    onChain: 'Committed on-chain',
  },

  /** Per-row outcome phrases, paired with the agreement each row reports. */
  outcomes: {
    agrees: 'Agrees with the other sources',
    differs: 'Stands apart from the other sources',
    notCompared: 'Not compared — nothing committed on-chain yet',
    notCommitted: 'Not committed on-chain yet',
  },

  conclusionHeading: 'Conclusion',

  /** The two conclusions. There is no third, and no "unknown". */
  tamperEvident:
    'Tamper-evident. Every hash you recomputed here matches what the backend stored and what the chain committed, so the bytes you were shown are the bytes that were committed.',
  mismatch:
    'Mismatch. At least one value that exists disagrees with the others. The row notes above name which source stands apart, which is the layer to go and look at.',

  /**
   * The scope sentence, which travels with every match. Agreement is about the
   * record, not about the judging, and this is where that is said out loud.
   */
  conclusionScope:
    'This is a statement about the record, not about the reasoning inside it. It does not prove what the model received, and it does not prove the evaluation was sound. A judgment can be recorded faithfully and still be wrong.',

  /** The backend's own flag, displayed and explicitly not used. */
  backendFlagHeading: 'The backend’s own assessment',
  backendFlagNote:
    'Shown because it is part of the response, and read by nothing that produces the conclusion above. The value of recomputing in your browser disappears if the answer comes from the party being checked.',
  backendFlagTrue: 'The backend reports this record as verified.',
  backendFlagFalse: 'The backend reports this record as not verified.',
  backendFlagAbsent: 'The response carried no assessment. That is different from reporting false.',

  recordLinkLabel: 'Back to the verdict record',
} as const;
