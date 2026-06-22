Run step 8 (feature specs) — the depth layer that turns the KEY roadmap initiatives into full
specifications. This is the difference between a feature catalog (s3) and a strategy document
(cf. v1.3 §6–8, where Concierge / Auto-RAG / Multi-Agent are each a real spec). Optional step:
if you don't run it, the document renders exactly as before. Communicate in the user's language.

Output: output/<run>/08-feature-specs.json, shape:
  { specs: [ { initiative, howItWorks, approach, effort, impact, risks } ], claims?: [...] }
  - initiative: must match an initiative NAME from 03-roadmap.json (you are deepening it, not inventing)
  - howItWorks: the mechanism, step by step — what the user/end-user actually experiences
  - approach: technical approach / stack (concrete: which APIs, which model, which data flow)
  - effort: build complexity and timeframe — honest. If you state weeks, that is a CLAIM: add it
    to claims[] with kind "metric" or "benchmark", status "estimate", source naming your basis.
    Do NOT write a bare number in prose as if confirmed.
  - impact: which metrics it moves — reference them as {{claim:id}} tokens, never bare numbers
  - risks: what could go wrong (technical, adoption, dependency). A spec without risks is marketing.

## How to run
1. Read 03-roadmap.json. Pick the KEY initiatives to spec — the highest-leverage, non-exploratory
   ones (typically H1 must-dos and the top H2 retention bets). Do NOT spec every initiative; a
   document that specs exploratory items bloats and loses signal. 3–6 specs is usually right.
2. If 00-corporate.json exists, the specs inherit its prism: depth goes to the initiatives that
   serve primaryGoal; an anti-goal initiative does not get a loving spec.
3. For each chosen initiative, write the six dimensions. Tie impact to existing ledger claims by
   token. Any new quantitative estimate (effort weeks, infra cost) becomes a claim with provenance.
4. Never restate an initiative's number as fact; the ledger owns numbers, prose owns reasoning.

This step deepens; it does not re-decide. If writing a spec reveals the initiative is wrong, that
is an s6/s3 signal — surface it, don't silently change the roadmap here.
