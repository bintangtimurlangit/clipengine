"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ProcessingBanner } from "@/components/processing-banner";
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-heading text-lg font-semibold tracking-tight">
              Clip Engine
            </span>
            <span className="text-xs text-muted-foreground">Operator dashboard</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
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
                    "rounded-md px-2.5 py-1.5 transition-colors",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <ProcessingBanner />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
