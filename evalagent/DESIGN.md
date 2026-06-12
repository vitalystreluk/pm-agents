# Eval Agent — Architecture Design

**Shared spine:** AI conclusions without traceability to data are opinions.  
For the Eval Agent this means: a judge verdict without a link to the exact transcript it scored is not a verdict — it is an assertion.

---

## 1. What this agent does

The Eval Agent answers one question: *does this LLM feature behave the way we said it would?*

Target case: **AI Onboarding Concierge** — a conversational bot that walks new BotConversa users (Brazilian SMB owners of beauty salons, clinics, pet shops) from signup to their first live WhatsApp flow within the 15-day trial window. Success is measured by Account Activation Rate (claim f07 in the strategy run).

The agent is not a unit test harness. It is an evidence chain: every quality judgment traces back to a saved transcript; every aggregate score traces back to per-case judgments; every recommendation traces back to aggregate scores. Nothing floats free.

---

## 2. Pipeline steps

Six steps, alternating deterministic CLI and LLM slash-command — same pattern as the strategy agent.

```
e1-intake     CLI init     Feature under test: description, success criteria, target users
e2-cases      LLM          Generate eval case set (happy path, edge, adversarial)
e3-calibrate  LLM + CLI    Score 5 hand-labeled calibration cases; CLI validates agreement
e4-run        CLI          Execute concierge against all cases; save transcripts
e5-judge      LLM          Score each transcript against calibrated rubric
e6-report     CLI          Aggregate scores; render report with failure taxonomy
```

### Step boundaries: what is deterministic vs LLM

| Step | Owner | Why |
|---|---|---|
| e1-intake | CLI | Structured intake — no judgment required, just schema validation |
| e2-cases | LLM (`/e2-cases`) | Generating diverse, adversarial, realistic cases requires creativity and domain knowledge |
| e3-calibrate | LLM + CLI gate | LLM scores the 5 hand-labeled calibration cases; CLI computes agreement and **blocks e5 if agreement < 75%** |
| e4-run | CLI | Deterministic: send each case's turn sequence to the concierge API, record the full response, compute token cost. No judgment. |
| e5-judge | LLM (`/e5-judge`) | LLM applies the rubric to each transcript; must reference calibration scores in its preamble |
| e6-report | CLI | Deterministic aggregation, ranking, cost summary, DOCX render |

**Hard rule:** LLM steps read only the state written by previous steps. e5-judge cannot call the concierge. e4-run cannot score anything. The boundary is enforced by the slash-command definitions, not by trust.

---

## 3. Traceability chain

Every judgment in the system links to exactly one source artifact. The chain is:

```
eval case (cases.json)
  → transcript (transcripts/<runId>/<caseId>.json)
    → judgment (05-judge.json, entry per caseId)
      → aggregate (06-report.json, per criterion and overall)
        → rendered report (eval-report.docx)
```

### How verdict-to-transcript linking works

`05-judge.json` stores one judgment object per case:

```json
{
  "caseId": "case-03",
  "transcriptFile": "transcripts/botconversa-eval-2026-06-12/case-03.json",
  "transcriptHash": "sha256:a3f9...",
  "scores": { "Goal Completion": 4, "Graceful Recovery": 3, ... },
  "weightedTotal": 3.6,
  "flags": ["verbosity-warning"],
  "rationale": "..."
}
```

`transcriptHash` is the SHA-256 of the transcript file at the time of judging. The CLI (`node evalagent/cli.js verify`) recomputes hashes at any time to confirm no transcript was edited after scoring. A hash mismatch is a pipeline integrity failure — the report cannot render until it is resolved.

This mirrors the strategy agent's claim ledger: just as `claims.json` is regenerated from step files (never hand-edited), `transcripts/` files are written once by e4-run and never modified. Judge verdicts are an overlay, not an edit.

---

## 4. File and state layout

```
evalagent/
  cli.js                     — init, run, calibrate, judge, report, verify, status
  README.md                  — existing scaffold
  DESIGN.md                  — this file
  SCHEMAS.md                 — step output schemas and hard rules
  RUBRIC-DRAFT.md            — LLM-as-a-Judge rubric (first draft, to be calibrated)
  CASES-DRAFT.md             — 15 seed eval cases

output/
  <eval-run-id>/             — e.g. botconversa-eval-2026-06-12/
    intake.json              — e1 output: feature description, success criteria
    cases.json               — e2 output: full eval case set
    calibration.json         — e3 output: human labels + LLM agreement scores
    transcripts/
      case-01.json           — one file per case; written by e4, never modified
      case-02.json
      ...
    05-judge.json            — e5 output: per-case verdicts with transcript references
    06-report.json           — e6 output: aggregates, rankings, failure taxonomy
    eval-report.docx         — rendered from 06-report.json
    eval-report.pdf
```

