/**
 * =============================================================================
 * `Button` — the ONLY file permitted `bg-accent`
 * =============================================================================
 *
 * `boldness-chroma` in `scripts/check-design.mjs` maps `--accent` (OKLCH chroma
 * 0.215, the most saturated token in the system) to this filename. Anywhere else
 * it fails the build.
 *
 * That confinement is what keeps the accent meaning "act here". A dark dashboard
 * that puts its accent on card borders, active nav items, chart strokes and chips
 * has an accent that means nothing, and then the one button that actually spends
 * money has no way to stand out.
 *
 * `--accent` IS A BACKGROUND, NEVER A FOREGROUND. It measures 3.54:1 on the base,
 * which fails 4.5:1 for text. `--accent-text` is the lifted variant for the
 * cases where the accent has to be ink — a hover state, a link. That split is
 * exactly why the token was divided in two rather than reused.
 *
 * PRIMARY IS SOLID; SECONDARY IS A RULE. `secondary` spends no chroma at all, so
 * a screen with several controls still has exactly one obvious primary action.
 */

import type { ButtonHTMLAttributes } from 'react';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * Shared geometry. `transition-colors` only — Requirement 14.12 forbids hover
 * transforms and `check-design.mjs` greps for them, so nothing here moves,
 * scales, or casts a shadow. A control that lifts under the cursor is pretending
 * to be a physical object.
 */
const BASE =
  'text-body inline-flex items-center justify-center rounded-[--radius-control] px-5 py-2.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55';

const VARIANTS = {
  /** The one action a screen most wants taken. Solid accent ground. */
  primary: 'bg-accent text-base hover:bg-accent-2',
  /** Everything else. A rule and a text colour, no chroma. */
  secondary: 'border border-rule text-primary hover:text-hi hover:border-panel-edge',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
}

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // Defaulted rather than left to the caller: an un-typed button inside a
      // form submits it, and the write path has forms whose submit is a wallet
      // signature. That default is a real hazard, not a lint nicety.
      type={type}
      className={`${BASE} ${VARIANTS[variant]} ${FOCUS} ${className}`}
      {...rest}
    />
  );
}
