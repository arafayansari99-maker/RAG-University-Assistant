import { Link, useLocation } from "wouter";
import { Library, FileText, BarChart3, Search, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const navItems = [
    { href: "/", label: "Research Chat", icon: Search },
    { href: "/documents", label: "Library & Index", icon: FileText },
    { href: "/admin", label: "Admin Insights", icon: BarChart3 },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Library className="h-6 w-6 text-primary mr-3" />
          <h1 className="font-serif font-semibold text-lg text-foreground tracking-tight">
            Athena <span className="text-muted-foreground font-sans text-xs uppercase tracking-widest ml-1">RAG</span>
          </h1>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-muted-foreground mr-auto">Theme</span>
            {mounted && (
              <div className="flex items-center bg-secondary rounded-md p-0.5 gap-0.5">
                {([
                  { value: "light", icon: Sun },
                  { value: "system", icon: Monitor },
                  { value: "dark", icon: Moon },
                ] as const).map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    title={value.charAt(0).toUpperCase() + value.slice(1)}
                    className={`p-1.5 rounded transition-colors ${
                      theme === value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background">
        <div className="md:hidden h-14 border-b border-border bg-card flex items-center px-4">
          <Library className="h-5 w-5 text-primary mr-2" />
          <h1 className="font-serif font-semibold text-foreground">Athena RAG</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
