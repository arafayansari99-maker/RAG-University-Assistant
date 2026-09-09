import * as React from "react"
import { motion, type HTMLMotionProps } from "framer-motion"
import { type LucideIcon } from "lucide-react"

import { listItem } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface StatCardProps extends HTMLMotionProps<"div"> {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  /** Trend or clarifying subtext, e.g. "+12 this week". */
  trend?: React.ReactNode
}

/** To cascade a grid of these, wrap it in `variants={stagger}` and pass
 *  `initial={undefined} animate={undefined}` so they inherit the parent. */
const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, icon: Icon, trend, ...props }, ref) => (
    <motion.div
      ref={ref}
      variants={listItem}
      initial="hidden"
      animate="visible"
      className={cn(
        "rounded-xl border border-card-border bg-card p-4 text-card-foreground shadow-card",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-accent-gold" /> : null}
      </div>
      <p className="mt-2 font-serif text-2xl font-semibold tabular-nums leading-tight">
        {value}
      </p>
      {trend ? (
        <p className="mt-1 text-xs text-muted-foreground">{trend}</p>
      ) : null}
    </motion.div>
  )
)
StatCard.displayName = "StatCard"

export { StatCard }
