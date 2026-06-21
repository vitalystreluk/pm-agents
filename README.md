# pm-agents

Agent systems for product management work, built on one principle:

> **AI conclusions without traceability to data are opinions.**

Two working agents, one shared spine. Every number carries its source and status. Every verdict knows what data gates it. The LLM proposes; deterministic code validates — schemas own scores, verdicts, and state, and the model never grades itself.

| Agent | Status | What it does |
|---|---|---|
| [`strategy/`](strategy/) | **shipped** — battle-tested on a real B2B SaaS case | Generates a full product strategy & roadmap (DOCX/PDF) from market inputs; upgrades it with internal data via a Claim Ledger and delta reports |
| [`evalagent/`](evalagent/) | **shipped** — full run on a pre-implementation feature | Evaluates LLM features: simulated dialogues, LLM-as-a-Judge with a calibration gate, quality×cost×latency frontier across prompt/model variants |
| [`discovery/`](discovery/) | **shipped** — validated on synthetic corpus | Raw user feedback (CSV) → pain clusters on local embeddings → prioritized report where every insight carries a code-computed frequency, severity, segment, and source-traced quotes. The most deterministic agent: one LLM step of four. |

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

**Version 3 — guided data collection:**

```bash
node strategy/cli.js collect-plan           # impact-ranked queue of what to collect, + progress
# then in Claude Code: /collect-data — a dialogue that walks the queue one metric at
# a time, says why each matters and where to find it, and calls confirm under the hood
```

`/collect-data` turns the agent from a document generator into a partner for pulling
a company's *internal* numbers. The split is strict: the LLM runs the conversation and
suggests where each metric lives; the CLI owns the ordering, the progress count, the
write, and the contradiction delta (hard rule 8). Order is by **impact** — a number the
monetization verdict depends on is collected before a descriptive figure — derived from
each claim's `usedIn` steps, their decision weight, and `dependsOnClaims`. Honest
boundaries: a matching value re-renders instantly; a contradicting one names the affected
steps and asks before any re-run (it never re-runs conclusions blindly, and never
overwrites a hand-edited step silently). V3 automates collection and recompute, not
product judgement — the final document still wants a human's polish.

**Version 3.1 — claim kind (collect only what a client actually has):**

Each claim carries a `kind`: `metric` (an internal company number — churn, MRR, activation, cost base), `recommendation` (a price or target *we* propose), or `benchmark` (a public, market, or derived fact such as a competitor's listed price). `collect-plan` and `/collect-data` surface **only `kind: metric`** claims — so the agent asks a client for the numbers that live in their systems and never for a recommendation we made or a fact already on a competitor's website. Absent `kind` is treated as `benchmark` (the safe default: an untagged claim is never asked of a client). For an existing run, `node scripts/tag-claims-kind.js output/<run>` tags claims in bulk, then `render`.

**Version 3.2 — author notes (the author's voice, woven into the body):**

```bash
node strategy/cli.js note add --anchor monetization --kind caveat --body "..."   # capture a note
# then /author-note in Claude Code for conversational drafting + routing,
# and /s7-synthesis to weave notes into the document body
```

Author commentary — context, rationale, risk flags, caveats — used to sit in a block at
the top of the document because the pipeline had no place for it in the body. Now it lives
in `notes.json` (an overlay parallel to `confirmations.json`, so a re-run never wipes it),
each note `anchor`ed to a section or a claim. `/s7-synthesis` weaves each note into the
prose of its anchored section (rephrasing for flow; the author polishes the result), and
records `wovenNotes` so `render` flags any note added later that hasn't been woven yet.
A note never changes a conclusion: critique that does goes through `/s6-review` into state.
That routing is the author's call — `/author-note` surfaces the fork but never decides it.

A note may also carry **facts** it rests on (e.g. a competitor's live price): `note add … --claim "m07 | Current live Beginner tier | 189 | BRL/month | <source> | benchmark"` (repeatable). Note-borne facts become real ledger claims at ingest with provenance `note:<id>` — tokenized, shown in the appendix as author-introduced, never written into a step's output. This removes the manual "should I edit step 5?" detour: an author-introduced fact lives in the author layer, not in a step.

## Eval agent — 60 seconds

```bash
npm run eval-demo                           # mock run from fixtures, zero LLM calls
node evalagent/cli.js status                # e1-intake → e2-calibrate → e3-run → e4-judge
node evalagent/cli.js verify                # re-hash all transcripts, report tampering
node evalagent/cli.js render-report        # frontier table, error taxonomy, scores by segment
```

Designed for **pre-implementation evaluation**: the target feature (an AI onboarding concierge) doesn't exist yet — a two-pass simulator generates the dialogues (LLM-plays-bot vs LLM-plays-user per case script), so prompt candidates are compared *before* engineering investment. The judge is blocked by a calibration gate until agreement with independent labels passes threshold; calibration at N=5 is explicitly labeled a smoke test, with statistical confidence requiring N≥10.

## Discovery agent — 60 seconds

```bash
pip install -r discovery/requirements.txt
python discovery/cli.py demo
python discovery/cli.py status
python discovery/cli.py voc-validate --strategy-run <run>
python discovery/cli.py export-eval-cases --min-severity 3
```

Raw feedback → clusters → prioritized insights, built so that the LLM never reports a number. Pipeline: d1 ingest (CSV normalize, dedup) → d2 embed+cluster (local multilingual sentence-transformers + HDBSCAN, fully offline — feedback never leaves the machine) → d3 label (the one LLM step: names each cluster, picks quotes by row-id; output rejected if it contains any count, every quote must trace to a real source row) → d4 report (frequencies and severities computed by the CLI). Cross-agent loops close the portfolio: voc-validate checks the strategy agent's VoC claims against real clusters with a deterministic verdict (supported / insufficient-evidence; contradicts is always a manual PM call), and export-eval-cases turns complaint clusters into candidate eval cases.

## Case study

[`docs/case-study/`](docs/case-study/) contains the full battle-run artifacts: the rendered strategy PDF, the three review documents with every finding, and the eval run report with the frontier table. The git history is the changelog of the eval loop: finding → schema rule → re-render → zero recurrence.

## Honest limitations

- V2 confirmations are one-at-a-time (no CSV batch import); delta reports name affected steps but re-runs are manual; confirmed values don't expire (no staleness marking yet).
- Eval calibration v1 used cross-model proxy labels, not blind human labels — disclosed in `calibration.json`; the rubric now mandates blind collection (anchoring-bias rule #6).
- Simulator latency numbers are pipeline fields, not production measurements — cost figures are real arithmetic, latency awaits a live integration.
- LLM steps run through Claude Code slash commands (subscription-based); an API runner is a deliberate non-goal until autonomous scheduled runs are needed.
- Discovery is validated on a 42-row synthetic corpus; a real-data run (300–500 reviews) is the next step. Frequencies answer "how common among people who wrote a review," not "among all users" (selection bias).

## Stack

Node.js CLI (validation, ledger, rendering — zero LLM) · Claude Code as the LLM step runner (`.claude/commands/`) · `docx` + LibreOffice for documents · SHA-256 transcript integrity · no frameworks — the orchestration is seven markdown files and ~600 lines of CLI, and that is a feature.

---

*Vitaly Streluk · [LinkedIn](https://www.linkedin.com/in/vitaly-streluk) · see also [rag-agent-langgraph](https://github.com/vitalystreluk/rag-agent-langgraph) — agentic RAG with parallel retrieval, hallucination checks, and HITL*
