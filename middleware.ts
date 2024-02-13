import { NextRequest, NextResponse } from "next/server";

export function middleware(request:NextRequest){
//  const currentUser = request.cookies.get('__Secure-next-auth.session-token'||'next-auth.session-token');
 const currentUser = process.env.DEV === "1" ? request.cookies.get('next-auth.session-token'):request.cookies.get('__Secure-next-auth.session-token');
 const path = request.nextUrl.pathname;
console.log("yaa",currentUser);
 if (!currentUser && path !== '/signin' && path !== '/register') {
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
],
}