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
export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
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
        const user = await prisma.user.findUnique({
          where:{
            email:credentials?.email
          }
        })
        // Same message as a wrong password, so sign-in can't be used to discover which emails have accounts.
        if (!user || !user.hashedPassword) {
          throw new Error('Invalid email or password')
        }
        const isCorrectPassword = await bcrypt.compare(credentials.password,user.hashedPassword)

        if (!isCorrectPassword) {
          throw new Error('Invalid email or password');
        }
        return user
      }
    }),
    // No allowDangerousEmailAccountLinking: password sign-up doesn't verify the email yet, so linking by
    // email would let someone register a victim's address and keep access after the victim signs in with
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
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: process.env.EMAIL_SERVER_PORT ? Number(process.env.EMAIL_SERVER_PORT) : undefined,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD
        }
      },
      from: process.env.EMAIL_FROM,
    }),
   
    
  ],
  secret: process.env.SECRET,
  
  session: {
    strategy: 'jwt',
  },
  jwt: {
    secret: process.env.NEXTAUTH_JWT_SECRET,
  }

}

export default NextAuth(authOptions);