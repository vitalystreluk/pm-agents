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

## Context
Author is a PM (10+ yrs, AI/ML focus), comfortable with code but values minimum code.
Explain technical choices in plain language. Surface tradeoffs explicitly. Push back when something is unclear.
Communicate with the user in Russian.
