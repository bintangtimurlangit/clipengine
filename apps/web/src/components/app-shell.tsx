"use client";

import { Clapperboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/import", label: "Import" },
  { href: "/runs", label: "Runs" },
  { href: "/library", label: "Library" },
  { href: "/automation", label: "Automation" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="app-backdrop gradient-mesh" aria-hidden />
      <div className="app-backdrop bg-noise opacity-[0.07] dark:opacity-[0.12]" aria-hidden />
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-lg outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex size-10 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-primary shadow-sm ring-1 ring-border/40 transition-transform group-hover:scale-[1.02]">
              <Clapperboard className="size-5" aria-hidden />
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight">
              Clip Engine
            </span>
          </Link>
          <nav
            className="flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-muted/30 p-1 text-sm shadow-sm backdrop-blur-sm"
            aria-label="Primary"
          >
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 transition-colors",
                    active
                      ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-8 md:py-10">{children}</main>
    </div>
  );
}
