import type { NextConfig } from 'next';

/**
 * Deliberately minimal.
 *
 * `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` are both left
 * at their defaults (false) because Requirement 1.6 asks the production build
 * to complete with zero TypeScript errors, and silencing the checker here
 * would make that requirement unfalsifiable.
 *
 * No rewrites or proxying: every request is routed by `services/endpoints.ts`,
 * either to this deployment's own `app/api/*` handlers or to
 * `NEXT_PUBLIC_API_BASE`. A rewrite would put a second, invisible routing rule
 * outside that single seam.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
