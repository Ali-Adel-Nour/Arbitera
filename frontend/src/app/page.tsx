/**
 * `/` — the interim home.
 *
 * The docket takes this route at task 13.3. Until then the page is a title, one
 * `lede` paragraph, and an index of the routes that exist. Nothing else.
 *
 * WHY NO STATS ROW YET
 * --------------------
 * The final design opens this screen with four figures — deals settled, total
 * USDC settled, dispute rate, agents indexed. Every one of them is derived from
 * deal data that has not been wired up yet, and standing them up with plausible
 * numbers would put four unverifiable figures on the first screen of an
 * application whose entire argument is that what you are shown can be checked.
 * An honest empty page is a smaller cost than a dishonest full one, and the
 * deployment is public from task 8.2 onward.
 *
 * WHY THE ROUTE INDEX READS `ROUTES`
 * ----------------------------------
 * The same array the masthead reads, so a link cannot exist in one surface and
 * not the other, and a route cannot be advertised before its `page.tsx` lands.
 * Right now that is `/` and `/trust-model`. Every other screen in the design
 * adds its own entry in its own commit; listing them here early would ship 404s
 * to whoever opens the deployment first.
 *
 * NO RULE TOKENS ON THE INDEX. Each of the seven is a statement about a record
 * — inside the hashed preimage, excluded from it, computed here, end of one
 * record. A list of routes is none of those things, and borrowing the
 * nearest-looking token would spend vocabulary the record screens need. Space
 * does the separating.
 */

import Link from 'next/link';

import { HOME, ROUTES } from '@/content/copy';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 pb-4">
      <header className="flex flex-col gap-5">
        {/* The one gradient-treated heading phrase in the application. It is
            decorative: the sentence is legible as one heading wherever the
            colour lands, and the phrase marks no field and encodes no state. */}
        <h1 className="text-display text-hi max-w-[24ch]">
          {HOME.headingLead}{' '}
          <span className="gradient-heading">{HOME.headingAccent}</span>
        </h1>
        <p className="text-lede text-muted max-w-[62ch]">{HOME.lede}</p>
      </header>

      <section aria-labelledby="route-index" className="flex flex-col gap-5">
        <h2 id="route-index" className="text-heading">
          {HOME.routeIndexHeading}
        </h2>

        {/* A description list, not a joined meta string: destination as the term,
            what it holds as the description. */}
        <dl className="flex max-w-[68ch] flex-col gap-4">
          {ROUTES.map((route) => (
            <div key={route.href} className="flex flex-col gap-1">
              <dt className="text-body">
                <Link
                  href={route.href}
                  className={`underline decoration-1 underline-offset-4 ${FOCUS}`}
                >
                  {route.label}
                </Link>
              </dt>
              <dd className="text-meta text-muted">{route.summary}</dd>
            </div>
          ))}
        </dl>

        <p className="text-meta text-muted max-w-[68ch]">{HOME.routeIndexNote}</p>
      </section>
    </div>
  );
}
