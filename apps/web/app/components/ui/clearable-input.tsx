"use client"
import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ClearableInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  // Layout for the wrapper (width, flex, grid placement); `className` still styles the input itself.
  wrapperClassName?: string
  onClear?: () => void
}

// A text input with a × that empties it. Clearing goes through the native value setter and an input
// event, so the field's own onChange runs as if the reader had deleted the text, controlled or not
// (react-hook-form's register included).
const ClearableInput = React.forwardRef<HTMLInputElement, ClearableInputProps>(
  ({ className, wrapperClassName, onClear, onChange, ...props }, ref) => {
    const inner = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => inner.current!)
    const [filled, setFilled] = React.useState(() => String(props.value ?? props.defaultValue ?? "").length > 0)
    const hasValue = props.value !== undefined ? String(props.value).length > 0 : filled

    // Uncontrolled fields can be filled from outside (a form reset, autofill), so check on mount too.
    React.useEffect(() => {
      if (props.value === undefined && inner.current) setFilled(inner.current.value.length > 0)
    }, [props.value])

    const clear = () => {
      const el = inner.current
      if (!el) return
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, "")
      el.dispatchEvent(new Event("input", { bubbles: true }))
      onClear?.()
      el.focus()
    }

    return (
      <span className={cn("relative block min-w-0", wrapperClassName)}>
        <input
          ref={inner}
          {...props}
          onChange={(e) => { setFilled(e.target.value.length > 0); onChange?.(e) }}
          className={cn(className, "pr-12 pointer-fine:pr-10")}
        />
        {hasValue && !props.disabled && !props.readOnly && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            aria-label={props["aria-label"] ? `Clear ${props["aria-label"].toLowerCase()}` : "Clear"}
            className="absolute right-0 top-1/2 -translate-y-1/2 grid size-11 pointer-fine:right-1 pointer-fine:size-8 place-items-center rounded-full text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </span>
    )
  }
)
ClearableInput.displayName = "ClearableInput"

export { ClearableInput }
