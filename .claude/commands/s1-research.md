Run step 1 (research) of the strategy pipeline.

1. Read `output/<latest run>/intake.json` (latest = newest folder in output/).
2. Research the competitive landscape and voice-of-customer for this product using web search:
   competitor positioning and pricing (record the verification date for every price),
   review-platform signals, market context. 3-6 competitors, 4-8 VoC signals.
3. Write `output/<run>/01-research.json` matching the schema (see core/schema.js, validator '01-research'):
   { competitors: [{name, positioning, pricing, pricingVerifiedDate}], vocSignals: [{signal, source}], claims: [...] }
4. Every number you found in a public source goes into `claims` with status "public" and the source named.
   Every number you estimated goes in with status "estimate". Do not put numbers in text only — no claim record, no number.
5. Run `node strategy/cli.js status` and fix any schema errors before finishing.

Do not invent prices. If a price cannot be verified, write "unverified" and add a claim for it.

VALUE CONTRACT (hard rule, schema-enforced): every claim must carry an ATOMIC value
(number only) in `value`, units/currency/period in `unit`, and a short metric
description (≤160 chars) in `statement`. Never bury the number inside the statement
sentence — a claim cited inline as {{claim:id}} renders its `value`; null renders as
a gap in the middle of prose.

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
