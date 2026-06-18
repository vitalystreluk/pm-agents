Run step 5 (monetization) of the strategy pipeline.

1. Read prior steps from the latest run.
2. CHOOSE a monetization model from alternatives — do not default to any template.
   List at least 2 alternativesConsidered with whyNot. Cheaper-tier / longer-trial must be
   considered whenever the recommended model is usage- or outcome-based.
3. Build a sensitivityTable across realistic usage volumes and mark the breakEven.
4. Verdict rules (schema-enforced): if the recommendation depends on any unmeasured number,
   verdict MUST be "conditional" and that number's claim id goes into dependsOnClaims.
   A verdict cannot pass its own decision gate before the data exists.
5. Write output/<run>/05-monetization.json per schema '05-monetization'. Run status, fix errors.

V3 — collectionHint (drives the /collect-data dialogue): for every claim you create,
add a short `collectionHint` — where the company would normally find this number
internally (e.g. "billing/Stripe dashboard → churn last month", "product analytics →
activation funnel", "finance sheet → blended cost per seat"). Estimate and null-value
claims especially need it, since those are what /collect-data will ask the user to
confirm. Keep it ≤160 chars. The field is optional in the schema, but omit it only
when no sensible source location exists.
