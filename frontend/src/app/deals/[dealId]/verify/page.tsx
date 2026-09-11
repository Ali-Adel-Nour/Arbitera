/**
 * `/deals/:dealId/verify` — the three-way hash comparison.
 *
 * A thin server component over `VerifyPanel`, matching `/deals/:dealId`: await the
 * promised `params`, decode the identifier, hand it to the client boundary.
 *
 * A SEPARATE ROUTE RATHER THAN A SECTION of the record screen, for the same reason
 * `DrillableMetric` takes an `href`: a URL is itself evidence. A reviewer can paste
 * this link into an issue, open it beside the record it checks, and come back to it
 * later. An in-place expander on the record screen cannot be cited.
 */

import type { Metadata } from 'next';

import { VerifyPanel } from '@/components/VerifyPanel';
import { SITE, VERIFY } from '@/content/copy';

export const metadata: Metadata = {
  title: `${VERIFY.heading} — ${SITE.name}`,
};

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;

  return <VerifyPanel dealId={decodeURIComponent(dealId)} />;
}
