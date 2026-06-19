import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MODEL_WEIGHTS,
  SCORELINE_CONFIG,
  SIMULATION_CONFIG,
  PLACEHOLDER_CONTRIBUTION_CAP,
  TOTAL_PLACEHOLDER_CONTRIBUTION_CAP,
  CLIMATE_CONTRIBUTION_CAP,
} from "@/lib/model/config";
import { MODEL_INPUT_SOURCES } from "@/data/model-inputs";
import { bracket } from "@/lib/data";
import { isBracketActive } from "@/lib/simulation/bracket";

export const metadata = {
  title: "Methodology - World Cup Probability Lab",
};

const BRACKET_ACTIVE = isBracketActive(bracket);

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <header className="space-y-2">
        <Badge variant="accent">Methodology</Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          How the model works - in plain English
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
          <li><strong>Elo rating</strong> - overall strength (the anchor, weight {MODEL_WEIGHTS.elo}x). Status: {MODEL_INPUT_SOURCES.eloRating.status} (World Football Elo snapshot, {MODEL_INPUT_SOURCES.eloRating.sourceDate}; published values, not recalculated).</li>
          <li><strong>FIFA ranking</strong> - {MODEL_WEIGHTS.fifaRankingPerPlace} pts per place, capped at {MODEL_WEIGHTS.fifaRankingCap}. Status: {MODEL_INPUT_SOURCES.fifaRanking.status} (supplied FIFA snapshot, {MODEL_INPUT_SOURCES.fifaRanking.sourceDate}).</li>
          <li><strong>Squad quality</strong> - {MODEL_WEIGHTS.squadQuality} pts per quality point. Status: {MODEL_INPUT_SOURCES.squadQuality.status} (capped).</li>
          <li><strong>Recent form</strong> - {MODEL_WEIGHTS.recentForm} pts per form point. Status: {MODEL_INPUT_SOURCES.recentForm.status} (capped).</li>
          <li><strong>Manager cohesion</strong> - {MODEL_WEIGHTS.manager} pts for a same-nationality manager. Status: {MODEL_INPUT_SOURCES.managerCohesion.status}.</li>
          <li><strong>Host &amp; regional advantage</strong> - {MODEL_WEIGHTS.host} pts (co-host), {MODEL_WEIGHTS.regional} pts (region). Status: {MODEL_INPUT_SOURCES.hostAdvantage.status} / {MODEL_INPUT_SOURCES.regionalAdvantage.status}.</li>
          <li><strong>Climate suitability</strong> - {MODEL_WEIGHTS.climate} pts per playability point, capped at +/-{CLIMATE_CONTRIBUTION_CAP}. Status: {MODEL_INPUT_SOURCES.climateFamiliarity.status} (a 12-month home-climate playability score from CCKP 1991-2020 normals; England &amp; Scotland from Met Office / HadUK-Grid - a candidate heuristic, not a tournament-acclimatization score).</li>
          <li><strong>Structural prior (economic)</strong> - up to {MODEL_WEIGHTS.structural} pts across the 0-1 range, blended from log-scaled GDP per capita and population. An <em>experimental weak prior</em>, deliberately small. Status: {MODEL_INPUT_SOURCES.structural.status} (World Bank WDI {MODEL_INPUT_SOURCES.structural.sourceDate}; 46 economies source-backed, England &amp; Scotland official-derived from ONS / Scottish Government figures - no separate World Bank economy).</li>
        </ul>
      </Section>

      <Section title="Model inputs: source status and placeholder caps">
        <p>
          Each input family carries an explicit, honest <strong>status</strong>:{" "}
          <em>verified</em> (regulation/official fact), <em>source-backed</em>
          {" "}(transcribed from a supplied citable snapshot), <em>candidate</em>
          {" "}(derived from cross-verified identity), <em>manual</em>
          {" "}(hand-authored directional estimate, no source yet) and{" "}
          <em>placeholder</em> (filler). The two strongest drivers - Elo rating
          and FIFA ranking - are now <em>source-backed</em> from supplied,
          validated 11 Jun 2026 snapshots; the remaining families are honestly
          labelled and a value is never claimed source-backed without a citation.
        </p>
        <p>
          So low-confidence <strong>placeholder</strong> families cannot silently
          drive the forecast, each placeholder driver is capped at{" "}
          <strong>+/-{PLACEHOLDER_CONTRIBUTION_CAP}</strong> Elo-equivalent points,
          and all placeholder families combined are capped at{" "}
          <strong>+/-{TOTAL_PLACEHOLDER_CONTRIBUTION_CAP}</strong>. Squad quality
          and recent form are placeholders today, so their influence is limited;
          the climate-suitability <em>candidate</em> is similarly capped at{" "}
          <strong>+/-{CLIMATE_CONTRIBUTION_CAP}</strong> as a deliberately weak
          prior; the Elo anchor and FIFA ranking are source-backed and keep their
          full weight. Capped contributions are labelled in each match&apos;s
          driver explanation.
        </p>
      </Section>

      <Section title="How expected goals become probabilities">
        <p>
          The rating edge is converted to a goal &ldquo;supremacy&rdquo; ({SCORELINE_CONFIG.supremacyPerGoal} Elo
          points ~= one goal) and split around a league-average total of{" "}
          {SCORELINE_CONFIG.baseTotalGoals} goals. We then model each team&apos;s goals as an
          independent Poisson distribution and read off the chance of every
          scoreline - which gives us win/draw/loss and the most likely results.
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
            {BRACKET_ACTIVE ? " - official path active" : " - placeholder seeding"}
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

      <Section title="Group-stage fixtures">
        <p>
          Group composition is source-verified (candidate), and the six matches
          in each group are generated strictly from the FIFA{" "}
          <strong>Article 12.4</strong> draw-position chart - the regulation
          pairings (MD1: 1v2, 3v4; MD2: 1v3, 4v2; MD3: 4v1, 2v3). Only the three
          co-hosts have a source-backed draw slot (Mexico A1, Canada B1, USA D1);
          the remaining positions use an internal placeholder ordering purely to
          form pairings.
        </p>
        <p>
          Because the official chronological schedule (match dates, kickoff times
          and venue assignments) is not yet source-verified, these fixtures are
          labelled <strong>position-generated</strong> and shown without kickoff
          dates. The real schedule may list matches in a different order than the
          regulation pairing chart - we never present the generated order as
          official until the FIFA schedule is supplied and validated.
        </p>
        <p>
          The official FIFA match schedule (PDF v17, 10 Apr 2026, &ldquo;subject
          to change&rdquo;) has now been transcribed into an isolated staging
          layer and verified, but is <strong>not yet activated</strong> &mdash;
          production fixtures remain position-generated until activation is
          reviewed and approved.
        </p>
      </Section>

      <Section title="What is placeholder data">
        <p>
          FIFA ranking and Elo rating are <strong>source-backed</strong> from
          supplied 11 Jun 2026 snapshots, and the structural prior (GDP and
          population) is now <strong>source-backed for 46 teams</strong> from the
          World Bank World Development Indicators (2024); England and Scotland are
          <strong>official-derived</strong> from ONS / Scottish Government figures
          (they have no separate World Bank economy), which is why the family stays
          <strong>candidate</strong> overall. Climate suitability is also now a
          <strong>candidate</strong> family (Phase 1.13): a 12-month home-climate
          playability score from World Bank Climate Knowledge Portal 1991-2020
          normals (England &amp; Scotland from Met Office / HadUK-Grid), kept
          capped. The remaining numeric inputs (squad quality and form) are
          realistic but hand-authored <strong>placeholder</strong> values, and the
          knockout bracket mapping is still illustrative. Each is structured to be
          swapped for a real data source without touching the model or UI.
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
          <em> distribution of plausible outcomes</em> from a transparent model -
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
