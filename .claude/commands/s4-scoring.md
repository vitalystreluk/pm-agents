Run step 4 (feature scoring) of the strategy pipeline.

1. Read prior steps from the latest run.
2. Pick the 2-4 competing features from H3 (or wherever prioritization is contested).
3. Define a rubric: 5-7 criteria with weights. Score every feature on EVERY criterion.
   Do NOT compute totals — the renderer computes them from weights. Naked totals are theater.
4. Write output/<run>/04-scoring.json per schema '04-scoring'.
5. Run `node strategy/cli.js status`, fix schema errors.

TOSS-UP RULE: after scoring, compute the weighted totals mentally; if the top two
features land within 10% of each other, the ranking is not robust to weights — you
must either (a) add an explicit weight-sensitivity note showing which weight change
flips the order, or (b) declare the comparison a toss-up and justify the tiebreaker
qualitatively. Never present a <10% gap as a confident 1st/2nd ranking.
