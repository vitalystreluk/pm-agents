Run step 7 (synthesis) of the strategy pipeline. Use the most capable model available for this step.

1. Read ALL step outputs and claims.json from the latest run.
2. Write the narrative: tldr (one paragraph, leads with the conclusion) and sections
   (each: title, paragraphs, optional bullets).
3. NUMBERS DISCIPLINE — the one hard rule: never write a number into the text directly.
   Reference every quantitative claim as a {{claim:id}} token. The renderer resolves tokens
   from the ledger with live status markers. A number without a claim id does not exist.
4. Do not re-derive logic already established in prior steps — synthesize it.
   Lead with conclusions; supporting detail follows.
5. Write output/<run>/07-synthesis.json per schema '07-synthesis'.
6. Run `node strategy/cli.js status`, then `node strategy/cli.js render`, and report the DOCX path.

TOKEN DISCIPLINE — full scope: the no-raw-numbers rule covers spelled-out numbers
("fifteen accounts", "thousands of salons"), currency ranges ("R$1,200–1,500"), and
percentages, not just digits. If a number has a claim — use the token; if it
doesn't — create the claim in the relevant step first or drop the number. Counts of
the document's own elements ("nine metrics", "four unknowns") must be computed from
the current state JSONs at write time, never recalled from earlier drafts.
