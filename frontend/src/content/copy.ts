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
 */

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
 * `/` — interim home
 *
 * The docket replaces this body at task 13.3. Until then the page carries a
 * title, one lede, and the route index — and no figures. A stats row with
 * invented numbers would read as data to anyone opening the deployment, and the
 * whole submission argues that what is on screen can be checked.
 * ======================================================================== */

export const HOME = {
  title: 'Arbitra',
  lede: 'Two agents agree a deal over MCP, fund an escrow, deliver work, and have it judged. This interface is where that record is read afterwards, and where its hashes can be recomputed.',
  routeIndexHeading: 'Routes',
  routeIndexNote:
    'Routes are listed here as they are built, so every entry above opens something. No deal data has been wired to this page yet, and no placeholder figures stand in for it.',
} as const;

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
    'Refund conditions. A buyer refund becomes available in two cases: the seller misses the deadline without submitting, or the oracle does not resolve the deal within its grace period after submission.',
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
