# PM Agents

Three agents for AI/ML product management work, sharing one principle:
**AI conclusions without traceability to data are opinions.**

| Agent | Status | What it does |
|---|---|---|
| `strategy/` | v0.1 | Generates a product strategy & roadmap DOCX from public data; upgrades it with internal data via a Claim Ledger and delta reports |
| `evalagent/` | scaffold | Builds eval sets + LLM-as-a-Judge rubrics for LLM features; compares prompt/model variants |
| `discovery/` | scaffold | Clusters raw user feedback into prioritized insights, every insight traced to source quotes |

## Strategy agent — quick start

Requires Node 18+ and [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) (works on a Claude Pro subscription — no API key needed).

```bash
npm install

# zero-LLM smoke test: render a demo document from fixtures
node strategy/cli.js demo
node strategy/cli.js render

# real run
node strategy/cli.js init --product "BotConversa" \
  --description "WhatsApp chatbot builder for Brazilian SMBs" \
  --market "Brazil, micro and small businesses" \
  --competitors "ManyChat,SocialHub,Toolzz AI" \
  --verticals "beauty salons,clinics,pet shops" \
  --author "Vitaly Streluk"

# then, inside Claude Code in this repo, run in order:
#   /s1-research  /s2-framework  /s3-roadmap  /s4-scoring
#   /s5-monetization  /s6-review  /s7-synthesis
# (cli.js status always shows the next step)

node strategy/cli.js render
```

## Version 2 — adding internal data

```bash
node strategy/cli.js claims                      # the data request: what to collect and why
node strategy/cli.js confirm churn_m1 --value 55 --source "billing export, Jun 2026"
# → DELTA REPORT: confirmed vs estimate; if contradicted, lists steps to re-run
node strategy/cli.js render                      # document re-renders from state
```

Why this design: the document is never edited — it is re-rendered from state. A number and
its status (estimate / public / confirmed / REVISED) live in one ledger record, so the
"page 1 says no data, page 11 says confirmed" class of bug is impossible by construction.

## Design rules encoded in schemas
- Every roadmap initiative requires a success metric and an owner (or `exploratory: true`).
- Feature scoring must expose its full rubric; totals are computed by the renderer, not asserted.
- A monetization verdict cannot be "green" while it depends on unconfirmed claims.
- Every P0 from the adversarial self-review is either fixed or declared in Appendix B.
