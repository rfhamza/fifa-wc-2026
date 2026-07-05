import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { DataSourceBadge } from "@/components/data-source-badge";

export const metadata: Metadata = {
  title: "BeyondVAR — World Cup intelligence beyond the score",
  description:
    "Independent World Cup forecasting and tournament intelligence, tracking how every result reshapes probabilities, paths, and knockout state.",
  openGraph: {
    title: "BeyondVAR — World Cup intelligence beyond the score",
    description:
      "Independent World Cup forecasting and tournament intelligence, tracking how every result reshapes probabilities, paths, and knockout state.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <SiteHeader />
        <main className="container py-8 lg:py-12">{children}</main>
        <footer className="border-t border-border/60 py-8">
          <div className="container flex flex-col gap-2 text-xs text-muted-foreground">
            <DataSourceBadge />
            <p>
              BeyondVAR — The World Cup intelligence layer beyond the score. Independent
              forecasting project. Not affiliated with, endorsed by, or sponsored by FIFA.
              All figures are model estimates, not predictions of certainty and not betting
              advice.
            </p>
            <p>Deterministic model + Monte Carlo. Model feature values (Elo, economy, squad, form) remain placeholders.</p>
          </div>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
