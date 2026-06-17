import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { DataSourceBadge } from "@/components/data-source-badge";

export const metadata: Metadata = {
  title: "World Cup Probability Lab",
  description:
    "An explainable FIFA World Cup 2026 prediction and Monte Carlo simulation lab. Educational forecasting — not betting advice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans">
        <SiteHeader />
        <main className="container py-8 lg:py-12">{children}</main>
        <footer className="border-t border-border/60 py-8">
          <div className="container flex flex-col gap-2 text-xs text-muted-foreground">
            <DataSourceBadge />
            <p>
              World Cup Probability Lab — an educational forecasting project.
              All figures are model estimates, not predictions of certainty and
              not betting advice.
            </p>
            <p>Deterministic model + Monte Carlo. Model feature values (Elo, economy, squad, form) remain placeholders.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
