// OpenNext config for the Cloudflare adapter. Incremental cache on R2, as in
// AICoach (KV's free-tier write limit is too tight for revalidation traffic).
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
