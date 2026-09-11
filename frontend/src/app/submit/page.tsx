/**
 * `/submit` — the seller's write path.
 */

import type { Metadata } from 'next';

import { SubmitDeliverable } from '@/components/SubmitDeliverable';
import { SITE, SUBMIT } from '@/content/copy';

export const metadata: Metadata = {
  title: `${SUBMIT.heading} — ${SITE.name}`,
};

export default function SubmitPage() {
  return <SubmitDeliverable />;
}
