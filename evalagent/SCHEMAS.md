# Eval Agent — Step Output Schemas and Hard Rules v2

Schemas are enforced by `node evalagent/cli.js status` after every step.  
Hard rules are constraints the CLI will reject — not warnings, not advisory notes.

Pipeline: **e1-intake → e2-calibrate → e3-run → e4-judge** (4 steps; see DESIGN.md §2 for 6→4 justification).

---

## Hard rules (eval-wide)

These apply across all steps. Violations block the next step from running.

1. **No verdict without a transcript reference.** Every judgment object in `04-report.json` must carry `transcriptFile` and `transcriptHash`. A score with no linked transcript is an assertion, not evidence.
2. **No judge run without calibration.** `calibration.json` must exist and contain `calibrationPassed: true` before e3-run executes. Agreement threshold: ≥75% within-1-point on every rubric criterion.
3. **No quality winner declared when confidence interval overlaps zero.** e4-judge must compute a CI on the variant score advantage. If the CI includes 0, the report renders `"winner": "inconclusive"`. This rule applies to the quality dimension only — cost and latency winners are always deterministic.
4. **Every eval case must have an `expectedBehavior` field.** A case without an expected behavior cannot be scored — the judge would be comparing against nothing.
5. **`exitState` is set by CLI only, never by the LLM.** The CLI determines exit state from terminal signals in the transcript. If the LLM sets or overrides `exitState`, the transcript is invalid.
6. **Transcripts are immutable after e3-run writes them.** Any modification invalidates the `transcriptHash` stored in `04-report.json`. The `verify` command detects this and blocks rendering.
7. **No quantitative value in report prose without a score record.** The rendered report references per-case scores via `{{score:caseId:criterion}}` tokens resolved by the renderer from `04-report.json`. Raw invented numbers in narrative are rejected.
8. **`confidence` in `calibration.json` is set by CLI from N.** If N < 10, `confidence` is forced to `"smoke"` regardless of what the human writes. The human cannot override this field.

---

## e1 — intake.json (feature context + case set)

Written by CLI init + `/e1-cases` LLM slash command. The case set is generated in the same step as intake — they are not separable (cases are pipeline input, not pipeline output).

```json
{
  "feature": "string — name of the feature being evaluated",
  "description": "string — what the feature does and for whom",
  "targetUser": "string — who the end user is (e.g. Brazilian SMB owner, beauty salon)",
  "successCriteria": [
    {
      "criterion": "string — what success looks like",
      "measurementMethod": "string — how it is measured in the eval"
    }
  ],
  "variants": [
    {
      "id": "string — variant identifier, e.g. haiku-v1",
      "model": "string — model ID used as bot, e.g. claude-haiku-4-5-20251001",
      "promptVariantId": "string — which prompt version is loaded, e.g. prompt-v1",
      "description": "string — what differs in this variant",
      "endpoint": "string — sandboxed API endpoint or local model path"
    }
  ],
  "userSimulatorModel": "string — model used for LLM-plays-user pass in e3 simulator",
  "rubricFile": "string — path to the rubric in use (e.g. evalagent/RUBRIC-DRAFT.md)",
  "maxTurnsPerCase": "number — hard ceiling on conversation turns before exitState=max-turns-reached",
  "cases": {
    "cases": [
      {
        "id": "string — stable identifier, e.g. case-01",
        "label": "string — human-readable slug, e.g. happy-path-beauty-salon",
        "category": "happy-path | edge-case | adversarial",
        "subcategory": "string — e.g. confused-user, wrong-language, prompt-injection, off-topic",
        "routing": "llm | rules-primary",
        "segment": {
          "vertical": "beauty | clinic | petshop | mixed | unknown",
          "language": "pt-BR | en | mixed | other",
          "source": "designed | complaint-mined | canary | regression"
        },
        "persona": {
          "description": "string — who this user is (vertical, tech comfort, urgency)",
          "language": "string — pt-BR | en | mixed | other"
        },
        "turns": [
          { "role": "user", "content": "string" }
        ],
        "expectedBehavior": "string — what the concierge MUST do to pass (specific, testable, ≥20 chars)",
        "expectedNonBehavior": "string — what the concierge must NOT do (required for adversarial and rules-primary cases)",
        "passCriteria": "string — minimum score on which criterion(a) constitutes a pass",
        "notes": "string — optional context for the judge"
      }
    ],
    "summary": {
      "total": "number",
      "byCategory": {
        "happy-path": "number",
        "edge-case": "number",
        "adversarial": "number"
      }
    }
  },
  "createdAt": "ISO 8601 datetime",
  "author": "string"
}
```

