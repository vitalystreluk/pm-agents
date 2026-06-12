Run step e3 (simulator — generate transcripts) of the eval pipeline.

## What you do

**Prerequisite:** `calibration.json` must exist with `calibrationPassed: true` (e2 green in status).

1. Read `output/<latest eval run>/intake.json` — get `cases`, `variants`, `userSimulatorModel`, `maxTurnsPerCase`, `rubricFile`.
2. For each **(case × variant)** combination:
   a. Generate the transcript using the two-pass simulator (see below).
   b. Write `output/<run>/transcripts/<caseId>-<variantId>.json`.
3. After all transcripts are written, the CLI writes `transcripts/index.json` with SHA-256 hashes.

Run after each transcript: `node evalagent/cli.js status` (or batch at end). Zero errors = exit condition.

## Two-pass simulator protocol

**Pass 1 — LLM-plays-bot:**
You play the bot (using the variant's `promptVariantId` system prompt). Generate assistant turns in response to each user turn. The bot is the feature under test.

**Pass 2 — LLM-plays-user:**
You play the user (using the case `persona` description). Generate realistic user turns for turns NOT scripted in the case's `turns` array. The scripted turns are injected as-is (especially for adversarial cases).

**Turn sequencing:**
1. Inject turn 1 from `case.turns` (scripted user opener).
2. Generate assistant turn 1 as the bot.
3. If case has a scripted turn 2 (user), inject it. If not, generate it from persona.
4. Generate assistant turn 2 as the bot.
5. Continue until `exitState` is reached or `maxTurnsPerCase` is hit.

**`exitState` (set by you, enforced by schema — NOT improvised):**
- `flow-selected` — final assistant turn contains a clear template activation confirmation or specific link/step to activate
- `abandoned` — user stopped responding or conversation ended without activation (including adversarial cases that were deflected)
- `error` — the bot produced an empty or malformed response
- `max-turns-reached` — `maxTurnsPerCase` was hit

`exitEvidence` must name the exact turn content or signal that triggered the state.

## Transcript file schema

```json
{
  "caseId": "case-01",
  "variantId": "haiku-v1",
  "promptVariantId": "prompt-v1",
  "model": "claude-haiku-4-5-20251001",
  "userSimulatorModel": "claude-sonnet-4-6",
  "simulatorMode": "scripted-user | simulated-user | mixed",
  "runId": "<run folder name>",
  "turns": [
    { "role": "user | assistant", "content": "...", "tokenCount": 0, "timestampMs": 0, "source": "scripted | simulated" }
  ],
  "totalTokens": 0,
  "costUSD": 0.0000,
  "costEstimateSource": "api-reported | token-estimate",
  "latencyMs": 0,
  "exitState": "flow-selected | abandoned | error | max-turns-reached",
  "exitEvidence": "the exact turn content or token that triggered this exitState",
  "writtenAt": "ISO 8601",
  "sha256": null
}
```

`sha256` is null in the file you write — the CLI computes and stores it in the index.

## Required fields (hard rule 5 from SCHEMAS.md)

`model`, `promptVariantId`, `latencyMs`, `costUSD`, and `userSimulatorModel` must all be non-null.
Estimate `latencyMs` from actual generation time. Estimate `costUSD` from token counts × price table (set `costEstimateSource: "token-estimate"`).

## `simulatorMode`

- `scripted-user` — all user turns are from the case's `turns` array
- `simulated-user` — scripted opener only; subsequent user turns are generated from persona
- `mixed` — some turns scripted (adversarial injections must be scripted exactly), some generated

For adversarial cases: turns in `case.turns` are scripted exactly as written (injection text must not be paraphrased). Set `simulatorMode: "mixed"` or `"scripted-user"`.

## After writing all transcripts

Run: `node evalagent/cli.js status`
e3 should show [x] once `transcripts/index.json` exists with all entries valid.
