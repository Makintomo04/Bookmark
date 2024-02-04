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
    required?:boolean
    disabled?:boolean
    inputValidation?:Record<string,any>
  }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ id,className, type,register ,errors,inputValidation,disabled,required, ...props}, ref) => {
    console.log("3333",errors,errors[id]);
    return (
      <>
      <input
      {...register(id,inputValidation)}
        id={id}
        type={type}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full rounded-md dark:placeholder:text-slate-300 border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          errors[id] ? 'border-rose-500' : 'border-neutral-300',
          className
        )}
        // ref={ref}
        {...props}
      />
      {errors[id] && <p className="text-rose-500 text-sm mt-1">{inputValidation?.message as string}</p>}
      </>
    )
  }
)
Input.displayName = "Input"

export { Input }
