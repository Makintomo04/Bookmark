import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import prisma from "@/lib/db"
import { bearerUserId } from "@/lib/mobileAuth";

export async function getSession(){
  return await getServerSession(authOptions)
}

// The mobile app sends `Authorization: Bearer <access token>` (lib/mobileAuth.ts) instead of the web's
// session cookie. A request that carries one is judged by it alone: a bad token is signed out, never
// passed over for a cookie.
function authorizationHeader() {
  try {
    return headers().get("authorization")
  } catch {
    // Outside a request (a script).
    return null
  }
}

async function findCurrentUser() {
  const authorization = authorizationHeader()
  if (authorization) {
    const userId = await bearerUserId(authorization)
    return userId ? prisma.user.findUnique({ where: { id: userId } }) : null
  }
  const session = await getSession()
  if(!session?.user?.email) return null
  return prisma.user.findUnique({
    where: {
      email: session.user.email as string
    }
  })
}

export default async function getCurrentUser(){
    const currentUser = await findCurrentUser()
    if(!currentUser) return null
    return {...currentUser, createdAt: currentUser.createdAt.toISOString(),updatedAt: currentUser.updatedAt.toISOString(),emailVerified: currentUser.emailVerified?.toISOString() || null}
}
