import { createContext, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { MotionConfig, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateChatSession,
  useDeleteChatSession,
  useListChatSessions,
  getListChatSessionsQueryKey,
} from "@workspace/api-client-react";
import {
  BarChart3,
  Blend,
  FileText,
  Library,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  PlusCircle,
  Trash2,
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
  { value: "system", icon: Blend },
  { value: "dark", icon: Moon },
] as const;

interface ChatSessionSummary {
  id: number;
  title?: string | null;
}

interface ChatHistoryNavigationValue {
  sessions: ChatSessionSummary[] | undefined;
  sessionsLoading: boolean;
  activeSessionId: number | null;
  setActiveSessionId: (id: number | null) => void;
  createSession: () => Promise<ChatSessionSummary>;
  deleteSession: (id: number) => Promise<void>;
}

const ChatHistoryNavigationContext = createContext<ChatHistoryNavigationValue | null>(null);

export function useChatHistoryNavigation() {
  const context = useContext(ChatHistoryNavigationContext);
  if (!context) throw new Error("useChatHistoryNavigation must be used inside Layout");
  return context;
}

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
function NavList({ layoutGroup, collapsed = false }: { layoutGroup: string; collapsed?: boolean }) {
  const [location, navigate] = useLocation();
  const { sessions, sessionsLoading, activeSessionId, setActiveSessionId, createSession, deleteSession } = useChatHistoryNavigation();

  const handleNewSession = async () => {
    await createSession();
    navigate("/");
  };

  return (
    <nav className="flex h-full min-h-0 flex-col gap-1">
      {navItems.map((item) => {
        const isActive = location === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "relative flex min-h-11 items-center gap-3 rounded-md text-sm font-medium transition-colors",
              collapsed ? "justify-center px-0" : "px-3",
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
            <span className={cn("relative", collapsed && "sr-only")}>{item.label}</span>
          </Link>
        );
      })}
      <div className="my-4 border-t border-border/80" aria-hidden="true" />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={cn("pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground", collapsed ? "sr-only" : "px-3")}>
          Chat History
        </div>
        <button
          type="button"
          onClick={() => void handleNewSession()}
          title={collapsed ? "New Session" : undefined}
          className={cn(
            "flex min-h-10 w-full shrink-0 items-center gap-3 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
            collapsed ? "justify-center px-0" : "px-3",
          )}
        >
          <PlusCircle className="h-4 w-4 shrink-0 text-primary" />
          <span className={cn(collapsed && "sr-only")}>New Session</span>
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto pt-1">
          {sessionsLoading ? (
            <div className={cn("py-3 text-sm text-muted-foreground", collapsed ? "sr-only" : "px-3")}>Loading sessions...</div>
          ) : sessions?.length ? (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "group flex min-h-10 items-center justify-between gap-2 rounded-md text-sm transition-colors",
                    collapsed ? "justify-center px-0" : "px-3",
                    activeSessionId === session.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-secondary",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSessionId(session.id);
                      navigate("/");
                    }}
                    title={collapsed ? session.title || "New Investigation" : undefined}
                    className="min-w-0 flex-1 truncate py-2 text-left font-medium"
                  >
                    <span className={cn(collapsed && "sr-only")}>{session.title || "New Investigation"}</span>
                    {collapsed && <Library className={cn("mx-auto h-4 w-4", activeSessionId === session.id ? "text-primary-foreground" : "text-primary")} />}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${session.title || "session"}`}
                    onClick={() => void deleteSession(session.id)}
                    className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive", collapsed && "hidden")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className={cn("py-2 text-sm text-muted-foreground", collapsed ? "sr-only" : "px-3")}>No research sessions yet.</p>
          )}
        </div>
      </div>
    </nav>
  );
}

function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const activeTheme = themeOptions.find((option) => option.value === theme) ?? themeOptions[0];
  const nextTheme = themeOptions[(themeOptions.findIndex((option) => option.value === activeTheme.value) + 1) % themeOptions.length];

  if (collapsed) {
    const Icon = activeTheme.icon;
    return (
      <button
        type="button"
        onClick={() => setTheme(nextTheme.value)}
        title={`${activeTheme.value.charAt(0).toUpperCase() + activeTheme.value.slice(1)} theme. Click to change.`}
        aria-label={`${activeTheme.value.charAt(0).toUpperCase() + activeTheme.value.slice(1)} theme. Click to change.`}
        className="flex h-9 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className={cn(
      "theme-control flex items-center rounded-xl border border-border/70 bg-background/70 py-2 shadow-card backdrop-blur-sm",
      collapsed ? "justify-center px-1" : "gap-3 px-3",
    )}>
      <motion.div
        className={cn("theme-prism hidden shrink-0 sm:block", collapsed && "sr-only")}
        animate={{ rotateY: theme === "dark" ? 180 : theme === "system" ? 90 : 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 16 }}
        whileHover={{ rotateX: -12, rotateZ: 8, scale: 1.08 }}
        aria-hidden="true"
      >
        <span className="theme-prism-face theme-prism-front" />
        <span className="theme-prism-face theme-prism-back" />
      </motion.div>
      <span className={cn("mr-auto text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground", collapsed && "sr-only")}>Theme</span>
      <div className="theme-options flex items-center gap-0.5 rounded-lg bg-secondary/80 p-0.5">
        {themeOptions.map(({ value, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={value.charAt(0).toUpperCase() + value.slice(1)}
            aria-pressed={theme === value}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md transition-all duration-300 md:h-8 md:w-8",
              theme === value
                ? "bg-background text-foreground shadow-card [transform:translateY(-1px)]"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const queryClient = useQueryClient();
  const { data: sessions, isLoading: sessionsLoading } = useListChatSessions();
  const createChatSession = useCreateChatSession();
  const deleteChatSession = useDeleteChatSession();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  const createSession = async () => {
    const session = await createChatSession.mutateAsync(undefined);
    setActiveSessionId(session.id);
    queryClient.invalidateQueries({ queryKey: getListChatSessionsQueryKey() });
    return session;
  };

  const deleteSession = async (id: number) => {
    await deleteChatSession.mutateAsync({ sessionId: id });
    if (activeSessionId === id) setActiveSessionId(null);
    queryClient.invalidateQueries({ queryKey: getListChatSessionsQueryKey() });
  };

  const chatHistoryNavigation: ChatHistoryNavigationValue = {
    sessions,
    sessionsLoading,
    activeSessionId,
    setActiveSessionId,
    createSession,
    deleteSession,
  };

  // Auto-close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location]);

  return (
    <ChatHistoryNavigationContext.Provider value={chatHistoryNavigation}>
      <MotionConfig reducedMotion="user">
        <div className="flex h-dvh overflow-hidden bg-background">
        <aside className={cn("hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex", sidebarCollapsed ? "w-16" : "w-64")}>
          <div className={cn("flex h-16 shrink-0 items-center border-b border-border", sidebarCollapsed ? "justify-center px-2" : "px-5 lg:px-6")}>
            {sidebarCollapsed ? <Library className="h-6 w-6 text-primary" /> : <Brand />}
          </div>
          <div className={cn("sidebar-scroll flex-1 overflow-y-auto py-6", sidebarCollapsed ? "px-2" : "px-3")}>
            <NavList layoutGroup="desktop" collapsed={sidebarCollapsed} />
          </div>
          <div className={cn("shrink-0 border-t border-border", sidebarCollapsed ? "p-2" : "p-4")}>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn("mb-3 flex h-9 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground", !sidebarCollapsed && "justify-end px-2")}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <ThemeToggle collapsed={sidebarCollapsed} />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1 border-b border-border/80 bg-card/90 px-2 shadow-sm backdrop-blur-md md:hidden">
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

          <div className="app-stage min-h-0 flex-1 overflow-y-auto">{children}</div>
        </main>
        </div>
      </MotionConfig>
    </ChatHistoryNavigationContext.Provider>
  );
}
