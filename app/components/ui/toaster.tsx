"use client"
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

// Mounted once in the root layout. Call sites use `notify` from lib/notify, never sonner directly.
export default function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      position="bottom-center"
      theme={resolvedTheme === "light" ? "light" : "dark"}
      offset={16}
      mobileOffset={12}
      gap={8}
      visibleToasts={3}
      // Inherit Inter from <body> instead of sonner's system stack.
      style={{ fontFamily: "inherit" }}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-border !bg-popover !text-popover-foreground !shadow-lg",
          title: "!text-sm !font-medium",
          description: "!text-muted-foreground",
          actionButton: "!bg-foreground !text-background !rounded-md !font-medium",
          error: "[&_[data-icon]]:!text-red-500",
          success: "[&_[data-icon]]:!text-emerald-500",
        },
      }}
    />
  )
}
