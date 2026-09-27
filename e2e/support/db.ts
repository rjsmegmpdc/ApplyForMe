import { PrismaClient } from "@prisma/client";
import { E2E_DB_URL } from "./constants";

// Direct access to the throwaway e2e database, used only for things the UI
// deliberately hides (e.g. the PIN-recovery token that the app logs to the
// server console instead of emailing in dev mode).
let client: PrismaClient | undefined;
export function db() {
  client ??= new PrismaClient({ datasourceUrl: E2E_DB_URL });
  return client;
}
