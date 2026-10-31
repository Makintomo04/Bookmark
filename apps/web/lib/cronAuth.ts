import { createHash, timingSafeEqual } from "node:crypto";

// Cron routes (app/api/cron/*) are public URLs, so the secret is the whole defence. Vercel Cron sends
// CRON_SECRET as a bearer token. Without the secret set, every caller is refused. Both sides are hashed
// first so the compare takes the same time whatever the length.
export function isCronAuthorised(header: string | null, secret = process.env.CRON_SECRET?.trim()): boolean {
  if (!secret || !header) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
