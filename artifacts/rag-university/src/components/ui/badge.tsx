import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Whitespace-nowrap: Badges should never wrap.
  "whitespace-nowrap inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    // Hover is gated on `[&:is(a,button)]` — i.e. it only applies when the badge
    // is rendered as a real interactive element via `asChild`. Every badge in the
    // app today is a static status pill; lighting those up on hover would signal
    // an affordance that isn't there.
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-xs [&:is(a,button)]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [&:is(a,button)]:hover:bg-foreground/10",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-xs [&:is(a,button)]:hover:bg-destructive/90",
        outline:
          "text-foreground border [border-color:var(--badge-outline)] [&:is(a,button)]:hover:bg-accent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "div"
  return (
    <Comp className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
