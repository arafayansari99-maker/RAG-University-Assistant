import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // `transition` (not `transition-colors`) so the active: scale is animated too.
  // The press scale is CSS-only, so framer-motion's <MotionConfig> can't fight it,
  // and index.css's prefers-reduced-motion block snaps it instantly.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Solid fills dim toward their surface: darker in light mode, darker in
        // dark mode too, because the alpha composites against whatever is behind.
        default:
          "bg-primary text-primary-foreground border border-primary-border hover:bg-primary/90 active:bg-primary/80",
        destructive:
          // `border` was missing, so border-destructive-border never applied.
          "bg-destructive text-destructive-foreground border border-destructive-border shadow-sm hover:bg-destructive/90 active:bg-destructive/80",
        outline:
          // Transparent at rest so it shows the card / sidebar behind it, and
          // inherits the current text color — so no hover:text-* here.
          "border [border-color:var(--button-outline)] shadow-xs hover:bg-accent active:bg-accent/70 active:shadow-none",
        secondary:
          // secondary === accent === muted, so hover:bg-secondary/80 would be a
          // sub-1%-lightness no-op. A foreground wash is the only direction that
          // reads correctly in both schemes: darker in light, lighter in dark.
          "border bg-secondary text-secondary-foreground border-secondary-border hover:bg-foreground/10 active:bg-foreground/15",
        ghost:
          "border border-transparent hover:bg-accent active:bg-accent/70",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/80",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
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
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
