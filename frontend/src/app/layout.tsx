/**
 * The application shell: the two families, the masthead, and the trust-boundary
 * footer that appears under every screen.
 *
 * THE FRAME
 * ---------
 * One 1200px column with 24px gutters, declared once here and shared by the
 * masthead, the screen, and the footer. The screens lay their own grids inside
 * it — 12 columns at 1024px and up, 8 at tablet, one below — but the column they
 * sit in is this one, so the masthead's wordmark and a docket row's left edge
 * line up. A record's margins do not move between pages.
 *
 * THE FOOTER RULE
 * ---------------
 * The footer carries `rule/boundary`, the only three-part rule in the system,
 * and it is the one place in the shell where a structural device is making an
 * argument rather than organising the page. The token's documented meaning is
 * "above: enforced by the contract; below: trusted infrastructure", and that is
 * exactly what the footer says: the record is above the rule, and the sentence
 * naming what is trusted is below it. `/trust-model` carries the same rule once
 * more, between the two lists it separates, which is the second and last
 * occurrence on that route.
 *
 * WHAT THE SHELL DOES NOT DO
 * --------------------------
 * No dark surface, no display-scale type, no motion. The eighth type step and
 * the inverted surface pairing are spent once in the whole application, on the
 * verdict banner, and a shell that reached for either would take the impact out
 * of the one place it is meant to land. Neither token is named here, because
 * `check-design.mjs` counts a mention in a comment as a reference and the
 * budget belongs to `VerdictBanner.tsx` alone. The shell tops out at the
 * `screen` step on `--paper`.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { Navbar } from '@/components/Navbar';
import { FOOTER, NAV, SITE } from '@/content/copy';

import { grotesk, mono } from './fonts';
import './globals.css';

/** 1200px maximum, 16px gutters on a phone, 24px from the medium breakpoint. */
const FRAME = 'mx-auto w-full max-w-[75rem] px-4 md:px-6';

/**
 * The one focus treatment in the application: a 2px `--ink` outline, offset so
 * it clears the glyphs rather than touching them. Shared as a constant so no
 * screen has to remember the values, and so every interactive element in the
 * shell is visibly focusable (Requirement 15.2).
 */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

export const metadata: Metadata = {
  title: { default: SITE.name, template: `%s — ${SITE.name}` },
  description: SITE.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="bg-paper text-ink font-sans antialiased">
        {/* First in the tab order, off-screen until focused. A keyboard visitor
            should not have to walk the masthead on every route. */}
        <a
          href="#record"
          className={`text-body sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:bg-paper-raised focus-visible:px-3 focus-visible:py-2 ${FOCUS}`}
        >
          {NAV.skipToContent}
        </a>

        <div className={`${FRAME} flex min-h-dvh flex-col`}>
          <Navbar />

          <main id="record" className="flex-1">
            {children}
          </main>

          <footer className="rule-boundary mt-20 pb-10">
            <p className="text-meta text-ink-muted max-w-[68ch] pt-4">{FOOTER.boundary}</p>
            <p className="text-meta pt-2">
              <Link
                href="/trust-model"
                className={`underline decoration-1 underline-offset-4 ${FOCUS}`}
              >
                {FOOTER.linkLabel}
              </Link>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
