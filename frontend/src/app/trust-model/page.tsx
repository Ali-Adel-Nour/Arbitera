/**
 * `/trust-model` — the boundary statement.
 *
 * A route rather than a modal. This is the claim the rest of the submission
 * rests on, so it gets a URL a reviewer can cite, and the footer of every screen
 * links to it.
 *
 * WHERE THE BOUNDARY RULE SITS
 * ----------------------------
 * `rule/boundary` reads "above: enforced by the contract; below: trusted
 * infrastructure". On this page it is placed on the top edge of the trusted
 * section, which is the one position where both halves of that sentence are
 * literally true of what surrounds it: the contract-enforced list is above, the
 * trusted list is below. It appears once here and once in the shell footer, and
 * the token is documented as appearing at most twice per screen.
 *
 * THE THREE PARTS, IN THIS ORDER
 * ------------------------------
 * What the contract enforces, then what is trusted, then what a hash comparison
 * does and does not settle. The order is the argument: state the guarantee,
 * state its limit, then size the tool. Reversing it would let a reader take the
 * verification section as a claim about the model, which is exactly the
 * overclaim Requirement 13 exists to prevent.
 *
 * No display type, no dark surface, no motion. This page makes its case in
 * sentences.
 */

import type { Metadata } from 'next';

import { TRUST_MODEL } from '@/content/copy';

export const metadata: Metadata = {
  title: TRUST_MODEL.title,
  description: TRUST_MODEL.lede,
};

/** One measure for every prose block on the page, so the column never widens. */
const MEASURE = 'max-w-[68ch]';

function Clauses({ items }: { items: readonly string[] }) {
  return (
    <ul className={`${MEASURE} flex flex-col gap-3`}>
      {items.map((item) => (
        <li key={item} className="text-body">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function TrustModelPage() {
  return (
    <div className="flex flex-col gap-12 pb-4">
      <header className="flex flex-col gap-4">
        <h1 className="text-screen">{TRUST_MODEL.title}</h1>
        <p className={`text-lede ${MEASURE}`}>{TRUST_MODEL.lede}</p>
      </header>

      <section aria-labelledby="enforced" className="flex flex-col gap-4">
        <h2 id="enforced" className="text-heading">
          {TRUST_MODEL.enforcedHeading}
        </h2>
        <p className={`text-body text-ink-muted ${MEASURE}`}>{TRUST_MODEL.enforcedLede}</p>
        <Clauses items={TRUST_MODEL.enforced} />
      </section>

      {/* The trust boundary itself. Above: the list the contract enforces.
          Below: the list that is trusted.

          The rule lives on a wrapper rather than on the section, because
          `rule-boundary` sets its own `padding-block-start` to hold the 2px gap
          and the 1px trailing rule. Adding `pt-8` to the same element would
          overwrite that padding and swallow the third part of the rule, so the
          spacing goes on the child. */}
      <div className="rule-boundary">
        <section aria-labelledby="trusted" className="flex flex-col gap-4 pt-8">
          <h2 id="trusted" className="text-heading">
            {TRUST_MODEL.trustedHeading}
          </h2>
          <p className={`text-body text-ink-muted ${MEASURE}`}>{TRUST_MODEL.trustedLede}</p>
          <Clauses items={TRUST_MODEL.trusted} />
        </section>
      </div>

      <section aria-labelledby="proves" className="flex flex-col gap-4">
        <h2 id="proves" className="text-heading">
          {TRUST_MODEL.provesHeading}
        </h2>
        <p className={`text-body ${MEASURE}`}>{TRUST_MODEL.proves}</p>
        <p className={`text-body ${MEASURE}`}>{TRUST_MODEL.doesNotProve}</p>
        <p className={`text-meta text-ink-muted ${MEASURE}`}>{TRUST_MODEL.scope}</p>
      </section>
    </div>
  );
}
