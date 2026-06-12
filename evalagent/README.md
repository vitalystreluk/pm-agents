# Eval Agent (scaffold — next up)

Evaluates LLM features. Target case: AI Onboarding Concierge (BotConversa strategy).

Planned pipeline:
1. Intake: feature description + sample dialogues.
2. Generate eval set (happy path + edge cases + adversarial), small by design (15-20 cases for demo; Batch API for 200+ in prod).
3. Build LLM-as-a-Judge rubric; calibrate against 5 hand-labeled cases before trusting it.
4. Run variants (prompt A vs B, model A vs B); judge scores with per-category error breakdown.
5. Report: winner, confidence, failure taxonomy, cost per run.

Shared spine: every judge verdict links to the exact transcript it scored (core/ traceability).
