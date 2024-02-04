import { NextRequest, NextResponse } from "next/server";

export function middleware(request:NextRequest){
 const currentUser = request.cookies.get('next-auth.session-token');
 const path = request.nextUrl.pathname;

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
  "/register",],
}