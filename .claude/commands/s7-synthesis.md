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

AUTHOR NOTES — weave the author's voice into the body (V3.2):
Read output/<run>/notes.json (it may be absent — then skip this entirely). Each note is
{ id, anchor, kind, body }: the author's own commentary — context, rationale, a risk
flag, a caveat — that belongs IN the body, not in a preface block.
- Placement is set by `anchor`: a section slug (tldr | market | customer | north-star |
  roadmap | monetization | what-needs-true) → weave into that section; a claim id (e.g.
  r01) → weave into whichever section discusses that claim.
- Weave, don't append: integrate each note as a distinct authorial thread inside the
  section's prose so it reads as part of the argument, not a footnote. You MAY rephrase
  the author's `body` for flow — the author reviews and adjusts after. Keep the author's
  point intact; do not soften or invert it. `kind` sets the framing (risk → flag the
  exposure; rationale → explain the choice; caveat → qualify; context → situate).
- Do NOT let notes bloat a section or bury its conclusion. A note is a thread woven in,
  not a new subsection.
- A note never changes a CONCLUSION. If a note's content actually contradicts a step's
  finding, that is a routing error by the author (it should have gone through /s6-review),
  not a license for you to rewrite the verdict. Weave it as the author's stated view and
  leave the conclusion to the steps.
- After writing 07-synthesis.json, set its `wovenNotes` field to the list of note ids you
  incorporated. This lets `render` detect notes added later that haven't been woven yet.

NOTE FACTS (V3.3): a note in notes.json may carry its own `claims` (facts the note's
point rests on, e.g. a competitor's live price). At ingest these are ALREADY real ledger
claims (provenance "note:<id>") with tokens. So when weaving such a note, reference those
numbers as {{claim:id}} like any other — they resolve from the ledger. Do NOT add them to
any step's JSON, and do NOT write the raw number in prose. The author layer holds the fact;
steps stay untouched.

CORPORATE PRISM (V4.0): if output/<run>/00-corporate.json exists, read it FIRST and subordinate
this step's decisions to its primaryGoal. The same product facts point to different choices under
different company goals (e.g. profitability → outcome/retention-led North Star, lean roadmap,
margin-protective pricing; market-share → adoption-led metric, land-grab roadmap, penetration
pricing; vertical-software-contour → integration/penetration metric, roadmap that closes the
vertical's whole software stack, platform pricing). Honor antiGoals as hard constraints. If this
step's standard move conflicts with the corporate goal, surface the tension explicitly rather than
smoothing it over. If 00-corporate.json is absent, proceed as before.

INTEGRITY POLICY (V4.1): if 05-monetization.json carries an integrityPolicy (outcome/hybrid
billing), weave it into the monetization narrative as the systemic answer to the billing
conflict-of-interest — not a footnote. It is what makes "the vendor earns when the customer
earns" safe: the billed outcome is verifiable, disputable, reversible, rate-limited, and the
definition is governed. Present it as integral to why the outcome-billing model is trustworthy.
