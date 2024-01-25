import * as React from "react"

import { cn } from "@/lib/utils"
import { FieldErrors, FieldValues, UseFormRegister } from "react-hook-form"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    id:string,
    register:UseFormRegister<FieldValues>
    errors:FieldErrors
  }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ id,register ,errors,required,className, ...props }, ref) => {
    return (
      <textarea
      {...register(id)}
        id={id}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        // ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
