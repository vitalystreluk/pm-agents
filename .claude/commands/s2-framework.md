Run step 2 (metric framework) of the strategy pipeline.

1. Read intake.json and 01-research.json from the latest run in output/.
2. Define: North Star metric (with explicit gamingRisks — how could this metric be gamed or disputed?),
   a three-layer metric tree (customer / product / financial), and a 6-metric first dashboard.
3. Write output/<run>/02-framework.json per schema '02-framework'.
4. Every baseline the company would need to measure goes into claims as an estimate
   (value: null if truly unknown) — these become the data request.
5. Run `node strategy/cli.js status`, fix schema errors.

The North Star must be an outcome the CUSTOMER values, not platform activity.

A North Star that doubles as the billing unit is NOT automatically a defect — outcome
metrics aligned with billing can be a genuine strength (value alignment, a clean
commercial model, a strong retention mechanism: the vendor earns when the customer earns).
Do not reflexively steer away from such a metric. If you choose one, you owe two things,
and ONLY these two — do not let them inflate scope:
  (a) record the conflict-of-interest honestly as a gamingRisk (the vendor both measures
      and is paid on the metric, so it could be inflated rather than genuinely earned), and
  (b) name the MINIMAL anti-gaming safeguard: the outcome must be initiated/confirmed by
      the customer or their end-user, not asserted unilaterally by the platform. Deeper
      verification (a payment in the client's system, a booking in their CRM) is DEFERRED
      to whatever integrations the roadmap already plans — do NOT invent new roadmap
      initiatives just to verify the North Star. The safeguard is a counting rule, not a
      feature build.
A non-billing outcome metric is equally valid; neither is preferred a priori. Choose the
metric that best captures what THIS customer's buyer is paying for. If intake.json carries
a `northStarDirective`, treat it as the chosen North Star — honor it and apply (a)/(b)
above, rather than re-deriving a different metric.

NAMING RULE: the North Star's name and abbreviation must not collide with standard
financial/business abbreviations (ARR, MRR, CAC, LTV, NRR, ARPU, GMV). If a widely
understood industry term exists for the chosen metric, prefer it — it makes the metric
externally benchmarkable. (Do not let the naming rule bias WHICH metric you pick; it only
governs how you name the one you already chose.)

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

CORPORATE PRISM (V4.0): if output/<run>/00-corporate.json exists, read it FIRST and subordinate
this step's decisions to its primaryGoal. The same product facts point to different choices under
different company goals (e.g. profitability → outcome/retention-led North Star, lean roadmap,
margin-protective pricing; market-share → adoption-led metric, land-grab roadmap, penetration
pricing; vertical-software-contour → integration/penetration metric, roadmap that closes the
vertical's whole software stack, platform pricing). Honor antiGoals as hard constraints. If this
step's standard move conflicts with the corporate goal, surface the tension explicitly rather than
smoothing it over. If 00-corporate.json is absent, proceed as before.
