/**
 * `/sandbox` — the prompt-injection sandbox.
 *
 * The form holds state and mints an identifier with `crypto.getRandomValues`, so the
 * whole screen is the client boundary.
 */

import type { Metadata } from 'next';

import { InjectionSandbox } from '@/components/InjectionSandbox';
import { SANDBOX, SITE } from '@/content/copy';

export const metadata: Metadata = {
  title: `${SANDBOX.heading} — ${SITE.name}`,
};

export default function SandboxPage() {
  return <InjectionSandbox />;
}
