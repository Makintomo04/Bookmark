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
const font = Inter({ subsets: ["latin"] });

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default:"Bookmark",
    template: "%s | Bookmark",
  },
  description: "Generated by create next app",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any"/>
        <link rel="icon" href="/favicon.ico" type="image/<generated>" sizes="any"/>
        <link rel="apple-touch-icon" href="/favicon.ico" type="image/<generated>"  sizes="any"/>
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

          </div>
        </Providers>
        </body>
    </html>
  );
}
