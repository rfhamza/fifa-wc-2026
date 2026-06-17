import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MODEL_WEIGHTS, SCORELINE_CONFIG, SIMULATION_CONFIG } from "@/lib/model/config";
import { bracket } from "@/lib/data";
import { isBracketActive } from "@/lib/simulation/bracket";

export const metadata = {
  title: "Methodology · World Cup Probability Lab",
};

const BRACKET_ACTIVE = isBracketActive(bracket);

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <header className="space-y-2">
        <Badge variant="accent">Methodology</Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          How the model works — in plain English
        </h1>
        <p className="text-muted-foreground">
          This project is built to be understood, not just used. Here is exactly
          what the numbers mean, what is real, and what is a placeholder.
        </p>
      </header>

      <Section title="What the model uses">
        <p>
          For each match we compare the two teams across seven signals and add
          them up into a single rating edge (measured in Elo-equivalent points).
          A bigger edge means more expected goals, which the Poisson engine turns
          into win, draw and loss probabilities.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong>Elo rating</strong> — overall strength (the anchor, weight {MODEL_WEIGHTS.elo}×).</li>
          <li><strong>FIFA ranking</strong> — {MODEL_WEIGHTS.fifaRankingPerPlace} pts per place, capped at {MODEL_WEIGHTS.fifaRankingCap}.</li>
          <li><strong>Squad quality</strong> — {MODEL_WEIGHTS.squadQuality} pts per quality point.</li>
          <li><strong>Recent form</strong> — {MODEL_WEIGHTS.recentForm} pts per form point.</li>
          <li><strong>Manager cohesion</strong> — {MODEL_WEIGHTS.manager} pts for a same-nationality manager.</li>
          <li><strong>Host &amp; regional advantage</strong> — {MODEL_WEIGHTS.host} pts (co-host), {MODEL_WEIGHTS.regional} pts (region).</li>
          <li><strong>Climate familiarity</strong> — {MODEL_WEIGHTS.climate} pts per acclimatization point.</li>
          <li><strong>Structural prior (economic)</strong> — up to {MODEL_WEIGHTS.structural} pts across the 0–1 range, blended from log-scaled GDP per capita and population. An <em>experimental weak prior</em>, deliberately small and never determinative.</li>
        </ul>
      </Section>

      <Section title="How expected goals become probabilities">
        <p>
          The rating edge is converted to a goal &ldquo;supremacy&rdquo; ({SCORELINE_CONFIG.supremacyPerGoal} Elo
          points ≈ one goal) and split around a league-average total of{" "}
          {SCORELINE_CONFIG.baseTotalGoals} goals. We then model each team&apos;s goals as an
          independent Poisson distribution and read off the chance of every
          scoreline — which gives us win/draw/loss and the most likely results.
        </p>
      </Section>

      <Section title="How the Monte Carlo simulation works">
        <p>
          A single forecast is uncertain, so we play the whole tournament out{" "}
          {SIMULATION_CONFIG.defaultIterations.toLocaleString()} times. In each run we randomly draw a
          scoreline for every group match from its Poisson distribution, build
          the group tables, qualify the top two of each group plus the eight best
          third-placed teams, then simulate the knockout bracket. Counting how
          often each team reaches each stage gives the probabilities you see. The
          simulation is seeded, so results are reproducible.
        </p>
      </Section>

      <Section title="Knockout bracket">
        <p>
          The official 2026 knockout path is a typed, validated structure: the
          Round of 32 skeleton (matches M73&ndash;M88), the downstream
          R16/QF/SF/final propagation graph, and the <strong>Annexe C</strong>
          table that allocates the eight best third-placed teams across the 495
          possible group combinations.
        </p>
        <p>
          Current bracket status:{" "}
          <Badge variant={BRACKET_ACTIVE ? "default" : "muted"}>
            {bracket.sourceStatus}
            {BRACKET_ACTIVE ? " · official path active" : " · placeholder seeding"}
          </Badge>
        </p>
        <p>
          Because the official FIFA regulations PDF is not machine-retrievable
          here, the bracket data is not yet source-verified. Until the graph and
          all 495 Annexe C rows are transcribed, validated, and confirmed, the
          simulator uses a transparent balanced-seeding placeholder &mdash; it is
          never silently presented as the official bracket.
        </p>
      </Section>

      <Section title="What is placeholder data">
        <p>
          Everything numeric in the team data is a realistic but{" "}
          <strong>mock</strong> placeholder: FIFA rankings, Elo, GDP per capita,
          population, squad quality, form and climate familiarity. The fixture
          schedule, venue assignments and the knockout bracket mapping are also
          illustrative. Each is structured to be swapped for a real data source
          without touching the model or UI.
        </p>
      </Section>

      <Section title="What will be improved later">
        <ul className="ml-5 list-disc space-y-1">
          <li>Live ratings, results and squad data via real APIs.</li>
          <li>Player-level value and availability (injuries, suspensions).</li>
          <li>A bivariate / Dixon-Coles scoreline model with goal correlation.</li>
          <li>The official 2026 knockout bracket position chart.</li>
          <li>Snapshot history to power genuine &ldquo;top movers&rdquo;.</li>
        </ul>
      </Section>

      <Section title="Why probabilities are not certainties">
        <p>
          A 65% favourite still loses about one time in three. Football is
          high-variance and our inputs are imperfect. These numbers describe the
          <em> distribution of plausible outcomes</em> from a transparent model —
          they are a tool for understanding, not a guarantee.
        </p>
      </Section>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>Not a betting product</CardTitle>
          <CardDescription>Educational forecasting only.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            World Cup Probability Lab is a hobby data-science project for
            exploring and explaining football forecasting. It contains no odds,
            no betting language, no gambling calls-to-action and no monetization.
            Please don&apos;t use it to wager.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}
