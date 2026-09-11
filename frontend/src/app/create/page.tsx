/**
 * `/create` — the buyer's write path.
 *
 * Entirely client-side: it discovers a wallet, mints an identifier with
 * `crypto.getRandomValues`, and holds form state.
 */

import type { Metadata } from 'next';

import { CreateDeal } from '@/components/CreateDeal';
import { CREATE, SITE } from '@/content/copy';

export const metadata: Metadata = {
  title: `${CREATE.heading} — ${SITE.name}`,
};

export default function CreatePage() {
  return <CreateDeal />;
}
