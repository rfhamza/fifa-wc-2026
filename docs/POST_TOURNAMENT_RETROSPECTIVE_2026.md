# BeyondVAR 2026 Post-Tournament Retrospective - RETROSPECTIVE / EVALUATION

> **RETROSPECTIVE EVALUATION.** This is a retrospective evaluation report. It does not
> change the model, regenerate forecasts, or alter public outputs. The source of truth is
> the validated retrospective artifacts and `tests/post-tournament-retrospective.test.ts`.
> Archived pre-match forecasts are separated from retrospective-model forecasts throughout.

The machine-enforced source of truth is tests/post-tournament-retrospective.test.ts. This Markdown report is the readable retrospective generated from the validated artifacts.

Results ledger: `retrospective-results-2026-07-19-after-match-104` (104 matches, as of 2026-07-26T16:31:08.169Z).
Regenerate with `WRITE_RETROSPECTIVE=1 npx vitest run tests/post-tournament-retrospective.test.ts`.

## 1. Executive summary

BeyondVAR's pre-tournament title favourite was **Spain** at a 27.90% Title chance. The tournament was won by **Spain**, who started as the model's **#1** title contender at 27.90%.

**The model's pre-tournament favourite won the tournament.**

| Headline | Value |
| --- | --- |
| Pre-tournament title favourite | Spain (27.90%) |
| Actual champion | Spain |
| Champion pre-tournament Title chance | 27.90% (rank #1) |
| Runner-up | Argentina - 21.10% (rank #2) |
| Champion inside pre-tournament top 3 | yes |
| Champion inside pre-tournament top 5 | yes |
| Champion inside pre-tournament top 10 | yes |
| Teams rated above the champion | 0 |
| Strongest stage result | Reach semifinal (4/4 correct) |
| Weakest stage result | Reach quarterfinal (5/8 correct) |

### Biggest model hit

The four semifinalists were the model's pre-tournament ranks 1, 2, 3, 4 by Title chance.
The final four were exactly the pre-tournament top four - the single strongest result in this dataset.

The model named the champion, the runner-up and the entire final four in advance. For a 48-team field decided months later, that is the strongest evidence in this report that the strength priors carry real signal.

The clearest unforeseen run was **Norway**, ranked #19 pre-tournament, who reached the quarterfinal (surprise 1.50 rungs against forecast).

### Biggest model miss

The largest negative divergence was **Turkiye**, whose run ended at the group stage against an expected depth of 1.82 rungs (surprise -1.82).
The costliest single call was **M91**: the model favoured Brazil at 69.7% to advance, and Norway went through.


### Headline calibration finding

Across all 48 teams the pre-tournament Title chance carried a Brier score of 0.0124
against a base rate of 2.08% (one champion in 48). Title and Final are
single-outcome events, so these numbers carry very wide uncertainty and are reported for
completeness rather than as a calibration verdict. The meaningful calibration signal sits in
the qualification and Round-of-32 bands, where every team contributes an observation - see
section 10.

### Product interpretation

The model was strongest exactly where a probabilistic tournament forecast is most useful and
hardest to fake: separating the genuine title contenders from the field months in advance. It
identified the eventual champion, the runner-up and the whole final four at the top of its
pre-tournament ranking, and its knockout advancement calls were both accurate and correctly
ordered by confidence. It was weakest on exact scorelines, which is expected from a
Poisson-shaped goal model, and on individual group-stage placings, where three matches leave
very little signal and the format's third-place route adds genuine irreducible noise. The
product implication is that BeyondVAR should keep leading with stage-level and advancement
narratives, and continue to present scorelines as illustrative shapes rather than predictions.

## 2. Forecast timeline

Public checkpoints only. The committed public snapshot chain is the baseline plus the
group-stage milestones; the terminal M104 artifact is included as the endpoint.

| Checkpoint | Title favourite | Favourite Title chance | Champion Title chance | Champion rank | Biggest riser | Biggest faller |
| --- | --- | --: | --: | --: | --- | --- |
| Tournament start (M0) | Spain | 27.90% | 27.90% | #1 | - | - |
| Group matchday 1 complete (M24) | Spain | 27.00% | 27.00% | #1 | Argentina +3.8pp | Spain -0.9pp |
| Group matchday 2 complete (M48) | Spain | 28.85% | 28.85% | #1 | Spain +1.8pp | England -1.4pp |
| Group stage complete (M72) | Argentina | 30.10% | 25.55% | #2 | Argentina +4.9pp | Spain -3.3pp |
| M104 (final, terminal) | Spain | 100.00% | 100.00% | #1 | Spain +74.4pp | Argentina -30.1pp |

### Top five Title chance by checkpoint

- **Tournament start (M0)**: 1. Spain 27.90% | 2. Argentina 21.10% | 3. France 13.05% | 4. England 8.30% | 5. Portugal 5.15%
- **Group matchday 1 complete (M24)**: 1. Spain 27.00% | 2. Argentina 24.90% | 3. France 14.20% | 4. England 8.15% | 5. Brazil 5.05%
- **Group matchday 2 complete (M48)**: 1. Spain 28.85% | 2. Argentina 25.20% | 3. France 13.40% | 4. England 6.75% | 5. Portugal 5.10%
- **Group stage complete (M72)**: 1. Argentina 30.10% | 2. Spain 25.55% | 3. France 14.30% | 4. England 7.95% | 5. Brazil 4.65%
- **M104 (final, terminal)**: 1. Spain 100.00% | 2. Algeria 0.00% | 3. Argentina 0.00% | 4. Australia 0.00% | 5. Austria 0.00%

### Limitation: no knockout-stage title-probability path

The rolling current-forecast object is overwritten on every refresh, so only the terminal
M104 state survives. The model's title-probability path across the knockout stage (M73-M103)
was not retained and is **not recoverable**. The jump from the group-stage checkpoint to the
terminal endpoint in the table above is therefore a gap in the record, not a modelling
artefact, and no intermediate knockout title-probability path is claimed anywhere in this report.

What does survive is the archived per-tie forecast set. Those are **match/tie advancement
probabilities**, a different quantity from tournament Title chance, and they are reported as
such in sections 7 and 8 - never restyled as a title-probability timeline.

## 3. Champion forecast retrospective

### Pre-tournament top 10 by Title chance

| Rank | Team | Title chance | Reach final | Actual result |
| --: | --- | --: | --: | --- |
| 1 | Spain | 27.90% | 39.95% | Champion |
| 2 | Argentina | 21.10% | 35.10% | Final |
| 3 | France | 13.05% | 22.65% | Semifinal |
| 4 | England | 8.30% | 16.05% | Semifinal |
| 5 | Portugal | 5.15% | 12.20% | Round of 16 |
| 6 | Brazil | 4.90% | 11.25% | Round of 16 |
| 7 | Netherlands | 3.00% | 8.05% | Round of 32 |
| 8 | Colombia | 2.95% | 8.40% | Round of 16 |
| 9 | Germany | 2.30% | 5.30% | Round of 32 |
| 10 | Belgium | 1.60% | 4.10% | Quarterfinal |

- The eventual champion, Spain, was ranked **#1** of 48 before a ball was kicked,
  with a 27.90% Title chance.
- **0** teams were given a higher pre-tournament Title chance.
- The model's pre-tournament favourite **won** the tournament.

### Finalists and semifinalists, by pre-tournament standing

| Team | Pre-tournament rank | Title chance | Reach final | Reach semifinal | Actual result |
| --- | --: | --: | --: | --: | --- |
| Argentina | #2 | 21.10% | 35.10% | 47.50% | Final |
| England | #4 | 8.30% | 16.05% | 31.20% | Semifinal |
| France | #3 | 13.05% | 22.65% | 42.10% | Semifinal |
| Spain | #1 | 27.90% | 39.95% | 53.40% | Champion |

No team from the pre-tournament top 10 exited in the group stage.

## 4. Group-stage retrospective

Definitions (deterministic, fixed in advance):

- **Model top-2 pick** - the two teams in that group with the highest pre-tournament `qualifyTop2`.
- **Likely qualifier** - pre-tournament qualification probability >= 50%.
- **Upset qualifier** - qualified with a pre-tournament qualification probability below 35%.
- **Unexpected exit** - eliminated despite a pre-tournament qualification probability of 65% or above.

Actual placings come from internal Article 13 standings, never from provider fields.

| Group | Model top-2 picks | Actual top 2 | Correct | Model winner pick | Actual winner | Actual third | Third qualified | Notes |
| --- | --- | --- | --: | --- | --- | --- | --- | --- |
| A | Mexico, South Korea | Mexico, South Africa | 1/2 | Mexico | Mexico | South Korea | no | upset qualifier: South Africa; unexpected exit: Czechia, South Korea |
| B | Switzerland, Canada | Switzerland, Canada | 2/2 | Switzerland | Switzerland | Bosnia & Herzegovina | yes | - |
| C | Brazil, Morocco | Brazil, Morocco | 2/2 | Brazil | Brazil | Scotland | no | unexpected exit: Scotland |
| D | Turkiye, United States | United States, Australia | 1/2 | Turkiye | United States | Paraguay | yes | unexpected exit: Turkiye |
| E | Germany, Ecuador | Germany, Ivory Coast | 1/2 | Germany | Germany | Ecuador | yes | - |
| F | Netherlands, Japan | Netherlands, Japan | 2/2 | Netherlands | Netherlands | Sweden | yes | - |
| G | Belgium, Iran | Belgium, Egypt | 1/2 | Belgium | Belgium | Iran | no | unexpected exit: Iran |
| H | Spain, Uruguay | Spain, Cape Verde | 1/2 | Spain | Spain | Uruguay | no | upset qualifier: Cape Verde; unexpected exit: Uruguay |
| I | France, Norway | France, Norway | 2/2 | France | France | Senegal | yes | - |
| J | Argentina, Austria | Argentina, Austria | 2/2 | Argentina | Argentina | Algeria | yes | - |
| K | Portugal, Colombia | Colombia, Portugal | 2/2 | Portugal | Colombia | DR Congo | yes | upset qualifier: DR Congo |
| L | England, Croatia | England, Croatia | 2/2 | England | England | Ghana | yes | upset qualifier: Ghana; unexpected exit: Panama |

### Aggregate

| Metric | Value |
| --- | --: |
| Exact top-2 set hits | 7/12 |
| Team-level top-2 hits | 19/24 (79.2%) |
| Group winners correctly identified | 10/12 |
| Round-of-32 qualification accuracy | 25/32 (78.1%) |

- **Most predictable groups** (exact top two and correct winner): B, C, F, I, J, L.
- **Most chaotic groups** (at most one of the top two identified): A, D, E, G, H.
- **Biggest group-stage surprises - unexpected exits**: Uruguay (94.3% to qualify), Turkiye (85.6% to qualify), South Korea (85.5% to qualify), Iran (85.0% to qualify), Scotland (70.5% to qualify), Panama (66.8% to qualify), Czechia (65.5% to qualify).
- **Surprise qualifiers**: Ghana (9.1% to qualify), South Africa (18.3% to qualify), Cape Verde (29.5% to qualify), DR Congo (30.6% to qualify).

## 5. Third-place qualification retrospective

The 2026 format promotes the eight best third-placed teams. Ranking and allocation below are
internal (Article 13 plus the official Annexe C bracket), not provider-derived.

| Annexe C rank | Team | Group | Pre-tournament third-place probability | Qualified |
| --: | --- | --- | --: | --- |
| 1 | DR Congo | K | 20.30% | yes |
| 2 | Sweden | F | 29.55% | yes |
| 3 | Ecuador | E | 11.70% | yes |
| 4 | Ghana | L | 6.70% | yes |
| 5 | Bosnia & Herzegovina | B | 32.70% | yes |
| 6 | Algeria | J | 24.70% | yes |
| 7 | Paraguay | D | 20.20% | yes |
| 8 | Senegal | I | 28.75% | yes |
| 9 | Iran | G | 21.90% | no |
| 10 | South Korea | A | 19.90% | no |
| 11 | Scotland | C | 34.05% | no |
| 12 | Uruguay | H | 8.05% | no |

- Third-placed teams that advanced: DR Congo, Sweden, Ecuador, Ghana, Bosnia & Herzegovina, Algeria, Paraguay, Senegal.
- Third-placed teams eliminated: Iran, South Korea, Scotland, Uruguay.
- Team-level third-place qualification, scored over the twelve actual third-placed teams:
  Brier 0.4297, mean forecast 21.54% against a realised rate of 66.67%.

### Limitation: no scenario-level Annexe C probabilities

The forecast stores a per-team third-place qualification probability only. It does **not** store
probabilities over the 495 Annexe C third-place group combinations, so the accuracy of the
realised combination against high-probability scenarios cannot be evaluated. Only team-level
third-place accuracy is reported here, and no scenario-level probability is inferred.

## 6. Knockout reach-stage retrospective

For each stage the predicted set is the model's top N by that probability, where N is the
number of places that actually existed. This keeps a probability from being read as a
deterministic claim while still producing a checkable set.

| Stage | Slots | Correctly identified | Hit rate | Highest-probability misses | Lowest-probability qualifiers |
| --- | --: | --: | --: | --- | --- |
| Reach round of 32 | 32 | 25 | 78.1% | Uruguay (94.3%), Turkiye (85.6%), South Korea (85.5%) | Ghana (9.1%), South Africa (18.3%), Cape Verde (29.5%) |
| Reach round of 16 | 16 | 11 | 68.8% | Germany (62.9%), Turkiye (58.0%), Netherlands (57.8%) | Egypt (25.0%), Paraguay (29.9%), United States (33.2%) |
| Reach quarterfinal | 8 | 5 | 62.5% | Portugal (43.0%), Brazil (39.9%), Netherlands (38.3%) | Norway (18.1%), Morocco (18.9%), Switzerland (25.7%) |
| Reach semifinal | 4 | 4 | 100.0% | - | - |
| Reach final | 2 | 2 | 100.0% | - | - |
| Title chance | 1 | 1 | 100.0% | - | - |

### Teams reaching each stage

- **Reach round of 32** (32): Algeria, Argentina, Australia, Austria, Belgium, Bosnia & Herzegovina, Brazil, Canada, Cape Verde, Colombia, DR Congo, Croatia, Ecuador, Egypt, England, France, Germany, Ghana, Ivory Coast, Japan, Mexico, Morocco, Netherlands, Norway, Paraguay, Portugal, Senegal, South Africa, Spain, Sweden, Switzerland, United States.
- **Reach round of 16** (16): Argentina, Belgium, Brazil, Canada, Colombia, Egypt, England, France, Mexico, Morocco, Norway, Paraguay, Portugal, Spain, Switzerland, United States.
- **Reach quarterfinal** (8): Argentina, Belgium, England, France, Morocco, Norway, Spain, Switzerland.
- **Reach semifinal** (4): Argentina, England, France, Spain.
- **Reach final** (2): Argentina, Spain.
- **Title chance** (1): Spain.

## 7. Bracket path retrospective (M73-M104)

Forecast provenance is stated per row. 26 of 32 knockout ties have a
genuine archived pre-match forecast; the rest are marked `unavailable` and contribute to no
aggregate. No forecast is reconstructed for those ties.

| M | Stage | Match | Score | Winner | Provenance | Pre-match favourite | Favourite prob. | Favourite won | Top scoreline | Scoreline |
| --: | --- | --- | --- | --- | --- | --- | --: | --- | --- | --- |
| 73 | roundOf32 | South Africa v Canada | 0-1 | Canada | unavailable | - | - | - | - | - |
| 74 | roundOf32 | Germany v Paraguay | 1-1 (pens 3-4) | Paraguay | unavailable | - | - | - | - | - |
| 75 | roundOf32 | Netherlands v Morocco | 1-1 (pens 2-3) | Morocco | unavailable | - | - | - | - | - |
| 76 | roundOf32 | Brazil v Japan | 2-1 | Brazil | unavailable | - | - | - | - | - |
| 77 | roundOf32 | France v Sweden | 3-0 | France | archived-pre-match-forecast | France | 93.0% | yes | 2-0 | direction only |
| 78 | roundOf32 | Ivory Coast v Norway | 1-2 | Norway | unavailable | - | - | - | - | - |
| 79 | roundOf32 | Mexico v Ecuador | 2-0 | Mexico | archived-pre-match-forecast | Mexico | 53.8% | yes | 1-1 | miss |
| 80 | roundOf32 | England v DR Congo | 2-1 | England | archived-pre-match-forecast | England | 93.2% | yes | 2-0 | direction only |
| 81 | roundOf32 | United States v Bosnia & Herzegovina | 2-0 | United States | archived-pre-match-forecast | United States | 80.8% | yes | 1-0 | direction only |
| 82 | roundOf32 | Belgium v Senegal | 3-2 | Belgium | archived-pre-match-forecast | Belgium | 60.9% | yes | 1-1 | miss |
| 83 | roundOf32 | Portugal v Croatia | 2-1 | Portugal | archived-pre-match-forecast | Portugal | 66.4% | yes | 1-1 | miss |
| 84 | roundOf32 | Spain v Austria | 3-0 | Spain | archived-pre-match-forecast | Spain | 90.6% | yes | 2-0 | direction only |
| 85 | roundOf32 | Switzerland v Algeria | 2-0 | Switzerland | archived-pre-match-forecast | Switzerland | 66.5% | yes | 1-1 | miss |
| 86 | roundOf32 | Argentina v Cape Verde | 3-2 | Argentina | archived-pre-match-forecast | Argentina | 98.0% | yes | 2-0 | direction only |
| 87 | roundOf32 | Colombia v Ghana | 1-0 | Colombia | archived-pre-match-forecast | Colombia | 97.7% | yes | 2-0 | direction only |
| 88 | roundOf32 | Australia v Egypt | 1-1 (pens 2-4) | Egypt | archived-pre-match-forecast | Australia | 60.1% | no | 1-1 | exact |
| 89 | roundOf16 | Paraguay v France | 0-1 | France | archived-pre-match-forecast | France | 83.0% | yes | 0-1 | exact |
| 90 | roundOf16 | Canada v Morocco | 0-3 | Morocco | archived-pre-match-forecast | Morocco | 58.4% | yes | 1-1 | miss |
| 91 | roundOf16 | Brazil v Norway | 1-2 | Norway | archived-pre-match-forecast | Brazil | 69.7% | no | 1-0 | miss |
| 92 | roundOf16 | Mexico v England | 2-3 | England | archived-pre-match-forecast | England | 64.1% | yes | 1-1 | miss |
| 93 | roundOf16 | Portugal v Spain | 0-1 | Spain | archived-pre-match-forecast | Spain | 70.8% | yes | 0-1 | exact |
| 94 | roundOf16 | United States v Belgium | 1-4 | Belgium | archived-pre-match-forecast | Belgium | 68.2% | yes | 0-1 | direction only |
| 95 | roundOf16 | Argentina v Egypt | 3-2 | Argentina | archived-pre-match-forecast | Argentina | 95.9% | yes | 2-0 | direction only |
| 96 | roundOf16 | Switzerland v Colombia | 0-0 (pens 4-3) | Switzerland | archived-pre-match-forecast | Colombia | 67.2% | no | 0-1 | miss |
| 97 | quarterFinal | France v Morocco | 2-0 | France | archived-pre-match-forecast | France | 79.1% | yes | 1-0 | direction only |
| 98 | quarterFinal | Spain v Belgium | 2-1 | Spain | archived-pre-match-forecast | Spain | 83.3% | yes | 1-0 | direction only |
| 99 | quarterFinal | Norway v England | 1-2 | England | unavailable | - | - | - | - | - |
| 100 | quarterFinal | Argentina v Switzerland | 3-1 | Argentina | archived-pre-match-forecast | Argentina | 82.7% | yes | 1-0 | direction only |
| 101 | semiFinal | France v Spain | 0-2 | Spain | archived-pre-match-forecast | Spain | 61.6% | yes | 1-1 | miss |
| 102 | semiFinal | England v Argentina | 1-2 | Argentina | archived-pre-match-forecast | Argentina | 66.3% | yes | 1-1 | miss |
| 103 | thirdPlace | France v England | 4-6 | England | archived-pre-match-forecast | France | 57.4% | no | 1-1 | miss |
| 104 | final | Spain v Argentina | 1-0 | Spain | archived-pre-match-forecast | Spain | 52.4% | yes | 1-1 | miss |

### Aggregate - archived pre-match forecasts only

Coverage: 26 of 32 knockout ties. Missing: M73, M74, M75, M76, M78, M99.

| Metric | Value |
| --- | --: |
| Ties evaluated | 26 |
| Favourite win rate | 22/26 (84.6%) |
| Average favourite probability | 73.9% |
| Average confidence when correct | 75.8% |
| Average confidence when wrong | 63.6% |
| Upsets (favourite eliminated) | 4 |
| Binary Brier (favourite perspective) | 0.1302 |
| Binary log-loss | 0.4078 |
| Exact scoreline hits | 3/26 (11.5%) |
| Result-direction hits | 14/26 (53.8%) |

### Accuracy by round (archived only)

| Round | Evaluated | Correct | Accuracy |
| --- | --: | --: | --: |
| roundOf32 | 11 | 10 | 90.9% |
| roundOf16 | 8 | 6 | 75.0% |
| quarterFinal | 3 | 3 | 100.0% |
| semiFinal | 2 | 2 | 100.0% |
| thirdPlace | 1 | 0 | 0.0% |
| final | 1 | 1 | 100.0% |

**Biggest upset by pre-match probability:** M91, Brazil favoured at 69.7% to advance; Norway progressed. This is also the highest-confidence miss in the archived set.

## 8. Match-level prediction retrospective

Two evaluations, deliberately kept apart and never pooled:

1. **Group stage, 90-minute W/D/L** - scored with the shared backtesting metrics helper.
2. **Knockout, advancement** - which team progressed.

They are not comparable, and they do not share a provenance:

| Evaluation | Target | Provenance | Coverage |
| --- | --- | --- | --- |
| Group stage | 90-minute W/D/L | `retrospective-model-forecast` | 72/72 |
| Knockout | Advancement | `archived-pre-match-forecast` | 26/32 |

> **Provenance warning.** No group-stage match forecast was ever archived. The group numbers
> below are `retrospective-model-forecast` values: the model re-evaluated from frozen
> pre-tournament inputs after the fact. Because those inputs are static pre-tournament, this
> reproduces what the model would have said on day zero - but it is **not** a captured
> pre-match archive and must not be presented as one, or compared like-for-like with the
> knockout numbers.

### Group stage - 90-minute W/D/L (retrospective-model-forecast)

| Metric | Value |
| --- | --: |
| Matches evaluated | 72 |
| Outcome accuracy (argmax) | 62.5% |
| Ranked probability score | 0.1598 |
| Log-loss | 0.8860 |
| Brier (3-class) | 0.5295 |
| Average confidence when correct | 66.9% |
| Average confidence when wrong | 61.3% |

### Knockout - advancement (archived-pre-match-forecast)

| Metric | Value |
| --- | --: |
| Ties evaluated | 26 of 32 |
| Advancement accuracy | 22/26 (84.6%) |
| Binary Brier | 0.1302 |
| Binary log-loss | 0.4078 |
| Average confidence when correct | 75.8% |
| Average confidence when wrong | 63.6% |

Confidence is correctly ordered: the model was measurably more confident on the ties it got
right than on the ties it got wrong, which is the behaviour a usable probability should show.

### Biggest correct calls (archived)

- M86: Argentina at 98.0% - advanced.
- M87: Colombia at 97.7% - advanced.
- M95: Argentina at 95.9% - advanced.
- M80: England at 93.2% - advanced.
- M77: France at 93.0% - advanced.

### Biggest misses (archived)

- M91: Brazil at 69.7% - Norway advanced.
- M96: Colombia at 67.2% - Switzerland advanced.
- M88: Australia at 60.1% - Egypt advanced.
- M103: France at 57.4% - England advanced.

### Note on the 90-minute / extra-time split

Knockout rows store 90 minutes plus extra time combined, with the shootout carried separately.
A regulation-only result therefore cannot be recovered for knockout ties, so knockout matches
are scored on advancement and never on 90-minute W/D/L. Pooling the two would silently count a
tie settled in extra time as a regulation win.

## 9. Scoreline-level retrospective

Scored against the most likely scoreline (`topScorelines[0]`) from archived pre-match
forecasts only. Scores are the regulation-corrected values from the retrospective ledger: the
provider folds a penalty shootout into full-time, so the raw field would have compared a goal
forecast against a number that includes penalty kicks.

### Coverage

| Scope | With scoreline forecast | Without | Total |
| --- | --: | --: | --: |
| Knockout (M73-M104) | 26 | 6 | 32 |

| Stage | With forecast | Total |
| --- | --: | --: |
| roundOf32 | 11 | 16 |
| roundOf16 | 8 | 8 |
| quarterFinal | 3 | 4 |
| semiFinal | 2 | 2 |
| thirdPlace | 1 | 1 |
| final | 1 | 1 |

Group-stage scoreline forecasts were never archived (0 of 72), so no group scoreline accuracy
is reported. Missing knockout ties: M73, M74, M75, M76, M78, M99.

### Accuracy

| Metric | Value |
| --- | --: |
| Exact scoreline | 3/26 (11.5%) |
| Correct goal difference | 4/26 (15.4%) |
| Correct total-goals bucket (0-1 / 2-3 / 4+) | 13/26 (50.0%) |
| Correct result direction | 14/26 (53.8%) |
| Mean absolute goal error (both sides) | 1.92 |
| Mean total-goals error | 1.62 |

### Best scoreline predictions

- M88 Australia v Egypt: predicted 1-1, actual 1-1 - exact.
- M89 Paraguay v France: predicted 0-1, actual 0-1 - exact.
- M93 Portugal v Spain: predicted 0-1, actual 0-1 - exact.
- M77 France v Sweden: predicted 2-0, actual 3-0.
- M80 England v DR Congo: predicted 2-0, actual 2-1.

### Largest scoreline misses

- M103 France v England: predicted 1-1, actual 4-6 (goal error 8).
- M94 United States v Belgium: predicted 0-1, actual 1-4 (goal error 4).
- M82 Belgium v Senegal: predicted 1-1, actual 3-2 (goal error 3).
- M86 Argentina v Cape Verde: predicted 2-0, actual 3-2 (goal error 3).
- M90 Canada v Morocco: predicted 1-1, actual 0-3 (goal error 3).

Exact-scoreline accuracy is low in absolute terms, which is the expected behaviour of a
Poisson-shaped goal model: the most likely single scoreline in an evenly matched game rarely
exceeds a low-teens percentage, so a hit rate near that level indicates the distribution is
behaving, not that the model is malfunctioning. Scorelines should continue to be presented as
illustrative shapes rather than predictions.

## 10. Probability calibration retrospective

Each team-versus-stage pair is one binary observation: the pre-tournament probability of
reaching that stage, against whether the team did. All 48 teams contribute to every stage, so
the qualification and Round-of-32 rows are the statistically meaningful ones; Reach final and
Title chance rest on one or two realised outcomes and are shown for completeness only.

### Summary by stage

| Stage | Observations | Mean forecast | Realised rate | Brier | Log-loss |
| --- | --: | --: | --: | --: | --: |
| Reach round of 32 | 48 | 66.67% | 66.67% | 0.1827 | 0.5399 |
| Reach round of 16 | 48 | 33.33% | 33.33% | 0.1268 | 0.3862 |
| Reach quarterfinal | 48 | 16.67% | 16.67% | 0.0874 | 0.2773 |
| Reach semifinal | 48 | 8.33% | 8.33% | 0.0334 | 0.1215 |
| Reach final | 48 | 4.17% | 4.17% | 0.0191 | 0.0685 |
| Title chance | 48 | 2.08% | 2.08% | 0.0124 | 0.0425 |

> **Do not read the mean-forecast column as a calibration result.** It equals the realised
> rate at every stage by construction, not by merit: each simulated tournament produces
> exactly the real number of qualifiers at each stage, so the probabilities sum to the slot
> count and the mean must equal the observed frequency. Aggregate agreement here is
> mechanical. The informative quantities are the Brier and log-loss columns, which respond to
> whether the probability was attached to the RIGHT teams, and the reliability bands below.

### Reliability table - all team-versus-stage observations pooled

Pooled across the 6 reach-stage metrics and 48 teams
(288 observations). A positive gap means the model under-forecast that band.

| Band | Count | Mean forecast | Observed frequency | Gap |
| --- | --: | --: | --: | --: |
| 0-10% | 162 | 1.82% | 0.62% | -1.2pp |
| 10-20% | 28 | 15.00% | 10.71% | -4.3pp |
| 20-30% | 20 | 24.89% | 25.00% | +0.1pp |
| 30-40% | 17 | 35.92% | 47.06% | +11.1pp |
| 40-50% | 6 | 44.47% | 50.00% | +5.5pp |
| 50-60% | 11 | 55.11% | 63.64% | +8.5pp |
| 60-70% | 12 | 64.99% | 75.00% | +10.0pp |
| 70-80% | 8 | 73.12% | 87.50% | +14.4pp |
| 80-90% | 7 | 84.39% | 57.14% | -27.2pp |
| 90-100% | 17 | 96.94% | 94.12% | -2.8pp |

Pooled Brier 0.0770, log-loss 0.2393, mean forecast
21.88% against a realised rate of 21.88%.
The largest deviation is the 80-90% band (7 observations, gap -27.2pp).

The shape worth noting is in the middle of the range: 6 of the 10 populated
bands sit above their forecast, and the mid-range bands are under-forecast by a consistent
margin. Read plainly, teams the model rated as live-but-not-favoured advanced somewhat more
often than it implied. The counter-signal is the second-highest band, which ran the other way.
Both observations rest on single-digit to low-double-digit counts from one tournament, so they
are a direction to test against future data, not a correction to apply now.

### Knockout advancement calibration (archived forecasts)

Over 26 archived ties scored from the favourite's
perspective: Brier 0.1302, log-loss 0.4078,
mean favourite probability 73.9% against a realised
favourite win rate of 84.6%.

### Small-sample caveat

Reach final and Title chance resolve to two and one realised outcomes respectively. Any Brier
or log-loss at those stages is dominated by a single tournament outcome and cannot support a
calibration claim in either direction. They are reported so the table is complete, and should
not be quoted as evidence that the model is or is not well calibrated at the top of the
bracket. A calibration verdict at those stages needs several tournaments, not one.

## 11. Overperformers and underperformers

Surprise is the number of ladder rungs a team actually cleared minus its expected depth (the
sum of its pre-tournament reach-stage probabilities). Positive means the team went further
than the forecast implied.

### Outperformed forecast

| Team | Baseline Title chance | Baseline rank | Actual result | Expected depth | Surprise |
| --- | --: | --: | --- | --: | --: |
| Spain | 27.90% | #1 | Champion | 3.66 | 2.34 |
| Argentina | 21.10% | #2 | Final | 3.40 | 1.60 |
| Norway | 0.45% | #19 | Quarterfinal | 1.50 | 1.50 |
| Morocco | 0.50% | #18 | Quarterfinal | 1.56 | 1.44 |
| England | 8.30% | #4 | Semifinal | 2.74 | 1.26 |
| Switzerland | 0.60% | #17 | Quarterfinal | 1.98 | 1.02 |
| Egypt | 0.00% | #36 | Round of 16 | 1.02 | 0.98 |
| Paraguay | 0.05% | #28 | Round of 16 | 1.04 | 0.96 |

### Underperformed forecast

| Team | Baseline Title chance | Baseline rank | Actual result | Expected depth | Surprise |
| --- | --: | --: | --- | --: | --: |
| Turkiye | 1.00% | #15 | Group stage | 1.82 | -1.82 |
| Uruguay | 1.30% | #14 | Group stage | 1.64 | -1.64 |
| South Korea | 0.20% | #20 | Group stage | 1.49 | -1.49 |
| Iran | 0.00% | #39 | Group stage | 1.38 | -1.38 |
| Netherlands | 3.00% | #7 | Round of 32 | 2.23 | -1.23 |
| Germany | 2.30% | #9 | Round of 32 | 2.14 | -1.14 |
| Scotland | 0.10% | #25 | Group stage | 0.99 | -0.99 |
| Ecuador | 1.30% | #13 | Round of 32 | 1.96 | -0.96 |

### Reading this table honestly

Raw surprise rewards depth, so the teams that went furthest sit at the top whether or not
they were expected to. The champion and runner-up lead the list because no team can clear
more rungs, not because their runs were unforeseen - both were the model's top two before a
ball was kicked. The genuinely unforeseen runs are the lower-rated sides below them.

The clearest surprise run by a lower-rated side was **Norway**, ranked #19 before the tournament, reaching the quarterfinal (surprise 1.50).
The clearest unexpected exit by a higher-rated side was **Netherlands**, ranked #7, whose tournament ended at the round of 32 (surprise -1.23).
Across the whole field the largest shortfall against forecast was **Turkiye**
(surprise -1.82).

## 12. Model driver retrospective

Driver decompositions are **not** persisted in any artifact, so these are recomputed from the
same frozen pre-tournament inputs the baseline used. They explain what the model liked about a
team before the tournament; they are not a post-hoc attribution of what happened.

Values are mean signed driver contributions across that team's three group fixtures, in
Elo-equivalent points, oriented so a positive number favours the team named.

| Team | Net advantage | Strongest supporting drivers | Strongest opposing drivers |
| --- | --: | --- | --- |
| Spain | 585.8 | Elo rating (475.0), FIFA ranking (64.1), Squad quality (20.0) | Tournament context (-0.2) |
| Argentina | 472.5 | Elo rating (354.3), FIFA ranking (52.3), Squad quality (20.0) | - |
| England | 397.0 | Elo rating (306.7), FIFA ranking (47.3), Squad quality (20.7) | Regional advantage (-6.0), Tournament context (-1.8) |
| France | 377.8 | Elo rating (269.3), FIFA ranking (43.9), Climate familiarity (22.2) | - |
| Norway | 38.1 | Elo rating (70.7), Structural depth (1.7) | Climate familiarity (-15.4), FIFA ranking (-8.4), Recent form (-5.4) |
| Brazil | 350.4 | Elo rating (272.0), FIFA ranking (47.3), Squad quality (21.7) | Regional advantage (-6.0), Climate familiarity (-1.1), Tournament context (-0.5) |
| Ghana | -507.0 | Tournament context (1.1) | Elo rating (-378.7), FIFA ranking (-77.1), Climate familiarity (-20.2) |
| Uruguay | 182.9 | Elo rating (121.7), FIFA ranking (38.3), Climate familiarity (11.0) | Tournament context (-1.1), Structural depth (-0.2) |
| Turkiye | 137.4 | Elo rating (132.0), Squad quality (13.1), FIFA ranking (8.9) | Host advantage (-20.0), Climate familiarity (-3.5), Structural depth (-0.4) |

### Reading these honestly

- The static strength priors - Elo and FIFA ranking - carried the top of the ranking, and the
  top of the ranking is where the model performed best. That is consistent with those signals
  being genuinely informative, and it is the part of the model that has been backtested.
- Squad quality and recent form remain capped placeholder inputs. They contributed to the
  ordering but their measured value cannot be separated from the strength priors they
  correlate with, so no claim is made about them here either way.
- The manager-cohesion signal carries zero model weight and did not affect any probability in
  this tournament.
- A results-based in-tournament performance signal was tested before the tournament and
  deliberately kept inactive. Nothing in this retrospective re-opens that decision: judging it
  on the same tournament it would have been fitted to is exactly the circularity the original
  decision avoided. It should be re-evaluated out-of-sample, not from this dataset.
- No model change is proposed on the strength of a single tournament. Section 14 separates
  what is evidenced from what merely looks appealing.

## 13. Product retrospective

### What BeyondVAR explained well

- **The title race.** The pre-tournament ranking put the eventual champion, the runner-up and
  the whole final four at the top, so the headline surface was telling a true story throughout.
- **Movement framing.** Presenting probability change as checkpoint intervals rather than
  per-match causation held up: the record does not support single-match causal claims, and the
  product never made them.
- **Advancement narratives.** Knockout ties were the model's strongest match-level output, and
  they are what the bracket and team-outlook surfaces lead with.
- **Honesty guardrails.** Elimination language was tied to canonical internal state rather than
  a zero probability, so no team was described as eliminated before it was.

### Where context was missing

- **The knockout title-probability path is gone.** The rolling current-forecast object was
  overwritten on every refresh. Users saw the path live; it cannot now be reconstructed, and
  this report is measurably poorer for it. This is the single biggest product-data regret.
- **Scoreline archive coverage is thin.** 26 of 104 matches have an archived pre-match
  forecast and none of them are group matches, so match-level retrospection is limited to the
  knockout stage.
- **No 90-minute / extra-time split.** Knockout results cannot be separated into regulation and
  extra time, which blocks like-for-like comparison with group matches.
- **Shootout scores needed correcting.** The provider folds penalties into full-time; this was
  found and corrected retrospectively, but it means live surfaces showed inflated knockout
  scorelines during the tournament.

### Narratives that were missing

- A tournament recap surface: nothing in the product tells the story of the tournament now that
  it is over.
- Bracket path difficulty: the model knew which routes were harder and never surfaced it.
- Per-team season stories: the data supports them and the team page stops short.

## 14. Recommendations for the next version

### Priority - high impact and needed before the next tournament

1. Retain every current-forecast snapshot during the tournament
2. Fix provider shootout normalisation upstream
3. Store the 90-minute / extra-time / penalty split explicitly
4. Preserve a complete match-forecast archive
5. Stronger squad and player-availability data
6. Match impact archive

The pattern is worth stating plainly: the highest-value fixes are **data-retention** fixes, not
model changes. The model performed well where it was measured. What limited this retrospective
was that evidence was discarded during the tournament.

### Model recommendations

| Recommendation | Impact | Effort | Risk | Before next tournament | Detail |
| --- | --- | --- | --- | --- | --- |
| Stage-specific calibration review | high | medium | low | no | Qualification-band calibration is measurable now; deep-stage calibration is not. Build the multi-tournament series needed before adjusting anything at the top of the bracket. |
| Improve scoreline calibration | medium | medium | medium | no | Exact-scoreline accuracy is the weakest measured output. A dispersion or correlation adjustment to the goal model is the obvious candidate, evaluated out-of-sample. |
| Stronger squad and player-availability data | high | high | medium | yes | Squad quality remains a capped placeholder. Real squad-value or availability data is the most plausible route to improving the mid-table, where the model was weakest. |
| Injury and suspension signal | medium | high | medium | no | Not currently modelled at all. Only worth adding if a reliable, timely feed exists. |
| Keep in-tournament performance inactive | low | low | low | no | The negative result stands. Do not activate it on the strength of this tournament; it must be shown to work out-of-sample first. |

### Product recommendations

| Recommendation | Impact | Effort | Risk | Before next tournament | Detail |
| --- | --- | --- | --- | --- | --- |
| Public tournament recap page | high | medium | low | no | This retrospective is internal. The strongest findings deserve a public surface. |
| Match impact archive | high | medium | low | yes | Preserve per-match impact so the story of the tournament survives the tournament. |
| Bracket path difficulty | medium | medium | low | no | The model already knows which routes are harder; surface it. |
| Richer team story pages | medium | medium | low | no | Extend the team outlook work into a full per-team tournament story. |
| Shareable cards | low | low | low | no | Distribution for the above; low risk, no model impact. |

### Data recommendations

| Recommendation | Impact | Effort | Risk | Before next tournament | Detail |
| --- | --- | --- | --- | --- | --- |
| Retain every current-forecast snapshot during the tournament | high | low | low | yes | The single most valuable fix. Overwriting the rolling object destroyed the knockout title-probability path permanently. Write to a versioned key per refresh. |
| Fix provider shootout normalisation upstream | high | low | low | yes | The provider folds the shootout into full-time. This retrospective corrected it locally, but the ingestion path still records inflated knockout scores and silently drops the shootout, because an inflated score reads as a decisive win and passes validation. Fix in normalisation. |
| Store the 90-minute / extra-time / penalty split explicitly | high | medium | low | yes | Would allow knockout matches to be scored on regulation W/D/L alongside advancement, making group and knockout evaluation directly comparable. |
| Preserve a complete match-forecast archive | high | low | low | yes | Only 26 of 104 matches were archived, and no group matches at all. Archive every pre-match forecast so match-level retrospection covers the whole tournament. |
| Venue and weather actuals | medium | medium | low | no | Would let the climate and travel priors finally be evaluated rather than assumed. |
| Lineup availability capture | medium | high | medium | no | Prerequisite for any injury or availability signal. |

## 15. Limitations

Stated plainly, because each one bounds a claim made above:

1. **Archived versus recomputed forecasts.** Only 26 of 104 matches have a genuine
   `archived-pre-match-forecast`, all of them knockout ties. Group-stage match numbers are
   `retrospective-model-forecast` values recomputed from frozen pre-tournament inputs. The two
   are never pooled, and every table states which it uses.
2. **No knockout title-probability path.** The rolling current-forecast object was overwritten
   on each refresh, so the model's title probabilities across M73-M103 are not recoverable. No
   intermediate knockout title-probability path is claimed anywhere in this report.
3. **No scenario-level Annexe C probabilities.** Third-place qualification is stored per team,
   not as probabilities over the 495 possible third-place group combinations, so combination
   accuracy cannot be evaluated and none is inferred.
4. **The shootout correction was retrospective-local.** Four knockout rows arrived with the
   penalty shootout folded into full-time. They were corrected in the retrospective artifact
   only; production ingestion was not modified, and it will reproduce the same inflated scores
   until the upstream fix in section 14 is made.
5. **No 90-minute / extra-time split.** Knockout results combine regulation and extra time, so
   knockout ties are scored on advancement only.
6. **Single-tournament samples at the top of the bracket.** Reach final and Title chance rest
   on one or two realised outcomes and cannot support a calibration verdict.
7. **No production model change.** This report changes no weight, no simulation, no forecast
   and no public surface. It is an evaluation of what was already published.

Source artifacts: `retrospective-results-2026-07-19-after-match-104`, the archived match-forecast set
(26 entries) and the terminal current forecast, all validated in
`tests/retrospective-artifacts.test.ts`.
