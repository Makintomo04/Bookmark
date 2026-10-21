"use client"
import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input, InputProps } from "./input"
import { cn } from "@/lib/utils"

// Input with a show/hide toggle. The toggle sits over the right of the 40px-tall field, so it stays
// put when an error message appears underneath.
const PasswordInput = ({ className, ...props }: Omit<InputProps, "type">) => {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-0 top-0 h-10 w-10 grid place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  )
}

export { PasswordInput }
