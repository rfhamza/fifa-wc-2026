import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

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
          <div className="container flex flex-col gap-1 text-xs text-muted-foreground">
            <p>
              World Cup Probability Lab — an educational forecasting project.
              All figures are model estimates from seed data, not predictions of
              certainty and not betting advice.
            </p>
            <p>Phase one · static seed data · deterministic model + Monte Carlo.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
