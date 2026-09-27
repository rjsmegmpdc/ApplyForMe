// Shared constants for the e2e suite. Test-only credentials: none of these
// are real secrets. The seed script (prepare-db.mjs) reads users.json too.
import path from "node:path";
import users from "./users.json";

export const E2E_PORT = Number(process.env.E2E_PORT || 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DB_FILE = path.resolve(__dirname, "..", ".tmp", "e2e.db");
export const E2E_DB_URL = `file:${E2E_DB_FILE}`;
export const AUTH_DIR = path.resolve(__dirname, "..", ".auth");

export type SeedUser = { name: string; email: string; pin: string; role: "ADMIN" | "USER" | "VIEWER" };
export const USERS = users as Record<keyof typeof users, SeedUser>;

export const storageStatePath = (role: string) => path.join(AUTH_DIR, `${role}.json`);
