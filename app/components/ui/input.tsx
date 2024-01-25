import * as React from "react"

import { cn } from "@/lib/utils"
import { FieldErrors, FieldValues, UseFormRegister } from "react-hook-form"
import { formSchema } from "@/app/(auth)/new-user/form-schema"
import { z } from "zod"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
    id:string,
    register:UseFormRegister<FieldValues>
    errors:FieldErrors
  }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ id,className, type,register ,errors,required, ...props}, ref) => {
    return (
      <input
      {...register(id)}
        id={id}
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          errors[id] ? 'border-rose-500' : 'border-neutral-300',
          className
        )}
        // ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
