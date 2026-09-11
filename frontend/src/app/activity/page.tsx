/**
 * `/activity` — the MCP reputation-query feed.
 *
 * The feed polls, so the whole screen is the client boundary. Splitting the two
 * static paragraphs out would buy nothing.
 */

import type { Metadata } from 'next';

import { McpActivityFeed } from '@/components/McpActivityFeed';
import { ACTIVITY, SITE } from '@/content/copy';

export const metadata: Metadata = {
  title: `${ACTIVITY.heading} — ${SITE.name}`,
};

export default function ActivityPage() {
  return <McpActivityFeed />;
}
