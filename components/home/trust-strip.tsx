import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Short trust/methodology strip (UX-1 revision). Elegant, low-clutter reassurance
 * about what the live-aware forecast is (and isn't), with a link to the methodology.
 */
export function TrustStrip() {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-gradient-to-br from-secondary/40 to-white p-6 md:flex-row md:items-center md:justify-between md:p-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight">Live-aware forecast</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Updates as results are locked and tournament paths change. The team-strength
            model is not re-rated after every match.
          </p>
        </div>
      </div>
      <Link
        href="/methodology"
        className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
      >
        How it works
      </Link>
    </section>
  );
}
