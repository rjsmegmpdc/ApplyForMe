import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// Makes getCloudflareContext() work under plain `next dev` by spinning up
// miniflare-backed local bindings (D1, R2) from wrangler.jsonc.
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/engine ships raw TS (types: ./src/index.ts) — Next must compile it.
  transpilePackages: ['@applyforme/engine'],
};

export default nextConfig;
