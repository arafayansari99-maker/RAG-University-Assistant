import * as React from "react"
import { motion, type HTMLMotionProps } from "framer-motion"

import { fadeUp } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface PageHeaderProps extends Omit<HTMLMotionProps<"div">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned slot for buttons, filters, or a search field. */
  actions?: React.ReactNode
}

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, title, description, actions, ...props }, ref) => (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className={cn(
        "flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </motion.div>
  )
)
PageHeader.displayName = "PageHeader"

export { PageHeader }
