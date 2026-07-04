"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);

  // Home ("/") is active only on the exact route; other links match the route or a subpath.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape while the mobile menu is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <BrandMark className="h-5 w-5" />
          </span>
          <span className="tracking-tight">BeyondVAR</span>
        </Link>

        {/* Desktop navigation — inline, from lg up (no horizontal scroll at that width). */}
        <nav className="hidden items-center gap-1 text-sm lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
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

        {/* Mobile toggle — replaces the horizontally-scrolling nav below lg. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

        {/* Mobile panel — a slide-down sheet; closes on select, outside tap, Escape,
            or navigation. */}
        {open ? (
          <nav
            id="mobile-nav"
            className="relative z-40 border-t border-border/60 bg-background/95 px-4 pb-3 pt-2 backdrop-blur-md lg:hidden"
          >
            <ul className="flex flex-col gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-2.5 text-sm transition-colors",
                      isActive(item.href)
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      {/* Dimmed backdrop — rendered OUTSIDE the backdrop-blur header so `fixed`
          resolves against the viewport (a backdrop-filter ancestor would otherwise
          contain it). Tapping it closes the menu. */}
      {open ? (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-x-0 bottom-0 top-16 z-30 bg-foreground/10 lg:hidden"
        />
      ) : null}
    </>
  );
}
