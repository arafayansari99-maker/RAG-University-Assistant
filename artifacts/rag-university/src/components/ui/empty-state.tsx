import * as React from "react"
import { motion, type HTMLMotionProps } from "framer-motion"
import { type LucideIcon } from "lucide-react"

import { scaleIn } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface EmptyStateProps extends Omit<HTMLMotionProps<"div">, "title"> {
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  /** Primary call to action, e.g. an upload or "start a chat" button. */
  action?: React.ReactNode
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon, title, description, action, ...props }, ref) => (
    <motion.div
      ref={ref}
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center",
        className
      )}
      {...props}
    >
      {Icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <p className="font-serif text-lg font-medium tracking-tight text-foreground">
        {title}
      </p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </motion.div>
  )
)
EmptyState.displayName = "EmptyState"

export { EmptyState }
