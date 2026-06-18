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
