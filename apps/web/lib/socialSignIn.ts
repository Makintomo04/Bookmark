import prisma from "@/lib/db";
import { findUserByEmail } from "@/lib/findUserByEmail";
import type { VerifiedIdentity } from "@/lib/idTokens";

// Native Google and Apple sign-in on the phone: the same accounts the web's next-auth providers make
// (an Account row with provider + providerAccountId), so someone who signed up with Google on the web
// signs straight in on the phone. And the same linking rule: no linking by email, because older password
// accounts may be unverified, so whoever registered an address can't keep access after its owner signs
// in with Google or Apple (see pages/api/auth/[...nextauth].ts).

export type SocialProvider = "google" | "apple";

export class AccountNotLinkedError extends Error {
  constructor() {
    super("There's already a Bookmark account with this email. Sign in with your password or an email link, the way you did before.");
  }
}

export async function signInWithIdentity(provider: SocialProvider, identity: VerifiedIdentity, fallbackName?: string | null) {
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: identity.sub } },
    select: { userId: true },
  });
  if (account) {
    const user = await prisma.user.findUnique({ where: { id: account.userId } });
    if (user) return { user, isNewUser: false };
  }

  // Unverified addresses are never trusted for a new account either.
  const email = identity.email && identity.emailVerified ? identity.email.toLowerCase() : null;
  if (!email) throw new Error("Your account didn't share a verified email, which Bookmark needs to create an account.");
  if (await findUserByEmail(email)) throw new AccountNotLinkedError();

  const user = await prisma.user.create({
    data: {
      email,
      emailVerified: new Date(),
      name: identity.name ?? fallbackName ?? null,
      ...(identity.image && { image: identity.image }),
      accounts: { create: { type: "oauth", provider, providerAccountId: identity.sub } },
    },
  });
  return { user, isNewUser: true };
}
