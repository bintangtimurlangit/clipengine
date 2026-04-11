"use client";

import {
  BookOpen,
  Clapperboard,
  FolderKanban,
  HelpCircle,
  LayoutDashboard,
  Library,
  Menu,
  Settings,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  SIDEBAR_TIP_INTERVAL_MS,
  SIDEBAR_TIPS,
} from "@/content/sidebar-tips";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const NAV_PRIMARY: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/import", label: "Import", icon: Upload },
];

const NAV_PIPELINE: NavItem[] = [
  { href: "/runs", label: "Runs", icon: Clapperboard },
  { href: "/library", label: "Library", icon: Library },
];

const NAV_SOURCES: NavItem[] = [
  { href: "/catalog", label: "Catalog", icon: FolderKanban },
];

const NAV_OUTPUT: NavItem[] = [
  { href: "/automation", label: "Automation", icon: Sparkles },
];

const NAV_SYSTEM: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];

function useRotatingTip(tips: readonly string[], intervalMs: number): string {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * Math.max(1, tips.length)),
  );

  useEffect(() => {
    if (tips.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % tips.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [tips.length, intervalMs]);

  return tips[index] ?? "";
}

function NavSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="px-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-foreground shadow-sm ring-1 ring-primary/25"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-[1.125rem] shrink-0",
                    active ? "text-primary" : "opacity-80",
                  )}
                  aria-hidden
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarTip = useRotatingTip(SIDEBAR_TIPS, SIDEBAR_TIP_INTERVAL_MS);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const sidebarInner = (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <span className="flex size-9 items-center justify-center rounded-lg border border-border/80 bg-card text-primary shadow-sm">
          <Clapperboard className="size-[1.15rem]" aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <span className="font-heading text-base font-semibold tracking-tight">
            Clip Engine
          </span>
          <p className="truncate text-[0.7rem] text-muted-foreground">
            Transcribe, plan, clip, publish
          </p>
        </div>
      </div>
      <nav
        className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5"
        aria-label="Primary"
      >
        <NavSection
          title="Start"
          items={NAV_PRIMARY}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
        <NavSection
          title="Pipeline"
          items={NAV_PIPELINE}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
        <NavSection
          title="Sources"
          items={NAV_SOURCES}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
        <NavSection
          title="Output"
          items={NAV_OUTPUT}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
        <NavSection
          title="System"
          items={NAV_SYSTEM}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
      </nav>
      <div className="shrink-0 border-t border-border/60 p-3">
        <p
          className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2.5 text-[0.75rem] leading-snug text-muted-foreground"
          aria-live="polite"
        >
          <BookOpen className="mt-0.5 size-3.5 shrink-0 text-primary/80" aria-hidden />
          <span>{sidebarTip}</span>
        </p>
      </div>
    </>
  );

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="app-backdrop gradient-mesh" aria-hidden />
      <div
        className="app-backdrop bg-noise opacity-[0.05] dark:opacity-[0.08]"
        aria-hidden
      />

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col border-r border-border/70 bg-sidebar/95 shadow-[2px_0_24px_-12px_rgba(0,0,0,0.35)] backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/85 lg:flex"
        aria-label="App navigation"
      >
        {sidebarInner}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18.5rem,88vw)] flex-col border-r border-border/80 bg-sidebar shadow-xl transition-transform duration-200 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-2 z-10 text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="size-5" />
        </Button>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-1">{sidebarInner}</div>
      </div>

      <div className="flex min-h-screen flex-col lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 border-border/80"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="size-5" />
          </Button>
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-8 items-center justify-center rounded-lg border border-border/80 bg-card text-primary">
              <Clapperboard className="size-4" aria-hidden />
            </span>
            <span className="font-heading truncate text-sm font-semibold">Clip Engine</span>
          </Link>
          <Link
            href="/import"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
          >
            <Upload className="size-3.5" aria-hidden />
            Import
          </Link>
        </header>

        <main className="relative mx-auto w-full max-w-[min(72rem,calc(100vw-2rem))] flex-1 px-4 py-8 md:py-10 lg:px-8">
          <div className="animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
