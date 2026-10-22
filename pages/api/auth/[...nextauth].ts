import NextAuth, { AuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GithubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import TwitterProvider from "next-auth/providers/twitter"
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/db";
import bcrypt from "bcrypt";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { EMAIL_NOT_VERIFIED } from "@/lib/authSchemas";
import { findUserByEmail } from "@/lib/findUserByEmail";
import { consumeVerificationToken } from "@/lib/emailVerification";
import { MAGIC_LINK_MAX_AGE_SECONDS, sendMagicLink } from "@/lib/magicLink";
import type { Adapter, AdapterUser } from "next-auth/adapters";

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
        // Slows password guessing: per IP across all accounts, and per account across all IPs.
        const byIp = rateLimit(`signin:ip:${clientIp(req?.headers)}`, 20, 15 * 60 * 1000)
        const byEmail = rateLimit(`signin:email:${credentials.email.toLowerCase()}`, 10, 15 * 60 * 1000)
        if (!byIp.ok || !byEmail.ok) {
          throw new Error(tooManyRequestsMessage)
        }
        const user = await findUserByEmail(credentials.email.trim())
        // Same message as a wrong password, so sign-in can't be used to discover which emails have accounts.
        if (!user || !user.hashedPassword) {
          throw new Error('Invalid email or password')
        }
        const isCorrectPassword = await bcrypt.compare(credentials.password,user.hashedPassword)

        if (!isCorrectPassword) {
          throw new Error('Invalid email or password');
        }
        // Checked after the password so this only tells someone who already knows it. The sign-in page
        // reads this code and offers to resend the link. Skipped in `next dev` so local accounts can sign
        // in without the email round trip; `next build`/`next start` always set NODE_ENV to production.
        if (!user.emailVerified && process.env.NODE_ENV !== 'development') {
          throw new Error(EMAIL_NOT_VERIFIED)
        }
        return user
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
  jwt: {
    secret: process.env.NEXTAUTH_JWT_SECRET,
  }

}

export default NextAuth(authOptions);