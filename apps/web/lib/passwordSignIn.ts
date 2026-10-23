import bcrypt from "bcrypt";
import { EMAIL_NOT_VERIFIED } from "@/lib/authSchemas";
import { findUserByEmail } from "@/lib/findUserByEmail";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";

type HeaderSource = Parameters<typeof clientIp>[0];

// Email and password sign-in, for the web's credentials provider and the app's /api/mobile/auth/password.
// Throws an Error whose message is safe to show; EMAIL_NOT_VERIFIED is a code the sign-in screens turn
// into an offer to resend the link.
export async function checkPasswordSignIn(rawEmail: string, password: string, headers: HeaderSource) {
  // Slows password guessing: per IP across all accounts, and per account across all IPs.
  const byIp = rateLimit(`signin:ip:${clientIp(headers)}`, 20, 15 * 60 * 1000)
  const byEmail = rateLimit(`signin:email:${rawEmail.toLowerCase()}`, 10, 15 * 60 * 1000)
  if (!byIp.ok || !byEmail.ok) {
    throw new Error(tooManyRequestsMessage)
  }
  const user = await findUserByEmail(rawEmail.trim())
  // Same message as a wrong password, so sign-in can't be used to discover which emails have accounts.
  if (!user || !user.hashedPassword) {
    throw new Error('Invalid email or password')
  }
  const isCorrectPassword = await bcrypt.compare(password, user.hashedPassword)
  if (!isCorrectPassword) {
    throw new Error('Invalid email or password');
  }
  // Checked after the password so this only tells someone who already knows it. Skipped in `next dev`
  // so local accounts can sign in without the email round trip; `next build`/`next start` always set
  // NODE_ENV to production.
  if (!user.emailVerified && process.env.NODE_ENV !== 'development') {
    throw new Error(EMAIL_NOT_VERIFIED)
  }
  return user
}
