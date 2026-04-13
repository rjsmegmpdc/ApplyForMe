import bcryptjs from "bcryptjs";

const PIN_SALT_ROUNDS = 12;
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function hashPin(pin: string): Promise<string> {
  return bcryptjs.hash(pin, PIN_SALT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(pin, hash);
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

export function isAccountLocked(
  failedAttempts: number,
  lockedUntil: Date | null
): boolean {
  if (failedAttempts < MAX_PIN_ATTEMPTS) return false;
  if (!lockedUntil) return false;
  return new Date() < lockedUntil;
}

export function getLockoutTime(): Date {
  return new Date(Date.now() + LOCKOUT_DURATION_MS);
}

export type Role = "ADMIN" | "USER" | "VIEWER";

export const PERMISSIONS: Record<string, Role[]> = {
  "profile:read_own": ["ADMIN", "USER", "VIEWER"],
  "profile:edit_own": ["ADMIN", "USER"],
  "profile:read_all": ["ADMIN"],
  "profile:edit_any": ["ADMIN"],
  "profile:delete": ["ADMIN"],
  "analysis:run": ["ADMIN", "USER"],
  "application:read_own": ["ADMIN", "USER", "VIEWER"],
  "application:read_all": ["ADMIN"],
  "document:download": ["ADMIN", "USER"],
  "user:manage": ["ADMIN"],
  "import:file": ["ADMIN", "USER"],
  "research:view": ["ADMIN", "USER", "VIEWER"],
};

export function hasPermission(role: Role, permission: string): boolean {
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

export function canAccessProfile(
  userRole: Role,
  userId: string,
  profileOwnerId: string
): boolean {
  if (userRole === "ADMIN") return true;
  return userId === profileOwnerId;
}
