import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import { prisma } from "./db";
import { verifyPin, isAccountLocked, getLockoutTime } from "./auth-helpers";
import type { Role } from "./auth-helpers";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  providers: [
    CredentialsProvider({
      id: "pin-login",
      name: "PIN",
      credentials: {
        email: { label: "Email", type: "email" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.pin) return null;

        const email = credentials.email as string;
        const pin = credentials.pin as string;

        const user = await prisma.user.findFirst({ where: { email, pin: { not: null } } });
        if (!user || !user.pin) return null;

        // Check lockout
        if (isAccountLocked(user.failedPinAttempts, user.lockedUntil)) {
          throw new Error("Account locked. Try again in 15 minutes.");
        }

        const valid = await verifyPin(pin, user.pin);
        if (!valid) {
          const attempts = user.failedPinAttempts + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedPinAttempts: attempts,
              lockedUntil: attempts >= 5 ? getLockoutTime() : null,
            },
          });
          throw new Error(
            attempts >= 5
              ? "Account locked after 5 failed attempts."
              : `Invalid PIN. ${5 - attempts} attempts remaining.`
          );
        }

        // Reset failed attempts on success
        await prisma.user.update({
          where: { id: user.id },
          data: { failedPinAttempts: 0, lockedUntil: null },
        });

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
    // Only add OAuth providers if credentials are configured
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    ...(process.env.AZURE_AD_CLIENT_ID
      ? [
          MicrosoftEntraId({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID || "common",
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role?: string }).role || "USER";
        token.userId = user.id;
      }
      // Allow role updates from session
      if (trigger === "update" && session?.role) {
        token.role = session.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
    async signIn({ user, account }) {
      // For OAuth: link to existing user if email matches
      if (account?.provider !== "pin-login" && user.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
        });
        if (existing && user.id !== existing.id) {
          // Account linking handled by adapter
        }
      }
      return true;
    },
  },
  events: {
    async createUser({ user }) {
      // First user becomes ADMIN
      const count = await prisma.user.count();
      if (count === 1) {
        await prisma.user.update({
          where: { id: user.id! },
          data: { role: "ADMIN" },
        });
      }
    },
  },
});
