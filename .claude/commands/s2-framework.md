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
