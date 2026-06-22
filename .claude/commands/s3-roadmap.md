Run step 3 (roadmap) of the strategy pipeline.

1. Read intake, 01-research, 02-framework from the latest run.
2. Build a three-horizon roadmap. Hard rules enforced by schema:
   - Every initiative has successMetric AND owner, or is explicitly marked exploratory: true.
   - H1 is about fixing what is broken (activation, analytics baseline), not new surface area.
   - Channels expand only after retention logic supports it — state this dependency explicitly.
3. Keep horizons lean: 2-3 initiatives each. An overloaded H2 is a wish list.
4. Write output/<run>/03-roadmap.json per schema '03-roadmap'. Estimated shares/volumes → claims.
5. Run `node strategy/cli.js status`, fix schema errors.

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
