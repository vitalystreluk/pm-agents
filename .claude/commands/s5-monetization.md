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
