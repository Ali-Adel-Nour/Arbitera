/**
 * `/agents/:agent/resolutions` — the arithmetic behind the figures.
 *
 * A route rather than a disclosure on the detail screen, which is the same
 * decision `DrillableMetric` documents: a URL can be pasted into a review, opened
 * beside the figure it explains, and returned to later. An expander cannot be
 * cited.
 */

import type { Metadata } from 'next';

import { AgentResolutions } from '@/components/AgentResolutions';
import { AGENTS, SITE } from '@/content/copy';

export const metadata: Metadata = {
  title: `${AGENTS.resolutionsHeading} — ${SITE.name}`,
};

export default async function ResolutionsPage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent } = await params;

  return <AgentResolutions agent={decodeURIComponent(agent)} />;
}
