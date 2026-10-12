import type { Metadata } from "next";
import { Montserrat,Inter } from "next/font/google";
import "./globals.css";
import {NextUIProvider} from "@nextui-org/system";
import { SpeedInsights } from "@vercel/speed-insights/next"
import Header from "./components/Header";
import { Providers } from "./providers/provider";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { ToastContainer } from 'react-toastify';
import { ourFileRouter } from "@/app/api/uploadthing/core";
import 'react-toastify/dist/ReactToastify.css';
import getCurrentUser from "./actions/getCurrentUser";
import EditProfileModal from "./components/modals/EditProfileModal";
import BookEntryModal from "./components/modals/BookEntryModal";
import BookUpdateModal from "./components/modals/BookUpdateModal";
import { Analytics } from '@vercel/analytics/react';

const font = Inter({ subsets: ["latin"] });

export const dynamic = 'force-dynamic';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const description = "Track every book you read, hit your yearly reading goals, and follow what your friends are reading on Bookmark.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:"Bookmark — Track your reading",
    template: "%s | Bookmark",
  },
  description,
  openGraph: {
    title: "Bookmark — Track your reading",
    description,
    url: siteUrl,
    siteName: "Bookmark",
    images: [{ url: "/images/landing-hero.jpg", width: 773, height: 1079 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bookmark — Track your reading",
    description,
    images: ["/images/landing-hero.jpg"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon?<generated>" type="image/<generated>" sizes="<generated>"/>
      </head>
      <body className={font.className}>
        <Providers>
        <ToastContainer />
        <SpeedInsights/>
        <NextSSRPlugin
          routerConfig={extractRouterConfig(ourFileRouter)}
          />
          <div className="h-auto bg-background">
        {children}
        <Analytics />
          </div>
        </Providers>
        </body>
    </html>
  );
}
