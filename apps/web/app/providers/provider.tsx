"use client";
import { useEffect } from "react";
import { NextUIProvider } from "@nextui-org/system";
import { SessionProvider } from "next-auth/react"
import {ThemeProvider as NextThemesProvider} from "next-themes";
import { TIME_ZONE_COOKIE, isValidTimeZone } from "@/lib/timeZone";

// Reports the browser's zone so streak days, months and years turn over at the reader's midnight, not UTC's
// (lib/timeZone.ts). Rewritten only when it changes, e.g. after travelling.
function useTimeZoneCookie() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!isValidTimeZone(zone)) return
    const current = document.cookie.split("; ").find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))?.slice(TIME_ZONE_COOKIE.length + 1)
    if (current === zone) return
    // IANA names (letters, "/", "_", "-", "+") are valid cookie octets, so the server reads them as written.
    document.cookie = `${TIME_ZONE_COOKIE}=${zone}; path=/; max-age=31536000; samesite=lax`
  }, [])
}

export function Providers({children}: {children: React.ReactNode}) {
  useTimeZoneCookie()
  return (
    <SessionProvider>
      <NextUIProvider>
        <NextThemesProvider attribute="class" defaultTheme="dark">
           {children}
        </NextThemesProvider>
    </NextUIProvider>
    </SessionProvider>
    )
}
