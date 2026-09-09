import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { MotionConfig, motion } from "framer-motion";
import {
  BarChart3,
  FileText,
  Library,
  Menu,
  Monitor,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { motionTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Research Chat", icon: Search },
  { href: "/documents", label: "Library & Index", icon: FileText },
  { href: "/admin", label: "Admin Insights", icon: BarChart3 },
];

const themeOptions = [
  { value: "light", icon: Sun },
  { value: "system", icon: Monitor },
  { value: "dark", icon: Moon },
] as const;

function Brand({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-3 font-serif text-lg font-semibold tracking-tight text-foreground",
        className,
      )}
    >
      <Library className="h-6 w-6 shrink-0 text-primary" />
      <span>
        Athena
        <span className="ml-1.5 font-sans text-xs uppercase tracking-widest text-muted-foreground">
          RAG
        </span>
      </span>
    </span>
  );
}

/** `layoutGroup` keeps the desktop and mobile indicators independent — both
 *  lists are mounted at once, and a duplicated layoutId would fight itself. */
function NavList({ layoutGroup }: { layoutGroup: string }) {
  const [location] = useLocation();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const isActive = location === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`${layoutGroup}-active-nav`}
                transition={motionTransition}
                className="absolute inset-0 rounded-md bg-primary/10"
              />
            )}
            <item.icon className="relative h-4 w-4 shrink-0" />
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="flex items-center gap-2 px-1">
      <span className="mr-auto text-xs text-muted-foreground">Theme</span>
      <div className="flex items-center gap-0.5 rounded-md bg-secondary p-0.5">
        {themeOptions.map(({ value, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={value.charAt(0).toUpperCase() + value.slice(1)}
            aria-pressed={theme === value}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded transition-colors md:h-8 md:w-8",
              theme === value
                ? "bg-background text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // Auto-close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
          <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-6">
            <NavList layoutGroup="desktop" />
          </div>
          <div className="shrink-0 border-t border-border p-4">
            <ThemeToggle />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-2 md:hidden">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger
                aria-label="Open navigation"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent
                side="left"
                aria-describedby={undefined}
                className="flex w-72 flex-col gap-0 p-0"
              >
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
                  <Brand className="text-base" />
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <NavList layoutGroup="mobile" />
                </div>
                <div
                  className="shrink-0 border-t border-border p-3"
                  style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
                >
                  <ThemeToggle />
                </div>
              </SheetContent>
            </Sheet>
            <Brand className="text-base" />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </main>
      </div>
    </MotionConfig>
  );
}
