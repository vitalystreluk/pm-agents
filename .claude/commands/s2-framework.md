Run step 2 (metric framework) of the strategy pipeline.

1. Read intake.json and 01-research.json from the latest run in output/.
2. Define: North Star metric (with explicit gamingRisks — how could this metric be gamed or disputed?),
   a three-layer metric tree (customer / product / financial), and a 6-metric first dashboard.
3. Write output/<run>/02-framework.json per schema '02-framework'.
4. Every baseline the company would need to measure goes into claims as an estimate
   (value: null if truly unknown) — these become the data request.
5. Run `node strategy/cli.js status`, fix schema errors.

The North Star must be an outcome the CUSTOMER values, not platform activity. If you are
considering making it also a billing unit, record the conflict-of-interest as a gamingRisk.

NAMING RULE: the North Star's name and abbreviation must not collide with standard
financial/business abbreviations (ARR, MRR, CAC, LTV, NRR, ARPU, GMV). If an
industry-standard term exists for the metric (e.g. "Containment Rate" for
resolution-without-human in chatbot/contact-center contexts), prefer it — it makes
the metric externally benchmarkable.

V3 — collectionHint (drives the /collect-data dialogue): for every claim you create,
add a short `collectionHint` — where the company would normally find this number
internally (e.g. "billing/Stripe dashboard → churn last month", "product analytics →
activation funnel", "finance sheet → blended cost per seat"). Estimate and null-value
claims especially need it, since those are what /collect-data will ask the user to
confirm. Keep it ≤160 chars. The field is optional in the schema, but omit it only
when no sensible source location exists.

V3.1 — kind (gates what /collect-data may ASK a client): tag every claim with `kind`.
  - "metric"         — an internal company number (churn, MRR, activation, cost base, usage,
                       account mix). These are what the agent collects in dialogue. Give these
                       a collectionHint pointing at where the number lives in the company.
  - "recommendation" — your own proposal or target (a price you recommend, a target rate you
                       set). NOT a fact you ask the client for — confirmed by their agreement or
                       your revision.
  - "benchmark"      — a public, market, or derived fact (competitor pricing from their site,
                       industry rates, a figure computed from public inputs). Confirmed by
                       research, never asked of a client.
Decision rule: "is this a number that lives in THIS company's systems?" → metric. "Did I
propose it?" → recommendation. "Is it public or derived?" → benchmark. A current competitor
price from their website is benchmark, not metric — do not ask a client for it. If unsure, omit
kind; downstream treats absent kind as benchmark (the safe default — never asked of a client).
