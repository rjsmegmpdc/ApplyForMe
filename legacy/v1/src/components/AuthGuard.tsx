"use client";

import { useSession } from "next-auth/react";
import type { Role } from "@/lib/auth-helpers";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: Role;
  requiredPermission?: string;
  fallback?: React.ReactNode;
}

const PERMISSIONS: Record<string, string[]> = {
  "profile:read_own": ["ADMIN", "USER", "VIEWER"],
  "profile:edit_own": ["ADMIN", "USER"],
  "profile:read_all": ["ADMIN"],
  "profile:edit_any": ["ADMIN"],
  "profile:delete": ["ADMIN"],
  "analysis:run": ["ADMIN", "USER"],
  "document:download": ["ADMIN", "USER"],
  "user:manage": ["ADMIN"],
  "import:file": ["ADMIN", "USER"],
};

export function AuthGuard({
  children,
  requiredRole,
  requiredPermission,
  fallback,
}: AuthGuardProps) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role as Role | undefined;

  if (!role) return fallback ? <>{fallback}</> : null;

  if (requiredRole && role !== requiredRole && role !== "ADMIN") {
    return fallback ? <>{fallback}</> : null;
  }

  if (requiredPermission) {
    const allowed = PERMISSIONS[requiredPermission];
    if (!allowed?.includes(role)) {
      return fallback ? <>{fallback}</> : null;
    }
  }

  return <>{children}</>;
}

export function useUserRole(): Role {
  const { data: session } = useSession();
  return ((session?.user as { role?: string })?.role as Role) || "VIEWER";
}

export function useUserId(): string | null {
  const { data: session } = useSession();
  return (session?.user as { id?: string })?.id || null;
}
