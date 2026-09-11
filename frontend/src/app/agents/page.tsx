/**
 * `/agents` — the trust explorer.
 *
 * The filter holds state and the scores are computed in the browser, so the whole
 * screen is the client boundary. There is no static half worth splitting out here:
 * the heading and lede are two elements, and separating them would buy nothing.
 */

import type { Metadata } from 'next';

import { TrustExplorer } from '@/components/TrustExplorer';
import { AGENTS, SITE } from '@/content/copy';

export const metadata: Metadata = {
  title: `${AGENTS.heading} — ${SITE.name}`,
};

export default function AgentsPage() {
  return <TrustExplorer />;
}
