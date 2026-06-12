# pm-agents

Agent systems for product management work, built on one principle:

> **AI conclusions without traceability to data are opinions.**

Two working agents, one shared spine. Every number carries its source and status. Every verdict knows what data gates it. The LLM proposes; deterministic code validates — schemas own scores, verdicts, and state, and the model never grades itself.

| Agent | Status | What it does |
|---|---|---|
| [`strategy/`](strategy/) | **shipped** — battle-tested on a real B2B SaaS case | Generates a full product strategy & roadmap (DOCX/PDF) from market inputs; upgrades it with internal data via a Claim Ledger and delta reports |
| [`evalagent/`](evalagent/) | **shipped** — full run on a pre-implementation feature | Evaluates LLM features: simulated dialogues, LLM-as-a-Judge with a calibration gate, quality×cost×latency frontier across prompt/model variants |
| [`discovery/`](discovery/) | planned | Raw user feedback → clustered insights on local embeddings, every insight traced to source quotes |

---

## Why this is not another LLM wrapper

**1. Documents are renders of state — never edited artifacts.**
Every quantitative claim lives in a Claim Ledger as a typed record: `{id, statement, value, unit, source, status}` with statuses `estimate / public / confirmed / revised`. Narrative text references numbers only as `{{claim:id}}` tokens; the renderer resolves them with live status markers. A number and its status live in one record — so the classic strategy-deck bug ("page 1 says no data, page 11 says confirmed") is impossible *by construction*, not by diligence.

**2. The LLM never computes its own scores.**
Feature-scoring totals are computed by the renderer from the visible rubric. Eval verdicts (`exitState`, `confidence`, `weightedTotal`) are set only by the CLI. A monetization verdict cannot be `green` while it depends on unconfirmed claims — the schema rejects it. These are not conventions; they are validation rules that fail the pipeline.

**3. Evaluation is built in, and it caught real bugs.**
The strategy agent's battle run went through a three-stage review loop:
- **In-pipeline adversarial self-review** (before synthesis): 6 P0 issues — cross-step contradictions, a verdict outrunning its own decision gate, targets with no claim records;
- **External model review** (after synthesis): 5 more P0s, including an *architectural* bug — the render contract between how the agent filled the ledger and how the renderer resolved tokens — diagnosed from JSON alone;
- **Instrumented manual audit** of the rendered document: 4 more findings, including a prose-vs-list count mismatch and a scoring "winner" whose margin (3.9 vs 3.75) didn't survive weight sensitivity.

Each failure class was encoded into schema rules or step prompts — not patched point-wise. Document quality: **38 broken claim markers → 0**; ledger: **42/44 null values → 12 legitimate unknowns**, rendered as a prioritized data request.

**4. The eval agent refused to declare a winner — correctly.**
First battle run: 15 cases × 2 prompt variants, 30 simulated PT-BR dialogues (SHA-256-hashed transcripts), LLM-as-a-Judge with documented bias mitigations. Result: `winner: INCONCLUSIVE` at Δ=0.03 — the explicit-instructions variant bought nothing measurable, so the cheaper base prompt wins by default. The judge was calibrated against independent labels (≥80% within-1-point agreement per criterion; v1 used cross-model proxy labels — honestly disclosed, blind human calibration pending). Four rubric rules were born from the disagreement analysis, including an adversarial-case scoring fix and an explicit language policy.

---

## Strategy agent — 60 seconds

```bash
npm install
node strategy/cli.js demo && node strategy/cli.js render   # zero-LLM smoke test

# real run (LLM steps execute in Claude Code via slash commands /s1-research … /s7-synthesis)
node strategy/cli.js init --product "X" --description "..." --market "..." \
  --competitors "A,B,C" --verticals "v1,v2" --author "You"
```

The pipeline: research (web-verified competitor pricing with verification dates) → metric framework (North Star with mandatory gaming-risk analysis) → three-horizon roadmap (no initiative without a success metric and an owner) → feature scoring (visible rubric, renderer-computed totals, toss-up rule for <10% gaps) → monetization (alternatives considered, sensitivity table, gated verdict) → adversarial self-review → synthesis.

**Version 2 — internal data:**

```bash
node strategy/cli.js claims                 # the agent's own data request: what to collect and why
node strategy/cli.js confirm churn_m1 --value 4.5 --source "billing export, Jun 2026"
# → DELTA REPORT: if the confirmed value contradicts the estimate, it names
#   the steps whose conclusions were built on it — re-check, don't re-label
node strategy/cli.js render                 # the document re-renders from state
```

## Eval agent — 60 seconds

```bash
npm run eval-demo                           # mock run from fixtures, zero LLM calls
node evalagent/cli.js status                # e1-intake → e2-calibrate → e3-run → e4-judge
node evalagent/cli.js verify                # re-hash all transcripts, report tampering
node evalagent/cli.js render-report        # frontier table, error taxonomy, scores by segment
```

Designed for **pre-implementation evaluation**: the target feature (an AI onboarding concierge) doesn't exist yet — a two-pass simulator generates the dialogues (LLM-plays-bot vs LLM-plays-user per case script), so prompt candidates are compared *before* engineering investment. The judge is blocked by a calibration gate until agreement with independent labels passes threshold; calibration at N=5 is explicitly labeled a smoke test, with statistical confidence requiring N≥10.

## Case study

[`docs/case-study/`](docs/case-study/) contains the full battle-run artifacts: the rendered strategy PDF, the three review documents with every finding, and the eval run report with the frontier table. The git history is the changelog of the eval loop: finding → schema rule → re-render → zero recurrence.

## Honest limitations

- V2 confirmations are one-at-a-time (no CSV batch import); delta reports name affected steps but re-runs are manual; confirmed values don't expire (no staleness marking yet).
- Eval calibration v1 used cross-model proxy labels, not blind human labels — disclosed in `calibration.json`; the rubric now mandates blind collection (anchoring-bias rule #6).
- Simulator latency numbers are pipeline fields, not production measurements — cost figures are real arithmetic, latency awaits a live integration.
- LLM steps run through Claude Code slash commands (subscription-based); an API runner is a deliberate non-goal until autonomous scheduled runs are needed.

## Stack

Node.js CLI (validation, ledger, rendering — zero LLM) · Claude Code as the LLM step runner (`.claude/commands/`) · `docx` + LibreOffice for documents · SHA-256 transcript integrity · no frameworks — the orchestration is seven markdown files and ~600 lines of CLI, and that is a feature.

---

*Vitaly Streluk · [LinkedIn](https://www.linkedin.com/in/vitaly-streluk) · see also [rag-agent-langgraph](https://github.com/vitalystreluk/rag-agent-langgraph) — agentic RAG with parallel retrieval, hallucination checks, and HITL*