**Hard rules for e1:**
- `variants` must have ≥1 entry. Each variant must specify `model` and `promptVariantId`.
- `successCriteria` must have ≥1 entry with both fields non-empty.
- `rubricFile` must point to a file that exists at the time of init.
- `userSimulatorModel` must be non-empty (set to a different model from the default bot variant when possible, to reduce self-preference bias).
- Every case must have `expectedBehavior` — non-empty string, minimum 20 characters.
- Adversarial cases and `routing: "rules-primary"` cases must also have `expectedNonBehavior`.
- `category` must be one of the three enumerated values.
- Minimum distribution: ≥3 happy-path, ≥4 edge-case, ≥3 adversarial (for a 15-case set).
- `turns` must have at least one user turn.
- `id` must be unique across the set.

---

## e2 — calibration.json (rubric + human labels + agreement)

Hand-labeled calibration cases + LLM agreement scores.  
Written jointly: human fills `humanScores`, CLI runs the LLM judge on the same cases, computes agreement, and sets `calibrationPassed` and `confidence`.

```json
{
  "calibrationCases": ["case-id-1", "case-id-2", "..."],
  "nCases": "number — count of calibration cases; CLI uses this to determine confidence",
  "confidence": "smoke | statistical",
  "rubricCriteria": ["string — criterion name", "..."],
  "humanScores": {
    "case-id-1": {
      "CriterionName": "number 1-5",
      "rationale": "string — why the human scored this way"
    }
  },
  "llmScores": {
    "case-id-1": {
      "CriterionName": "number 1-5",
      "rationale": "string — LLM's rationale"
    }
  },
  "agreement": {
    "CriterionName": {
      "withinOnePct": "number 0-100 — % of calibration cases where |human-llm| ≤ 1",
      "avgAbsError": "number — mean absolute error across calibration cases"
    }
  },
  "calibrationPassed": "boolean — set by CLI; true iff all criteria have withinOnePct ≥ 75",
  "failingCriteria": ["string — criteria that did not reach 75% within-1 agreement"],
  "calibrationDate": "ISO 8601 date",
  "judgeModel": "string — which LLM was used as the judge in this calibration run",
  "notes": "string — rubric amendments made after calibration to improve agreement"
}
```

**Hard rules for e2:**
- `calibrationCases` must contain ≥5 case IDs, all present in the case set in `intake.json`.
- `humanScores` must cover all criteria for all calibration cases — no partial labels.
- `llmScores` must cover the same set.
- `calibrationPassed` is set by the CLI, not by the human or LLM.
- `confidence` is set by the CLI: `"smoke"` if `nCases < 10`, `"statistical"` if `nCases ≥ 10`. Human cannot override.
- If `calibrationPassed` is `false`, `failingCriteria` must be non-empty.
- The CLI blocks e3-run until `calibrationPassed` is `true`.
- A `confidence: "smoke"` calibration that passes does NOT block e3-run, but the report must display a smoke-test warning in its header: "Calibration: SMOKE TEST (N=5). Statistical validity requires N≥10."

---

## e3 — transcripts/ (simulator output)

One file per (case × variant) combination. Written by the simulator in e3-run; never modified after creation.

### Transcript file: `transcripts/<runId>/<caseId>-<variantId>.json`

