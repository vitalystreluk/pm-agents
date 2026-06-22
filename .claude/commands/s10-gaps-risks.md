Run step 10 (gaps & strategic risks) — the edges of the document. This is what separates a
strategy that pretends to completeness from one a founder trusts (cf. v1.3 §12 + the author
notes). Optional step: absent runs render as before. Communicate in the user's language.

Output: output/<run>/10-gaps-risks.json, shape:
  {
    notCovered: [ { topic, status, whyDeferred, toComplete } ],
    strategicRisks: [ { risk, why, response } ],
    claims?: [...]
  }

## notCovered — what this document does NOT answer, and why (the Fibery gaps section)
Name the things a complete strategy would cover that this one defers. For each:
  - topic: the missing section (e.g. "Resource & capacity plan", "ICP via CustDev", "GTM channels",
    "Honest retrospective on past failures", "Current-state review")
  - status: WHY it is deferred — exactly one of:
      internal-data        (needs the company's own numbers)
      founder-input        (needs a candid founder conversation)
      separate-workstream  (needs other expertise / a separate initiative, e.g. brand)
  - whyDeferred: the honest reason it isn't here yet
  - toComplete: what would close it (the data, the session, the workstream)
Do not pad. Name the gaps that genuinely matter; a fake-complete document is the failure mode.

## strategicRisks — risks at the level of the whole strategy (not per-feature)
Per-feature risks live in s8. Here name the risks to the WHOLE bet. For each: risk, why it matters
at strategy level, and your response (the answer — or an honest "open, no answer yet"). Examples of
the class (adapt to this case, don't copy): a mature market read as a forward indicator that de-risks
the core bets (the risk being that bets look speculative in isolation); the existential question of
whether a general-purpose builder makes a dedicated platform redundant as models improve.
Reference any numbers as {{claim:id}} tokens.

## Prism
If 00-corporate.json exists, the risks and gaps are read through primaryGoal — a profit-goal cares
most about risks to durable margin; a market-share goal about risks to the land-grab. Name the gaps
that matter for THIS goal first.

This step states what is unknown and what threatens the strategy; it does not resolve them. Honesty
over false completeness.
