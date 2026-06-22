Run step 6 (adversarial self-review) of the strategy pipeline.

1. Read ALL prior step outputs from the latest run.
2. Attack them as a hostile reviewer: a VC who has seen 500 decks, a VP Product who shipped
   in this market, a research analyst hunting unsupported claims. Prioritize criticism.
   Hunt specifically for: numbers in text without a claim record, internal contradictions
   between steps, verdicts that outrun their own decision gates, initiatives whose success
   metric cannot actually be measured, competitive claims that could be reversed.
3. For every P0 found: FIX it in the relevant step JSON (then status: "fixed"), or if it
   cannot be fixed without data, declare it (status: "declared") with an honest resolution note.
   P0s do not get silently shipped — they render in Appendix B.
4. Write output/<run>/06-review.json per schema '06-review'. Run status, fix errors.

VERIFICATION RULE: after applying fixes, RE-READ every file you modified and confirm
each prescribed fix actually landed in the JSON — a fix described in the review but
absent from the state is a silent failure (it happened: r02→f10 was prescribed and
never applied). Also check prose-vs-list consistency everywhere: if text says "four
unknowns" the adjacent list must have exactly four items; if text counts "nine
metrics" recount them from the current state, not from memory of an earlier draft.

CORPORATE PRISM (V4.0): if output/<run>/00-corporate.json exists, read it FIRST and subordinate
this step's decisions to its primaryGoal. The same product facts point to different choices under
different company goals (e.g. profitability → outcome/retention-led North Star, lean roadmap,
margin-protective pricing; market-share → adoption-led metric, land-grab roadmap, penetration
pricing; vertical-software-contour → integration/penetration metric, roadmap that closes the
vertical's whole software stack, platform pricing). Honor antiGoals as hard constraints. If this
step's standard move conflicts with the corporate goal, surface the tension explicitly rather than
smoothing it over. If 00-corporate.json is absent, proceed as before.
