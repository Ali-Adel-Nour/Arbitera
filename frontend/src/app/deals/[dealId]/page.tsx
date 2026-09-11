/**
 * `/deals/:dealId` — the verdict record.
 *
 * A thin server component over `VerdictRecord`, which is the client boundary. The
 * only work here is unwrapping the route parameter.
 *
 * `params` IS A PROMISE in this Next major, so it is awaited rather than read. The
 * identifier is also decoded, because `DocketEntry` encodes it on the way in and a
 * `dealId` that arrived encoded would be requested encoded and 404.
 *
 * NO `generateStaticParams`. The set of deals is whatever the backend holds at
 * request time, and prerendering a fixed list would bake the fixture cycle's
 * identifiers into the build.
 */

import type { Metadata } from 'next';

import { VerdictRecord } from '@/components/VerdictRecord';
import { DEAL, SITE } from '@/content/copy';

export const metadata: Metadata = {
  title: `${DEAL.heading} — ${SITE.name}`,
};

export default async function DealPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;

  return <VerdictRecord dealId={decodeURIComponent(dealId)} />;
}
