/**
 * Custom Worker entry — wraps the OpenNext-generated handler so the same
 * Worker also owns the `email` (Email Routing → Worker) and `scheduled`
 * (cron) handlers. Pattern from the OpenNext "custom worker" how-to.
 *
 * `fetch` is the Next.js app (UI + API routes, behind Cloudflare Access).
 * `email` is the pipeline's primary trigger: a Seek alert forwarded from
 * Gmail to jobs@<domain> lands here as a raw MIME message.
 * `scheduled` is the safety net: retries pending runs, expires dedupe rows.
 */
import { default as handler } from './.open-next/worker.js';
import { handleInboundEmail } from './server/pipeline/inbound-handler';
import { handleScheduledSweep } from './server/pipeline/scheduled-handler';

export default {
  fetch: handler.fetch,

  async email(message: ForwardableEmailMessage, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    await handleInboundEmail(message, env, ctx);
  },

  async scheduled(event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    await handleScheduledSweep(event, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Only required if the app uses the DO queue / DO tag cache overrides.
export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