Run IDs follow the same convention as the strategy agent: `<product>-eval-<YYYY-MM-DD>`. If multiple runs exist on the same date, append a sequence number.

### Transcript file format (e4 output)

```json
{
  "caseId": "case-03",
  "caseLabel": "confused-user-wrong-language",
  "variant": "prompt-v1",
  "model": "claude-sonnet-4-6",
  "turns": [
    { "role": "user",    "content": "...", "tokenCount": 42 },
    { "role": "assistant","content": "...", "tokenCount": 187 }
  ],
  "totalTokens": 459,
  "costUSD": 0.0014,
  "durationMs": 1840,
  "exitState": "flow-selected | abandoned | error | max-turns-reached",
  "writtenAt": "2026-06-12T14:33:01Z"
}
```

`exitState` is set deterministically by the CLI based on whether the final assistant turn contains a recognized terminal signal (flow selected, explicit exit, error). This is the equivalent of the strategy agent's terminal-state enforcement — the same gaming risk applies: if `exitState` is judged by the LLM rather than detected by the CLI, the judge can inflate completion rates.

---

## 5. Calibration gate (e3)

The calibration step is the most important structural safeguard.

**Why it exists:** LLM judges have well-documented biases (position bias, verbosity preference, self-preference). A rubric that has not been tested against hand-labeled cases is a rubric that may be measuring something different from what it claims to measure.

**How it works:**
1. Evaluator (human) reads 5 cases from `cases.json` and scores each on every rubric criterion. Scores written to `calibration.json` as `humanScores`.
2. The `/e3-calibrate` slash command sends the same 5 cases + transcripts to the LLM judge and records `llmScores`.
3. CLI computes agreement: for each criterion, % of cases where |human score − LLM score| ≤ 1 (within-1-point agreement, the standard for ordinal rubrics).
4. **Gate:** if any criterion's agreement is below 75%, the CLI blocks e5-judge and prints the criterion name, the disagreement cases, and the rubric anchor that may be ambiguous. The rubric must be revised and e3 re-run before proceeding.
5. Once agreement ≥ 75% on all criteria, `calibration.json` records `calibrationPassed: true` with date and agreement percentages. e5-judge reads this and references the calibration run ID in every verdict.

**Hard rule:** `calibrationPassed` in `calibration.json` must be `true` before e5-judge will run. The CLI enforces this; the slash command cannot override it.

---

## 6. Variant comparison (A/B eval)

The pipeline supports comparing two variants of the concierge (different prompts, different models, or different flow configurations). Variants are declared in `intake.json`. e4-run executes all cases against all declared variants. e5-judge scores all transcripts. e6-report produces a per-variant comparison table and marks the winning variant, its confidence interval, and the specific cases where the variants diverged most.

**Hard rule:** a variant cannot be declared the winner if the confidence interval on its weighted score advantage overlaps zero. The CLI enforces this; the report renders "inconclusive" instead of a winner.

---

## 7. What the Eval Agent does NOT do

- It does not generate synthetic training data.
- It does not run the production concierge in production (e4-run calls a sandboxed endpoint or a local model).
- It does not auto-correct the concierge prompt based on eval results — that decision belongs to a human reviewing the report.
- It does not make web requests during steps e3–e6. All research and context is fixed at e1-intake.

---

## 8. Relationship to the strategy agent

The Eval Agent is downstream of the strategy agent, not parallel to it.

| Strategy concept | Eval equivalent |
|---|---|
| Claim Ledger | Transcript store + calibration record |
| `{{claim:id}}` token | `transcriptFile` reference in verdict |
| `dependsOnClaims` gate | `calibrationPassed` gate |
| Monetization verdict: cannot be green while claims are null | Report verdict: cannot declare winner while calibration failed |
| `node strategy/cli.js status` | `node evalagent/cli.js status` |

The strategy agent's Account Activation Rate (claim f07) is the upstream metric the Concierge is trying to move. The Eval Agent's job is to generate evidence that the Concierge actually does or does not move it in controlled conditions before it touches production traffic.
