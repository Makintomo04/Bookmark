import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "./providers/provider";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { ourFileRouter } from "@/app/api/uploadthing/core";
import { Analytics } from '@vercel/analytics/react';
import { siteUrl } from "@/lib/siteUrl";
import Toaster from "./components/ui/toaster";

const font = Inter({ subsets: ["latin"], variable: "--font-sans" });
// The display face: page titles, heroes, Wrapped, big numbers and quotes. Never for UI controls.
const display = Literata({ subsets: ["latin"], variable: "--font-display", style: ["normal", "italic"], axes: ["opsz"] });

const title = "Bookmark — Read with friends, spoiler-free";
const description = "Start a reading circle, share one link, and talk about the book as you go. Comments stay hidden until you've read that far. Free.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s | Bookmark",
  },
  description,
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "Bookmark",
    type: "website",
  },
  // The share image is the logo, from ./opengraph-image and ./twitter-image.
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    // next-themes adds the theme class on the client, so the html attributes differ from the server render by design.
    <html lang="en" className={`${font.variable} ${display.variable}`} suppressHydrationWarning>
      <body className={font.className}>
        <Providers>
        <Toaster />
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
