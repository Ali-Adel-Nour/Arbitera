/**
 * `/` — the courtroom docket.
 *
 * The hero stays a server component and the docket is the client boundary. That
 * split is deliberate rather than incidental: the heading and the lede are static
 * text with no state, so shipping them as client JavaScript would pay for
 * hydration to render two paragraphs that never change. The polling loop is the
 * only thing on this screen that needs to be interactive, and it is the only thing
 * inside a `'use client'` module.
 *
 * THE ROUTE INDEX IS GONE from this page. It existed while the docket did not, so
 * the first screen of the deployment had somewhere to send a reader. Now the docket
 * is the screen, and the masthead carries navigation — keeping a second copy of the
 * nav in the page body would be two lists to keep in step, and `ROUTES` already
 * feeds the masthead.
 *
 * THE ONE GRADIENT-TREATED HEADING PHRASE in the application is here, and it is
 * decorative in the strict sense: the sentence reads as one heading wherever the
 * colour lands, the phrase marks no field, and it encodes no state. The two-file
 * gradient cap in `check-design.mjs` is spent on this line and the masthead rule.
 */

import { HOME } from '@/content/copy';
import { CourtroomDocket } from '@/components/CourtroomDocket';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-14 pb-4">
      <header className="flex flex-col gap-5">
        <h1 className="text-display text-hi max-w-[24ch]">
          {HOME.headingLead} <span className="gradient-heading">{HOME.headingAccent}</span>
        </h1>
        <p className="text-lede text-muted max-w-[62ch]">{HOME.lede}</p>
      </header>

      <CourtroomDocket />
    </div>
  );
}
