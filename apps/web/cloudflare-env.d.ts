/**
 * Bindings + secrets visible to the Worker (and to `next dev` via
 * initOpenNextCloudflareForDev). Keep in sync with wrangler.jsonc.
 *
 * SECURITY: everything under "secrets" exists only inside this env object on
 * the server — never import into client components, never log, never echo.
 */

/** Cloudflare Email Service send binding (public beta). Shape per the Workers API docs. */
interface EmailSendAttachment {
  /** Base64-encoded file content. */
  content: string;
  filename: string;
  /** MIME type, e.g. application/vnd.openxmlformats-officedocument.wordprocessingml.document */
  type: string;
  disposition?: 'attachment' | 'inline';
}

interface EmailSendMessage {
  from: string | { email: string; name?: string };
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailSendAttachment[];
}

interface EmailSendResult {
  messageId: string;
}

interface EmailSendBinding {
  send(message: EmailSendMessage): Promise<EmailSendResult>;
}

interface CloudflareEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  NEXT_INC_CACHE_R2_BUCKET: R2Bucket;
  DOCS: R2Bucket;
  WORKER_SELF_REFERENCE: Fetcher;
  EMAIL: EmailSendBinding;

  // vars (wrangler.jsonc)
  APP_BASE_URL: string;
  EMAIL_FROM: string;
  EMAIL_FROM_NAME?: string;

  // secrets (wrangler secret put)
  ANTHROPIC_API_KEY?: string;
  TOKENS_ENC_KEY?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_APP_AUD?: string;
  ACTION_LINK_SECRET?: string;
}
