import crypto from "crypto";
import prisma from "@/lib/db";
import { hashResetToken } from "@/lib/passwordResetToken";
import { safeCallbackPath } from "@/lib/callbackUrl";

// Opening the web from the phone already signed in (the Staff console, BOO-88). The phone, signed in with
// its bearer token, asks for a one-time token; the browser it opens spends it through the "app-handoff"
// sign-in (pages/api/auth/[...nextauth].ts) for the usual web session. The token rides in the URL's
// fragment, which browsers never send to a server, so it stays out of logs and Referer headers. It lasts
// two minutes, works once, and only its hash is kept, as a VerificationToken.

export const APP_HANDOFF_SECONDS = 2 * 60;
const PREFIX = "app-handoff:";

// The page the browser opens: /signin/app with the token and where to go after, in the fragment. A path,
// which the phone puts on the server it already talks to.
export function appHandoffPath(token: string, next: string) {
  return `/signin/app#${new URLSearchParams({ token, next }).toString()}`;
}

// Where the phone may send someone: a path on this site, else home.
export const handoffNext = (raw: unknown) => safeCallbackPath(typeof raw === "string" ? raw : null) ?? "/";

export async function createAppHandoff(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  // One at a time: asking again replaces the last.
  await prisma.verificationToken.deleteMany({ where: { identifier: PREFIX + userId } });
  await prisma.verificationToken.create({
    data: { identifier: PREFIX + userId, token: hashResetToken(token), expires: new Date(Date.now() + APP_HANDOFF_SECONDS * 1000) },
  });
  return token;
}

// The user the token was made for, once: deleting the row is the claim, so two tabs opening the same link
// can't both sign in. Null for a token that's unknown, spent or out of time.
export async function consumeAppHandoff(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = hashResetToken(token);
  const row = await prisma.verificationToken.findUnique({ where: { token: hash } });
  if (!row || !row.identifier.startsWith(PREFIX)) return null;
  const { count } = await prisma.verificationToken.deleteMany({ where: { id: row.id } });
  if (count !== 1 || row.expires < new Date()) return null;
  return prisma.user.findUnique({ where: { id: row.identifier.slice(PREFIX.length) } });
}
