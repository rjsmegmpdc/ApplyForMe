import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server/script/deps";
import { prisma } from "./db";

const rpName = process.env.WEBAUTHN_RP_NAME || "ApplyForMe";
const rpID = process.env.WEBAUTHN_RP_ID || "localhost";
const origin = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";

// In-memory challenge store (for local dev; use Redis for production)
const challengeStore = new Map<string, string>();

export async function getRegistrationOptions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { authenticators: true },
  });
  if (!user) throw new Error("User not found");

  const existingAuthenticators = user.authenticators.map((a) => ({
    id: a.credentialID,
    type: "public-key" as const,
    transports: (a.transports?.split(",") || []) as AuthenticatorTransport[],
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: userId,
    userName: user.email || user.name,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existingAuthenticators,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  challengeStore.set(userId, options.challenge);
  // Auto-expire after 60s
  setTimeout(() => challengeStore.delete(userId), 60000);

  return options;
}

export async function verifyRegistration(
  userId: string,
  response: RegistrationResponseJSON
) {
  const expectedChallenge = challengeStore.get(userId);
  if (!expectedChallenge) throw new Error("Challenge expired or not found");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Verification failed");
  }

  const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  // Store the authenticator
  await prisma.authenticator.create({
    data: {
      userId,
      credentialID: Buffer.from(credentialID).toString("base64url"),
      credentialPublicKey: Buffer.from(credentialPublicKey).toString("base64"),
      counter: BigInt(counter),
      credentialDeviceType,
      credentialBackedUp,
      transports: response.response.transports?.join(",") || null,
    },
  });

  challengeStore.delete(userId);
  return { verified: true };
}

export async function getLoginOptions(email?: string) {
  let allowCredentials: { id: string; type: "public-key"; transports?: AuthenticatorTransport[] }[] = [];

  if (email) {
    const user = await prisma.user.findFirst({
      where: { email },
      include: { authenticators: true },
    });
    if (user) {
      allowCredentials = user.authenticators.map((a) => ({
        id: a.credentialID,
        type: "public-key" as const,
        transports: (a.transports?.split(",") || []) as AuthenticatorTransport[],
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
  });

  // Store challenge with a temporary key
  const challengeKey = email || "__passkey_login__";
  challengeStore.set(challengeKey, options.challenge);
  setTimeout(() => challengeStore.delete(challengeKey), 60000);

  return { options, challengeKey };
}

export async function verifyLogin(
  challengeKey: string,
  response: AuthenticationResponseJSON
) {
  const expectedChallenge = challengeStore.get(challengeKey);
  if (!expectedChallenge) throw new Error("Challenge expired or not found");

  const credentialID = response.id;

  // Find the authenticator
  const authenticator = await prisma.authenticator.findUnique({
    where: { credentialID },
    include: { user: true },
  });

  if (!authenticator) throw new Error("Authenticator not found");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    authenticator: {
      credentialID: Buffer.from(authenticator.credentialID, "base64url"),
      credentialPublicKey: Buffer.from(authenticator.credentialPublicKey, "base64"),
      counter: Number(authenticator.counter),
      transports: (authenticator.transports?.split(",") || []) as AuthenticatorTransport[],
    },
  });

  if (!verification.verified) throw new Error("Verification failed");

  // Update counter
  await prisma.authenticator.update({
    where: { id: authenticator.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter) },
  });

  challengeStore.delete(challengeKey);

  return {
    verified: true,
    user: {
      id: authenticator.user.id,
      name: authenticator.user.name,
      email: authenticator.user.email,
      role: authenticator.user.role,
    },
  };
}