```json
{
  "caseId": "string",
  "variantId": "string",
  "promptVariantId": "string — which prompt version was loaded",
  "model": "string — model ID used as bot, e.g. claude-haiku-4-5-20251001",
  "userSimulatorModel": "string — model used to generate user turns (LLM-plays-user pass)",
  "simulatorMode": "scripted-user | simulated-user | mixed",
  "runId": "string",
  "turns": [
    {
      "role": "user | assistant",
      "content": "string",
      "tokenCount": "number",
      "timestampMs": "number",
      "source": "scripted | simulated"
    }
  ],
  "totalTokens": "number",
  "costUSD": "number — actual cost if reported by API; estimated from token counts + price table if not",
  "costEstimateSource": "api-reported | token-estimate",
  "latencyMs": "number — total wall-clock time for this transcript, ms",
  "exitState": "flow-selected | abandoned | error | max-turns-reached",
  "exitEvidence": "string — the exact turn content or error token that triggered this exitState",
  "writtenAt": "ISO 8601 datetime",
  "sha256": "string — hash of this file's content; stored externally in transcripts/<runId>/index.json"
}
```

**`simulatorMode` values:**
- `"scripted-user"` — all user turns come from the case's `turns` array; no LLM-plays-user pass.
- `"simulated-user"` — scripted opener only; subsequent user turns generated by LLM-plays-user.
- `"mixed"` — some turns scripted (adversarial injections), some simulated.

**Hard rules for e3:**
- `exitState` must be one of the four enumerated values. Any other value is a schema error.
- `exitEvidence` must be non-empty.
- `model`, `promptVariantId`, `latencyMs`, `costUSD`, and `userSimulatorModel` must all be non-null. These are required for the frontier table in e4.
- `costUSD` must be non-null. If the endpoint does not report token costs, the CLI estimates from token counts and a stored price table, and sets `costEstimateSource: "token-estimate"`.
- Transcript files are written atomically (write to `.tmp`, then rename). Partial writes are deleted.
- The CLI writes each file's SHA-256 to `transcripts/<runId>/index.json` immediately after creation. This is the integrity anchor for e4.

### Transcript index: `transcripts/<runId>/index.json`

```json
{
  "runId": "string",
  "createdAt": "ISO 8601 datetime",
  "entries": [
    {
      "caseId": "string",
      "variantId": "string",
      "file": "string — relative path",
      "sha256": "string",
      "latencyMs": "number",
      "costUSD": "number",
      "exitState": "string"
    }
  ]
}
```

---

## e4 — 04-report.json (judgments + frontier table)

One judgment per (case × variant), plus per-variant aggregates and the frontier table. The LLM writes per-case scores and rationale; everything else is computed by the CLI.

```json
{
  "runId": "string",
  "feature": "string",
  "calibrationRef": "string — path to calibration.json used for this run",
  "calibrationConfidence": "smoke | statistical",
  "rubricRef": "string — path to rubric file",
  "judgments": [
    {
      "caseId": "string",
      "variantId": "string",
      "transcriptFile": "string — relative path to transcript",
      "transcriptHash": "string — sha256 from transcript index; CLI verifies match before rendering",
      "scores": {
        "CriterionName": "number 1-5"
      },
      "weightedTotal": "number — computed by CLI from scores × weights, not by LLM",
      "latencyMs": "number — copied from transcript by CLI",
      "costUSD": "number — copied from transcript by CLI",
      "flags": ["verbosity-warning | position-bias-risk | self-preference-risk | injection-detected | rules-routing-failure"],
      "rationale": "string — LLM's scoring rationale referencing specific transcript turns",
      "passFailVerdict": "pass | fail | marginal",
      "passFailRationale": "string — reference to expectedBehavior from the case",
      "calibrationRunId": "string — the e2 calibration run this judge is anchored to"
    }
  ],
  "variants": [
    {
      "id": "string",
      "model": "string",
      "promptVariantId": "string",
      "avgWeightedScore": "number",
      "avgLatencyMs": "number",
      "avgCostUSD": "number",
      "scoresByCategory": {
        "happy-path": "number",
        "edge-case": "number",
        "adversarial": "number"
      },
      "scoresByCriterion": {
        "CriterionName": "number"
      },
      "scoresBySegment": {
        "beauty": "number",
        "clinic": "number",
        "petshop": "number"
      },
      "passRate": "number — % of cases with passFailVerdict=pass",
      "failureTaxonomy": {
        "PatternLabel": "number — count of cases exhibiting this failure"
      }
    }
  ],
  "frontierTable": [
    {
      "variantId": "string",
      "qualityScore": "number",
      "avgLatencyMs": "number",
      "avgCostUSD": "number",
      "paretoNote": "string — e.g. 'dominates on quality', 'cheapest', 'fastest', 'dominated'"
    }
  ],
  "winner": {
    "quality": "string variant id | inconclusive",
    "cost": "string variant id",
    "latency": "string variant id",
    "qualityConfidenceInterval": [0.0, 0.0],
    "qualityWinnerRationale": "string — which cases and criteria drove the quality decision"
  },
  "criticalFailures": [
    {
      "caseId": "string",
      "variantId": "string",
      "reason": "string"
    }
  ],
  "totalCostUSD": "number — sum of all transcript costs",
  "costPerCase": "number",
  "generatedAt": "ISO 8601 datetime"
}
```

