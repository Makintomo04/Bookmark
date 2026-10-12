import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request:NextRequest){
 const token = await getToken({
   req: request,
   secret: process.env.NEXTAUTH_JWT_SECRET,
   secureCookie: process.env.DEV !== "1",
 });
 const currentUser = !!token;
 const path = request.nextUrl.pathname;
 const publicPaths = ['/', '/signin', '/register', '/forgot-password', '/reset-password'];
 if (!currentUser && !publicPaths.includes(path)) {
   const url = request.nextUrl.clone();
   url.pathname = '/signin'; // Redirect to sign-in page
   return NextResponse.redirect(url);
 }
 // Note: deliberately not redirecting authenticated-looking visitors away
 // from /signin or /register. A JWT can be valid (unexpired, correctly
 // signed) while the account behind it no longer exists - e.g. the user
 // was deleted. Bouncing them away from the only pages that let them
 // sign in as someone else would leave them stuck with no way back in.
 return NextResponse.next()
}
export const config = {
  matcher:["/",
  "/signin",
  "/register",
  "/new-user",
  "/forgot-password",
  "/reset-password",
],
}
