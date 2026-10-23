import crypto from "crypto";
import { decode, encode } from "next-auth/jwt";

// Sign-in for the iOS and Android apps, which can't hold the web's session cookie. After a sign-in route
// (app/api/mobile/auth/*) checks who the reader is, startMobileSession hands the app two tokens:
//   - an access token: a next-auth JWT marked `mobile`, sent as `Authorization: Bearer …` and read by
//     getCurrentUser, so every existing route handler works unchanged. Short-lived, never stored.
//   - a refresh token: random, kept in the phone's secure storage, stored here only as a hash
//     (MobileSession). Trading it in rotates it, so each one works once.
// Presenting a refresh token that was already rotated means it was copied, so the whole session ends
// and that phone has to sign in again.
//
// Pure apart from the store handed in, so the rules can be tested against a stub
// (scripts/test/mobileAuth.test.ts).

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
// Sliding: every refresh pushes the end out again, so a phone used at least this often stays signed in.
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface MobileSessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

// The slice of Prisma these use; lib/mobileAuthStore.ts builds it from prisma.mobileSession.
export interface MobileSessionStore {
  create(data: { userId: string; tokenHash: string; platform: string | null; expiresAt: Date }): Promise<{ id: string }>;
  findByHash(tokenHash: string): Promise<MobileSessionRow | null>;
  findByPreviousHash(tokenHash: string): Promise<MobileSessionRow | null>;
  // Swaps the hash only while it is still `fromHash`, so two refreshes racing with one token can't both win.
  rotate(id: string, fromHash: string, data: { tokenHash: string; previousHash: string; expiresAt: Date; lastUsedAt: Date }): Promise<boolean>;
  delete(id: string): Promise<void>;
}

export interface MobileTokens {
  accessToken: string;
  refreshToken: string;
  // Seconds until the access token expires.
  expiresIn: number;
}

// The next-auth JWT secret, so access tokens are made the way the web's session tokens are.
// The `mobile` claim keeps a web session cookie from being replayed as a bearer token.
export function mobileTokenSecret() {
  const secret = process.env.NEXTAUTH_JWT_SECRET || process.env.SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("No NEXTAUTH_JWT_SECRET, SECRET or NEXTAUTH_SECRET is set.");
  return secret;
}

export const hashRefreshToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const newRefreshToken = () => crypto.randomBytes(32).toString("base64url");

const PLATFORMS = new Set(["ios", "android"]);
export const platformOf = (raw: unknown) => (typeof raw === "string" && PLATFORMS.has(raw) ? raw : null);

async function accessTokenFor(user: { id: string; email?: string | null }, secret: string) {
  return encode({ token: { sub: user.id, email: user.email ?? undefined, mobile: true }, secret, maxAge: ACCESS_TOKEN_TTL_SECONDS });
}

export async function startMobileSession(
  user: { id: string; email?: string | null },
  platform: string | null,
  store: MobileSessionStore,
  opts: { secret?: string; now?: Date } = {},
): Promise<MobileTokens> {
  const now = opts.now ?? new Date();
  const refreshToken = newRefreshToken();
  await store.create({ userId: user.id, tokenHash: hashRefreshToken(refreshToken), platform, expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS) });
  return { accessToken: await accessTokenFor(user, opts.secret ?? mobileTokenSecret()), refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export type RefreshResult = { ok: true; tokens: MobileTokens; userId: string } | { ok: false; reason: "invalid" | "expired" | "reused" };

export async function refreshMobileSession(
  refreshToken: string,
  store: MobileSessionStore,
  opts: { secret?: string; now?: Date; emailOf?: (userId: string) => Promise<string | null> } = {},
): Promise<RefreshResult> {
  const now = opts.now ?? new Date();
  const hash = hashRefreshToken(refreshToken);
  const session = await store.findByHash(hash);
  if (!session) {
    const replayed = await store.findByPreviousHash(hash);
    if (replayed) {
      await store.delete(replayed.id);
      return { ok: false, reason: "reused" };
    }
    return { ok: false, reason: "invalid" };
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    await store.delete(session.id);
    return { ok: false, reason: "expired" };
  }
  const next = newRefreshToken();
  const rotated = await store.rotate(session.id, hash, {
    tokenHash: hashRefreshToken(next),
    previousHash: hash,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    lastUsedAt: now,
  });
  // Another refresh with the same token got there first; this copy is the stale one.
  if (!rotated) return { ok: false, reason: "invalid" };
  const email = opts.emailOf ? await opts.emailOf(session.userId) : null;
  const accessToken = await accessTokenFor({ id: session.userId, email }, opts.secret ?? mobileTokenSecret());
  return { ok: true, userId: session.userId, tokens: { accessToken, refreshToken: next, expiresIn: ACCESS_TOKEN_TTL_SECONDS } };
}

// Signing out on the phone. Unknown tokens are fine: the phone is signed out either way.
export async function endMobileSession(refreshToken: string, store: MobileSessionStore) {
  const session = await store.findByHash(hashRefreshToken(refreshToken));
  if (session) await store.delete(session.id);
}

// The user id an `Authorization: Bearer …` header carries, or null for anything else: no header, an
// expired or forged token, or a web session token without the mobile claim.
export async function bearerUserId(authorization: string | null | undefined, secret = mobileTokenSecret()): Promise<string | null> {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  try {
    const token = await decode({ token: match[1], secret });
    return token?.mobile === true && typeof token.sub === "string" ? token.sub : null;
  } catch {
    return null;
  }
}
