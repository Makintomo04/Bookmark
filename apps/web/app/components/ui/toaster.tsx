"use client"
import { useEffect, type CSSProperties } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

// Mounted once in the root layout. Call sites use `notify` from lib/notify, never sonner directly.
export default function Toaster() {
  const { resolvedTheme } = useTheme()
  // Sonner stops its toasts' timers while the tab is hidden; this lets their countdown bars stop too (globals.css).
  useEffect(() => {
    const sync = () => { document.documentElement.toggleAttribute("data-tab-hidden", document.hidden) }
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [])
  return (
    <Sonner
      position="bottom-center"
      theme={resolvedTheme === "light" ? "light" : "dark"}
      offset={16}
      mobileOffset={12}
      gap={8}
      visibleToasts={3}
      // Inherit Inter from <body> instead of sonner's system stack. Wider than sonner's 356px, so a long book title
      // ("Started The Quiet Orchards of Fenmarch") fits on a line or two beside Undo; a phone is full width anyway.
      style={{ fontFamily: "inherit", "--width": "500px" } as CSSProperties}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-border !bg-popover !text-popover-foreground !shadow-lg",
          title: "!text-sm !font-medium",
          description: "!text-muted-foreground",
          actionButton: "!bg-foreground !text-background !rounded-md !font-medium",
          error: "[&_[data-icon]]:!text-danger",
          success: "[&_[data-icon]]:!text-emerald-500",
        },
      }}
    />
  )
}
