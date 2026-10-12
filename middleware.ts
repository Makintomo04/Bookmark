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
 const publicPaths = ['/signin', '/register', '/forgot-password', '/reset-password'];
 if (!currentUser && !publicPaths.includes(path)) {
   const url = request.nextUrl.clone();
   url.pathname = '/signin'; // Redirect to sign-in page
   return NextResponse.redirect(url);
 }
 else if (currentUser && path === '/signin') {
   const url = request.nextUrl.clone();
   url.pathname = '/'; // Redirect to sign-in page
   return NextResponse.redirect(url);
 }
 else if (currentUser && path === '/register') {
   const url = request.nextUrl.clone();
   url.pathname = '/'; // Redirect to sign-in page
   return NextResponse.redirect(url);
 }
 else if(currentUser){
    return NextResponse.next()
 }
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
