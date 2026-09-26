/**
 * Bindings + secrets visible to the Worker (and to `next dev` via
 * initOpenNextCloudflareForDev). Keep in sync with wrangler.jsonc.
 *
 * SECURITY: everything under "secrets" exists only inside this env object on
 * the server — never import into client components, never log, never echo.
 */

/** Cloudflare Email Service send binding (public beta). Shape per the Workers API docs. */
interface EmailSendAttachment {
  /** File BYTES. A string is sent as literal (text) content, not decoded from base64. */
  content: string | ArrayBuffer | ArrayBufferView;
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
  /** Optional bearer token for POST /api/admin/run-url (operator use without a browser session). Unset = route inert. */
  ADMIN_TOKEN?: string;
  /** Optional Apify API token — enables the job-page fallback for Seek and LinkedIn (server/fetch/apify.ts). Unset = fallback inert. */
  APIFY_TOKEN?: string;
  /** Apify actor (`user~actor`) used for that fallback; var, default apify~cheerio-scraper. */
  APIFY_ACTOR?: string;
  /** JSON input template for the actor with `{{url}}` / `{{id}}` placeholders; var, default in server/fetch/apify.ts. */
  APIFY_INPUT?: string;
}
