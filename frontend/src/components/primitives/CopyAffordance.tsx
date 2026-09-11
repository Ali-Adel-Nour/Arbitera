'use client';

/**
 * A copy control that copies the FULL value, never what is displayed.
 *
 * Separated from `MachineValue` because the copy behaviour is the part with
 * state and the rendering is not: a value that is only read does not need to be
 * a client component, and most machine values on a server-rendered record are
 * only read.
 *
 * The confirmation is the label changing, not a toast. A toast for an action
 * whose result is already on screen is ceremony, and it would need a portal and
 * a timer in an application that otherwise has neither.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { COPY } from '@/content/copy';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** How long the confirmation holds before reverting to the idle label. */
const CONFIRM_MS = 1_400;

export function CopyAffordance({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending revert on unmount, so a row that scrolls out of a polled
  // list mid-confirmation does not try to set state afterwards.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // A denied clipboard permission is not worth an error panel: the full
      // value is in the `title` on the sibling element either way, so the
      // reader still has a path to it. Staying silent is the honest response to
      // a failure that costs nothing.
      return;
    }

    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      // The accessible name says WHAT is being copied. A bare "Copy" repeated
      // down a hash strip tells a screen reader user nothing about which row
      // they are on.
      aria-label={`${COPY.copyPrefix} ${label}`}
      className={`text-caption text-muted hover:text-hi shrink-0 transition-colors duration-100 ${FOCUS}`}
    >
      {copied ? COPY.copied : COPY.copy}
    </button>
  );
}
