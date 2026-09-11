/**
 * `/agents/:agent` — one agent's reputation.
 *
 * `agent` is decoded because both identifier forms are live: a slug needs no
 * encoding, an address does not either, but `resolutionsHref` and `agentHref`
 * encode unconditionally so neither form can produce a malformed path. Decoding
 * here is the matching half of that.
 */

import type { Metadata } from 'next';

import { AgentDetail } from '@/components/AgentDetail';
import { AGENTS, SITE } from '@/content/copy';

export const metadata: Metadata = {
  title: `${AGENTS.heading} — ${SITE.name}`,
};

export default async function AgentPage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent } = await params;

  return <AgentDetail agent={decodeURIComponent(agent)} />;
}
