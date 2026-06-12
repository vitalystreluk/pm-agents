# Case Study — Two Battle Runs

Real artifacts from the two agents running on a real case: a WhatsApp automation platform for Brazilian SMBs. Nothing here is synthetic except where explicitly labeled.

## Run 1 — Strategy Agent

**[`strategy-botconversa.pdf`](strategy-botconversa.pdf)** — the final rendered document (v1.0, post-fix). What to look at:

- **Page 1 header**: `Data status: 0 confirmed · 26 estimates · 18 public-source` — the document counts its own data maturity.
- **TL;DR**: every number carries an inline status marker with source and verification date — resolved from the Claim Ledger, not written by the model.
- **"What Needs to Be True"**: five null baselines, each explaining which conclusion depends on it. This section *is* the data request to the company.
- **Appendix A**: the scoring rubric with per-criterion scores — totals computed by the renderer, not asserted by the model.
- **Appendix B**: the agent's adversarial self-review, shipped inside the document — every P0 either fixed or declared.
- **Appendix C**: the full ledger — 44 claims with statuses and sources.

**[`strategy-self-review.json`](strategy-self-review.json)** — the in-pipeline review (stage 1 of 3): 6 P0 issues found *before* synthesis, including a verdict that outran its own decision gate and an ordering constraint the roadmap had missed (instrumenting the North Star before its terminal states exist would count abandonment as resolution).

**[`strategy-external-review.md`](strategy-external-review.md)** — the external model review (stage 2 of 3): 5 more P0s, including the run's most valuable finding — an *architectural* bug in the render contract (numbers buried in statement sentences with null values), diagnosed from JSON alone, before anyone looked at the rendered document. Verdict quote: *"the document should open with the eleven null baselines — not close with them."*

Stage 3 (instrumented manual audit of the rendered DOCX) found 4 more issues — a prose-vs-list count mismatch, a scoring margin (3.9 vs 3.75) that didn't survive weight sensitivity, and raw currency ranges that had escaped tokenization. Each failure class from all three stages was encoded into schema rules or step prompts. Result across the loop: **38 broken claim markers → 0**.

## Run 2 — Eval Agent

**[`eval-report.md`](eval-report.md)** — the full evaluation report: 15 cases × 2 prompt variants for a feature that does not exist yet (pre-implementation evaluation via a two-pass dialogue simulator, PT-BR).

What to look at:

- **The winner is `INCONCLUSIVE`** — and that's the headline. Δ=0.03 between variants, entirely from one cell of one case. The system refused to declare a winner on noise; the product conclusion is that explicit escape-hatch instructions bought nothing measurable, so the cheaper base prompt wins by default.
- **Weakest case (3.80) is identical in both variants** — meaning the failure (the bot inventing a PIX workaround beyond its mandate, with no human handoff offered) is a *policy gap*, not a prompt defect. That's a feature-backlog item discovered before a line of the feature was written.
- **Per-segment scores**: `mixed` vertical is the weakest segment in both variants (4.20) — confused multi-business users are where the concierge needs design work.

Honest annotations (also see the report's own smoke-test banner):

- **Calibration is a smoke test** (N=5, ≥80% within-1-point per criterion) and used **cross-model proxy labels**, not blind human labels — disclosed in the run's `calibration.json`; the rubric now mandates blind collection (anchoring-bias rule).
- **The `self-preference-risk` flag on every row is metadata, not a failure**: the judge and the simulated bot share a model family, so the documented self-preference bias applies to the whole run uniformly. It is flagged globally precisely so the reader discounts accordingly.
- **Latency figures are simulator-side fields, not production measurements.** Cost figures are real token arithmetic.

## Why these artifacts are here

The repository's thesis is that AI conclusions without traceability to data are opinions. These two runs are the evidence: every number in the strategy traces to a ledger record; every judge verdict traces to a SHA-256-hashed transcript; and the review loop that hardened the pipeline is preserved in the git history — finding → schema rule → zero recurrence.
