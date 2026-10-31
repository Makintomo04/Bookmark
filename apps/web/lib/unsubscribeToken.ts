import { createHmac, timingSafeEqual } from "node:crypto";

// The token in the weekly email's unsubscribe link: an HMAC of the reader's id and what it stops, so the
// link works without signing in and can't be made for someone else. Nothing is stored. Changing
// EMAIL_UNSUBSCRIBE_SECRET retires every link already sent, so don't, unless one leaks.

export type UnsubscribeKind = "weekly";

const secretOf = (secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()) => {
  if (!secret) throw new Error("EMAIL_UNSUBSCRIBE_SECRET is not set: the weekly email can't carry an unsubscribe link.");
  return secret;
};

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

// "<userId>.<kind>.<signature>"
export function unsubscribeToken(userId: string, kind: UnsubscribeKind = "weekly", secret?: string): string {
  const payload = `${userId}.${kind}`;
  return `${payload}.${sign(payload, secretOf(secret))}`;
}

// The reader's id when the token is genuine and for `kind`; null otherwise, or when no secret is set.
export function verifyUnsubscribeToken(token: unknown, kind: UnsubscribeKind = "weekly", secret?: string): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const [userId, tokenKind, signature, ...rest] = token.split(".");
  if (rest.length || !userId || tokenKind !== kind || !signature || !/^[a-f0-9]{24}$/i.test(userId)) return null;
  let key: string;
  try {
    key = secretOf(secret);
  } catch {
    return null;
  }
  const expected = Buffer.from(sign(`${userId}.${kind}`, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}
