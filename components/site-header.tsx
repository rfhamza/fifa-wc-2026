"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import { LIVE_STATE_UI_ENABLED } from "@/lib/live-client/config";

const NAV = [
  { href: "/", label: "Forecast" },
  { href: "/bracket", label: "Knockout Bracket" },
  { href: "/matches", label: "Matches" },
  { href: "/teams", label: "Teams" },
  { href: "/scenario", label: "Scenario Lab" },
  ...(LIVE_STATE_UI_ENABLED ? [{ href: "/live", label: "Tournament State" }] : []),
  { href: "/methodology", label: "Methodology" },
];

export function SiteHeader() {
  const pathname = usePathname();
  // Home ("/") is active only on the exact route; other links match the route or a subpath.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <BrandMark className="h-5 w-5" />
          </span>
          <span className="tracking-tight">BeyondVAR</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 transition-colors",
                isActive(item.href)
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