**Hard rules for e4:**
- Every (case × variant) combination in the case set must have a corresponding judgment. Missing entries block rendering.
- `transcriptHash` must match the hash in `transcripts/<runId>/index.json`. Mismatch = pipeline integrity failure; rendering blocked.
- `weightedTotal`, `latencyMs`, and `costUSD` in each judgment are computed by the CLI from transcript data. The LLM must not write these — if it does, the CLI overwrites them.
- `winner.quality` must be `"inconclusive"` if `qualityConfidenceInterval` overlaps zero.
- `criticalFailures` must list every case where `passFailVerdict=fail` on any criterion with weight ≥ 0.20.
- `totalCostUSD` must be computed from transcript `costUSD` fields, not estimated.
- `calibrationConfidence: "smoke"` requires a header warning in the rendered DOCX: "Calibration: SMOKE TEST (N=5). Upgrade to N≥10 for statistical validity before using these results to make deployment decisions."
- The judge preamble must include `calibrationRunId` before any scores. This is the traceability link back to e2.
- Score values in report narrative text are referenced as `{{score:variantId:criterion}}` tokens resolved by the renderer. No raw numbers in prose.
- Adversarial cases where the concierge complied with injection or off-topic framing must be flagged `injection-detected`. This is not optional — it is the primary signal for adversarial robustness.

---

## Schema validator structure (for evalagent/cli.js)

Mirrors `core/schema.js`. Each step has a validator function returning an array of error strings.

```js
// evalagent/schema.js (to be implemented)
const validators = {
  'e1-intake':      (d) => { /* check variants have model+promptVariantId, successCriteria, rubricFile exists, case distribution */ },
  'e2-calibrate':   (d) => { /* check humanScores complete, confidence set by N, calibrationPassed set by CLI */ },
  'e3-transcripts': (index) => { /* check all (case × variant) pairs have transcripts; latencyMs, costUSD, model non-null */ },
  'e4-report':      (d, transcriptIndex) => { /* check hash matches, weightedTotal not from LLM, frontierTable present, winner CI logic */ },
};
```

Status command output mirrors strategy agent:

```
$ node evalagent/cli.js status

Step         Status     Issues
e1-intake    ✓ done     —
e2-calibrate ✗ blocked  Goal Completion: 60% within-1 agreement (threshold 75%). Revise anchor for score 3.
e3-run       — pending  blocked by e2
e4-judge     — pending  blocked by e2
```

---

## Changelog

| Date | Version | Change |
|---|---|---|
| 2026-06-12 | 1.0 | Initial schemas — 6-step pipeline |
| 2026-06-12 | 2.0 | 6→4 step pipeline; e1 merged with cases (added `segment`, `routing` fields); e2 calibration adds `confidence`, `nCases`, `judgeModel`; e3 transcript adds `model`, `promptVariantId`, `latencyMs`, `costEstimateSource`, `userSimulatorModel`, `simulatorMode`, per-turn `source`; e4 merged judge+report, adds `frontierTable`, per-segment scores, split `winner` object; hard rule 8 added for `confidence` |
