import * as React from "react"

import { cn } from "@/lib/utils"
import { FieldErrors, FieldValues, UseFormRegister } from "react-hook-form"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
    id:string,
    register:UseFormRegister<FieldValues>
    errors:FieldErrors
    required?:boolean
    disabled?:boolean
    inputValidation?:Record<string,any>
  }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ id,className, type,register ,errors,inputValidation,disabled,required, ...props}, ref) => {
    return (
      <>
      <input
      {...register(id,inputValidation)}
        id={id}
        type={type}
        disabled={disabled}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `${id}-error` : undefined}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          errors[id] ? 'border-danger' : 'border-input',
          className
        )}
        {...props}
      />
      {/* The failed rule's own message (e.g. minLength) first; `message` is the fallback for a bare `required: true`. */}
      {errors[id] && <p id={`${id}-error`} className="text-danger text-sm mt-1">{(errors[id]?.message as string) || (inputValidation?.message as string)}</p>}
      </>
    )
  }
)
Input.displayName = "Input"

export { Input }
