'use client';

/**
 * The masthead. A wordmark and one link per route that exists.
 *
 * WHY THIS IS A CLIENT COMPONENT
 * ------------------------------
 * `aria-current="page"` is the only reason. It needs the active pathname, and
 * `usePathname()` is the App Router's way to read it. The alternative — passing
 * the pathname down from a server layout — is not available, because a layout
 * does not receive it. The cost is a few hundred bytes of client JavaScript on
 * every route; the gain is that a keyboard or screen-reader user is told which
 * of the destinations they are already on, which is the same information a
 * sighted user reads from the underline.
 *
 * NO RULE TOKEN UNDER THE MASTHEAD. Each of the seven rule tokens carries a
 * record meaning — inside the hashed preimage, excluded from it, computed here,
 * end of one record. None of them means "chrome ends, content begins", and
 * borrowing the closest one would erode the vocabulary the record screens
 * depend on. Space separates the masthead instead.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV, ROUTES, SITE } from '@/content/copy';

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="flex flex-wrap items-baseline gap-x-8 gap-y-2 pt-6 pb-10">
      <Link
        href="/"
        className="text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {SITE.name}
      </Link>

      <nav aria-label={NAV.ariaLabel}>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {ROUTES.map((route) => {
            const current = pathname === route.href;
            return (
              <li key={route.href}>
                <Link
                  href={route.href}
                  aria-current={current ? 'page' : undefined}
                  className={
                    current
                      ? 'text-body underline decoration-1 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
                      : 'text-body text-ink-muted hover:text-ink hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
                  }
                >
                  {route.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
