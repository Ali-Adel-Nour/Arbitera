import type { Config } from 'tailwindcss';

/**
 * Tailwind v4 is CSS-first: the token layer for this application is the
 * `@theme` block in `src/app/globals.css` (task 2.2), not this file. v4 also
 * discovers template files automatically, so `content` is not required either.
 *
 * This file is kept because the design's directory layout names it and
 * teammates will look for it, and because it stays the right home for the two
 * things that cannot move into CSS: an explicit `content` override, if
 * automatic detection ever misses a path, and `darkMode`. Neither applies yet —
 * the design specifies a single paper-and-ink theme with no dark variant.
 *
 * Tailwind only loads this file when `globals.css` declares
 * `@config "../../tailwind.config.ts"`. That directive is deliberately absent,
 * so today this file is documentation of where configuration would go rather
 * than live configuration. Adding a key here without also adding the directive
 * will have no effect.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,css}'],
};

export default config;
