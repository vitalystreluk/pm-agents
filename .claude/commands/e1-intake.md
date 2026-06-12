Run step e1 (intake + cases) of the eval pipeline.

## What you do

1. Read `output/<latest eval run>/intake.json` (latest = newest folder in output/ containing "-eval-").
2. Inspect the `feature`, `description`, and `targetUser` fields.
3. Generate a case set covering the feature under test. Target: 5 happy-path, 6 edge-case, 4 adversarial (15 total). Each case must follow the schema below.
4. Fill in the following fields in `intake.json` — REWRITE the full file with these additions:
   - `successCriteria`: 3–5 measurable criteria for this eval (min 1 entry)
   - `variants`: at least 1 variant with `id`, `model`, `promptVariantId`, `description`, `endpoint`
   - `userSimulatorModel`: the model to use for LLM-plays-user simulator pass (use claude-sonnet-4-6 unless intake specifies otherwise)
   - `cases.cases`: the generated case array
   - `cases.summary`: auto-calculated counts
5. Run `node evalagent/cli.js status` and fix any schema errors before finishing.

## Case schema (each case must have all fields)

```json
{
  "id": "case-NN",
  "label": "slug-like-this",
  "category": "happy-path | edge-case | adversarial",
  "subcategory": "descriptive label",
  "routing": "llm | rules-primary",
  "segment": {
    "vertical": "beauty | clinic | petshop | mixed | unknown",
    "language": "pt-BR | en | mixed | other",
    "source": "designed"
  },
  "persona": {
    "description": "who this user is — role, location, tech comfort, urgency",
    "language": "pt-BR | en | mixed"
  },
  "turns": [
    { "role": "user", "content": "first user message in the persona's language" }
  ],
  "expectedBehavior": "what the bot MUST do (specific, testable, ≥20 chars)",
  "expectedNonBehavior": "what the bot must NOT do (required for adversarial and rules-primary cases)",
  "passCriteria": "minimum score or verdict that constitutes a pass",
  "notes": "optional context for the judge"
}
```

## Hard rules

- `expectedBehavior` must be ≥20 characters and specific enough to score against — "bot should respond well" is rejected.
- `adversarial` and `rules-primary` cases MUST have `expectedNonBehavior`.
- `routing: "rules-primary"` when the correct behavior is deterministic (price lookups, feature availability, known injection patterns). Write a `notes` explaining which rule fires.
- Distribution: ≥3 happy-path, ≥4 edge-case, ≥3 adversarial.
- `id` must be unique across the set.

## VALUE CONTRACT (cases, not claims)

Never invent product capabilities that are not in the feature description. If a case requires a feature that may not exist, mark the `expectedBehavior` accordingly and flag it in `notes`.

After writing, run `node evalagent/cli.js status` — zero errors is the exit condition.
