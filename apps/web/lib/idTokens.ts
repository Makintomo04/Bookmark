import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Checks the ID tokens that native Google and Apple sign-in hand the mobile app, before
// app/api/mobile/auth/{google,apple} sign anyone in: signed by the provider (its published keys),
// issued by it, meant for one of our client ids, not expired.

export interface VerifiedIdentity {
  // The provider's stable id for the person; Account.providerAccountId.
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
}

const list = (...values: (string | undefined)[]) =>
  values.flatMap((v) => (v ?? "").split(",")).map((v) => v.trim()).filter(Boolean);

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

const truthy = (value: unknown) => value === true || value === "true";
const text = (value: unknown) => (typeof value === "string" && value ? value : null);

// The web client id (native Google sign-in asks for a token for it), plus the iOS and Android ones.
export function googleAudiences() {
  return list(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_MOBILE_CLIENT_IDS);
}

// The app's bundle id (native sign-in) and the web Services ID (web sign-in), whichever are set.
export function appleAudiences() {
  return list(process.env.APPLE_BUNDLE_ID, process.env.APPLE_ID);
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedIdentity> {
  const audience = googleAudiences();
  if (audience.length === 0) throw new Error("Google sign-in isn't set up.");
  const { payload } = await jwtVerify(idToken, googleKeys, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience });
  if (!payload.sub) throw new Error("The Google token has no subject.");
  return {
    sub: payload.sub,
    email: text(payload.email),
    emailVerified: truthy(payload.email_verified),
    name: text(payload.name),
    image: text(payload.picture),
  };
}

// `rawNonce` is the value the app generated; it passed Apple its SHA-256, which the token carries. Checking
// it means a token lifted from another app's sign-in can't be replayed here.
export async function verifyAppleIdentityToken(identityToken: string, rawNonce?: string | null): Promise<VerifiedIdentity> {
  const audience = appleAudiences();
  if (audience.length === 0) throw new Error("Sign in with Apple isn't set up.");
  const { payload } = await jwtVerify(identityToken, appleKeys, { issuer: "https://appleid.apple.com", audience });
  if (!payload.sub) throw new Error("The Apple token has no subject.");
  if (rawNonce) {
    const expected = crypto.createHash("sha256").update(rawNonce).digest("hex");
    if (payload.nonce !== expected) throw new Error("The Apple token's nonce doesn't match.");
  }
  // Apple vouches for the address it gives, private relay addresses included. The name only comes from
  // the app, on the first sign-in.
  return { sub: payload.sub, email: text(payload.email), emailVerified: truthy(payload.email_verified), name: null, image: null };
}
