/**
 * =============================================================================
 * `EmptyState` — an empty group says what would fill it
 * =============================================================================
 *
 * Requirement 16.2. Every one of the docket's seven groups renders whether or not
 * it holds deals, and an empty group is not a gap — it is a statement about the
 * protocol: nothing is currently in this state.
 *
 * The `condition` prop is what separates this from a shrug. "No deals here" tells
 * a reader nothing; "A deal appears here once the buyer funds the escrow" tells
 * them what the state MEANS, which on a screen whose job is explaining a
 * lifecycle is the more useful sentence. An empty group teaching the reader
 * something is strictly better than an empty group apologising.
 *
 * NO ILLUSTRATION, NO ICON, NO "GET STARTED" BUTTON. There is nothing for a
 * reader to do about an empty state on a read-only audit surface, and a call to
 * action that cannot be acted on is noise.
 */

export function EmptyState({ condition }: { condition: string }) {
  return (
    <p className="text-body text-muted max-w-[60ch] px-4 py-6 md:px-5">{condition}</p>
  );
}
