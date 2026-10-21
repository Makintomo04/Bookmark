import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "./providers/provider";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { ToastContainer } from 'react-toastify';
import { ourFileRouter } from "@/app/api/uploadthing/core";
import 'react-toastify/dist/ReactToastify.css';
import { Analytics } from '@vercel/analytics/react';
import { siteUrl } from "@/lib/siteUrl";

const font = Inter({ subsets: ["latin"] });

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
    type: "website",
  },
  // The share image is the logo, from ./opengraph-image and ./twitter-image.
  twitter: {
    card: "summary",
    title: "Bookmark — Track your reading",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    <html lang="en">
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
