import NextAuth, { AuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GithubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import AppleProvider from "next-auth/providers/apple"
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/db";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { checkPasswordSignIn } from "@/lib/passwordSignIn";
import { findUserByEmail } from "@/lib/findUserByEmail";
import { consumeVerificationToken } from "@/lib/emailVerification";
import { MAGIC_LINK_MAX_AGE_SECONDS, sendMagicLink } from "@/lib/magicLink";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { appleClientSecret, appleWebConfig } from "@/lib/appleSignIn";

const apple = appleWebConfig()

// NextAuth lowercases magic-link emails, and older accounts may be stored in mixed case. Matching the
// way password sign-in does stops a magic link from creating a second account for Jane@Gmail.com.
const adapter: Adapter = {
  ...PrismaAdapter(prisma),
  getUserByEmail: async (email) => (await findUserByEmail(email)) as AdapterUser | null,
}

export const authOptions: AuthOptions = {
  adapter,
  pages: {
    signIn: '/signin',
    error: '/signin',
    // signOut: '/signin',
    newUser: '/new-user',
  },
  providers: [
    CredentialsProvider({
      // The name to display on the sign in form (e.g. 'Sign in with...')
      name: 'Credentials',
      
      // The credentials is used to generate a suitable form on the sign in page.
      // You can specify whatever fields you are expecting to be submitted.
      // e.g. domain, username, password, 2FA token, etc.
      // You can pass any HTML attribute to the <input> tag through the object.
      credentials: {
        email: { label: "email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if(!credentials || !credentials.email || !credentials.password){
          throw new Error('No credentials provided')
        }
        return checkPasswordSignIn(credentials.email, credentials.password, req?.headers)
      }
    }),
    // No allowDangerousEmailAccountLinking: older password accounts may still be unverified, so linking by
    // email would let someone who registered a victim's address keep access after the victim signs in with
    // Google or GitHub. A provider sign-in whose email already has an account now fails with
    // OAuthAccountNotLinked, which the sign-in page explains.
    GithubProvider({
      clientId: process.env.GITHUB_ID as string,
      clientSecret: process.env.GITHUB_SECRET as string,
    }),
    // Only once the Apple keys are set (lib/appleSignIn.ts).
    ...(apple ? [AppleProvider({ clientId: apple.clientId, clientSecret: appleClientSecret(apple) })] : []),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    // Opening the emailed link from /signin/link signs in, or creates the account (then on to /new-user).
    // Mail goes through lib/mailer, which falls back to a test inbox in dev; the server here is unused.
    EmailProvider({
      server: {},
      from: process.env.EMAIL_FROM,
      maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
      sendVerificationRequest: sendMagicLink,
    }),
    // The confirm button on /verify-email signs in through this, so a new reader doesn't have to type
    // the password they just chose straight after confirming.
    CredentialsProvider({
      id: "verify-email",
      name: "Email verification",
      credentials: {
        email: { label: "email", type: "text" },
        token: { label: "token", type: "text" },
      },
      async authorize(credentials, req) {
        const limit = rateLimit(`verify:ip:${clientIp(req?.headers)}`, 20, 15 * 60 * 1000)
        if (!limit.ok) throw new Error(tooManyRequestsMessage)
        const user = credentials?.email && credentials.token
          ? await consumeVerificationToken(credentials.email, credentials.token)
          : null
        if (!user) throw new Error("This verification link is invalid or has expired.")
        return user
      },
    }),
   
    
  ],
  callbacks: {
    async signIn({ user, account, email }) {
      // Opening a magic link proves the inbox is theirs, and NextAuth then marks the user verified. If the
      // account was unverified and has a password, that password was set by whoever registered the
      // address, maybe not this person, so drop it before verification would let it sign in.
      // (email.verificationRequest is set when the link is being requested, not when it's opened.)
      if (account?.provider === "email" && !email?.verificationRequest && "hashedPassword" in user) {
        const dbUser = user as { id: string; emailVerified?: Date | null; hashedPassword?: string | null }
        if (!dbUser.emailVerified && dbUser.hashedPassword) {
          await prisma.user.update({ where: { id: dbUser.id }, data: { hashedPassword: null } })
        }
      }
      return true
    },
  },
  // Vercel has NEXTAUTH_SECRET; .env.local uses SECRET.
  secret: process.env.SECRET || process.env.NEXTAUTH_SECRET,
  
  session: {
    strategy: 'jwt',
  },
  // Apple returns to the callback with a cross-site POST, which drops SameSite=Lax cookies, so the PKCE and
  // state cookies are SameSite=None while Sign in with Apple is on.
  ...(apple && {
    cookies: {
      pkceCodeVerifier: { name: "__Secure-next-auth.pkce.code_verifier", options: { httpOnly: true, sameSite: "none", path: "/", secure: true } },
      state: { name: "__Secure-next-auth.state", options: { httpOnly: true, sameSite: "none", path: "/", secure: true } },
    },
  }),
  jwt: {
    secret: process.env.NEXTAUTH_JWT_SECRET,
  }

}

export default NextAuth(authOptions);