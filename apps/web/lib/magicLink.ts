import type { SendVerificationRequestParams } from "next-auth/providers/email";
import { sendMail } from "@/lib/mailer";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { appUrl } from "@/lib/siteUrl";

export const MAGIC_LINK_MAX_AGE_SECONDS = 60 * 60; // 1 hour

// NextAuth signs the reader in as soon as its callback URL is opened, and mail scanners open links to
// check them, which would spend the token before the reader clicks. So the email points at /signin/link,
// which only follows the callback when the reader presses a button. It's also rebuilt on appUrl, because
// NextAuth builds it from NEXTAUTH_URL, which points previews at production.
export function magicLinkLandingUrl(nextAuthUrl: string) {
  const callback = new URL(nextAuthUrl);
  return `${appUrl}/signin/link?next=${encodeURIComponent(callback.pathname + callback.search)}`;
}

export async function sendMagicLink({ identifier: email, url }: SendVerificationRequestParams) {
  // NextAuth has no limit of its own; without one, the button could flood an inbox.
  const limit = rateLimit(`magic-link:email:${email.toLowerCase()}`, 3, 60 * 60 * 1000);
  if (!limit.ok) throw new Error(tooManyRequestsMessage);

  const link = magicLinkLandingUrl(url);
  await sendMail({
    to: email,
    subject: "Your Bookmark sign-in link",
    text: `Sign in to Bookmark: ${link}\nThis link expires in 1 hour and works once. If you didn't ask for it, ignore this email and nothing will happen.`,
    html: `<p>Here's your link to sign in to Bookmark.</p><p><a href="${link}">Sign in to Bookmark</a></p><p>This link expires in 1 hour and works once. If you didn't ask for it, ignore this email and nothing will happen.</p>`,
  });
}
