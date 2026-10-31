import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-brand-fill-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-brand-text underline-offset-4 hover:underline",
      },
      // Every size is at least 44px on touch screens; the smaller ones only apply with a mouse.
      size: {
        default: "h-11 pointer-fine:h-10 px-4 py-2",
        sm: "h-11 pointer-fine:h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "size-11 pointer-fine:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  // Disables the button and puts a spinner before its label while a request is in flight.
  // Ignored with asChild, where the child owns its own content.
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const busy = loading && !asChild
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          // A busy button is still the one the reader pressed, so it stays more solid than a disabled one.
          busy && "disabled:opacity-80"
        )}
        ref={ref}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        {...props}
      >
        {busy ? (
          <>
            <Loader2 size={size === "sm" ? 14 : 16} className="mr-2 shrink-0 animate-spin" aria-hidden />
            {children}
          </>
        ) : children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
