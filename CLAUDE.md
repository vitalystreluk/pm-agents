# PM Agents — Project Guidelines

Monorepo of three PM agents sharing one spine: **AI conclusions without traceability to data are opinions.**

## Architecture (strategy agent)
- The DOCX is a RENDER of state (step JSONs + claim ledger), never an edited artifact.
- Numbers live in the Claim Ledger; synthesis references them as {{claim:id}} tokens.
- Steps are run via slash commands /s1-research ... /s7-synthesis. Each step:
  read inputs → write output/<run>/0N-step.json → run `node strategy/cli.js status` → fix schema errors.
- Deterministic work (validation, ledger, render, deltas) is Node CLI — never ask an LLM to do it.

## Hard rules
- Never write a quantitative value into narrative text without a claim record.
- Never edit a rendered DOCX. Change state, re-render.
- Never set monetization verdict "green" while dependsOnClaims is non-empty.
- Web research happens ONLY in step 1. Steps 2-7 work from saved state.
- Competitor prices always carry pricingVerifiedDate.

## Workflow
1. `node strategy/cli.js init --product X --description Y --market Z [--competitors a,b] [--verticals v1,v2] [--author Name]`
2. Run /s1-research → /s7-synthesis in order (status tells you the next one).
3. `node strategy/cli.js render` → DOCX with appendices (rubric, self-review, ledger).
4. V2: `node strategy/cli.js confirm <claimId> --value V --source "S"` → follow the delta report.
5. V3: `node strategy/cli.js collect-plan` then `/collect-data` → guided collection. The CLI owns
   ordering/progress/writes/deltas; the slash command only runs the conversation. Never re-run a step
   or overwrite a hand-edited step JSON during collection without the user's explicit yes.
6. V3.1: every claim has a `kind` — metric|recommendation|benchmark. `/collect-data` collects ONLY
   kind=metric (internal company numbers). Never ask a client for a recommendation we made or a
   public/competitor fact (benchmark). Absent kind ⇒ benchmark (never asked of a client).
7. V3.2: author notes (notes.json) are the author's VOICE, woven into the body by /s7-synthesis.
   A note never changes a conclusion. Critique that changes a conclusion goes through /s6-review into
   state — the author decides which route; never infer it. CLI owns notes.json writes (`note add`);
   s7 owns weaving and sets wovenNotes; render flags unwoven notes as STALE.
8. V3.3: a note may carry facts (`note add --claim "id | statement | value | unit | source | kind"`,
   repeatable). They become ledger claims at ingest with provenance note:<id> — tokenized, never
   written into a step. An author-introduced fact lives in the author layer; steps stay untouched.

## Context
Author is a PM (10+ yrs, AI/ML focus), comfortable with code but values minimum code.
Explain technical choices in plain language. Surface tradeoffs explicitly. Push back when something is unclear.
Communicate with the user in Russian.
9. V4.0: 00-corporate.json is the corporate-strategy prism (an input overlay like intake, NOT a
   step in STEP_ORDER, carries no claims). /s0-corporate writes it — hybrid: take intake.companyStrategy
   if present, else dialogue with founders (never invent a strategy they lack). s2-s7 subordinate
   every decision to its primaryGoal; honor antiGoals; surface conflicts, don't smooth them.
10. V4.1: s5 declares billingBasis (flat|usage|outcome|hybrid). When outcome/hybrid, integrityPolicy
    is REQUIRED (verifiableEvent, disputePolicy, antiGaming, governance) — the §7.7 discipline that
    makes outcome-billing trustworthy. It's a counting+governance ruleset, NOT new product scope;
    deeper verification defers to planned integrations. s7 weaves it into the monetization narrative.
