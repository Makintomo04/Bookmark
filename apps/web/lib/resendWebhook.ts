import { createHmac, timingSafeEqual } from "node:crypto";

// Resend's webhooks (app/api/email/webhook): when an address bounces for good or its owner marks our mail
// as spam, the weekly email is switched off for them, so Settings says what's true. Resend already stops
// sending to those addresses itself; this keeps the reader's setting in step.
//
// Resend signs webhooks the Svix way: headers svix-id, svix-timestamp and svix-signature ("v1,<base64>",
// several separated by spaces while a secret rotates), over "<id>.<timestamp>.<raw body>", with an
// HMAC-SHA256 keyed by the base64 part of the signing secret ("whsec_…", RESEND_WEBHOOK_SECRET).

// How far a webhook's timestamp may be from now, so a captured request can't be replayed later.
export const WEBHOOK_TOLERANCE_S = 5 * 60;

export interface SignedHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function verifyResendSignature(body: string, headers: SignedHeaders, secret: string | undefined, now = Date.now()): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > WEBHOOK_TOLERANCE_S) return false;
  const key = Buffer.from(secret.trim().replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = Buffer.from(createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64"));
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

interface ResendEvent {
  type?: unknown;
  data?: { to?: unknown; bounce?: { type?: unknown } };
}

// The addresses whose weekly email should stop: every recipient of a complaint, and of a bounce unless
// Resend says it was temporary (a full inbox, say). Anything else is ignored.
export function addressesToStop(event: ResendEvent): string[] {
  const to = Array.isArray(event.data?.to) ? event.data.to.filter((a): a is string => typeof a === "string" && a.includes("@")) : [];
  if (event.type === "email.complained") return to;
  if (event.type === "email.bounced") {
    const kind = typeof event.data?.bounce?.type === "string" ? event.data.bounce.type.toLowerCase() : "";
    return kind === "transient" || kind === "temporary" ? [] : to;
  }
  return [];
}
