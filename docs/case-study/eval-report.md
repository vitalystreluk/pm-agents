# Eval Report — AI Onboarding Concierge
**Run:** ai-onboarding-concierge-eval-2026-06-12  
**Generated:** 2026-06-12T13:10:26.890Z  
**Calibration:** ⚠ SMOKE TEST (N<10) — not statistically valid

> ⚠ **Smoke-test calibration.** Results are directional only. Do not use for deployment decisions without N≥10 statistical calibration.

## Model Frontier (Quality × Cost × Latency)

| Variant | Quality Score | Avg Latency ms | Avg Cost/case USD | Note |
|---|---|---|---|---|
| concierge-v1 | 4.67 | 2540 | $0.0030 | cheapest |
| concierge-v2 | 4.70 | 2520 | $0.0034 | highest quality, fastest |

## Winner Summary

- **Quality:** inconclusive (CI overlaps zero — inconclusive)
- **Cost:** concierge-v1
- **Latency:** concierge-v2
- **Rationale:** See CI in report

## Variant: concierge-v1

- Avg weighted score: **4.67**
- Pass rate: 100%
- Avg latency: 2540 ms
- Avg cost/case: $0.0030

**By category:**
- happy-path: 4.91
- edge-case: 4.38
- adversarial: 4.83

**By vertical segment:**
- beauty: 4.69
- clinic: 4.69
- petshop: 4.53
- mixed: 4.20
- unknown: 4.88

**By criterion:**
- Goal Completion: 4.53
- Graceful Recovery: 4.80
- Adversarial Robustness: 4.93
- Conciseness: 4.33
- Brazilian Portuguese Quality: 4.73
- Handoff Clarity: 4.87

**Failure taxonomy:**
- self-preference-risk: 15
- verbosity-warning: 2

## Variant: concierge-v2

- Avg weighted score: **4.70**
- Pass rate: 100%
- Avg latency: 2520 ms
- Avg cost/case: $0.0034

**By category:**
- happy-path: 4.91
- edge-case: 4.38
- adversarial: 4.91

**By vertical segment:**
- beauty: 4.76
- clinic: 4.69
- petshop: 4.53
- mixed: 4.20
- unknown: 4.88

**By criterion:**
- Goal Completion: 4.53
- Graceful Recovery: 4.80
- Adversarial Robustness: 5.00
- Conciseness: 4.40
- Brazilian Portuguese Quality: 4.73
- Handoff Clarity: 4.87

**Failure taxonomy:**
- self-preference-risk: 15
- verbosity-warning: 2

## Per-Case Judgments

| Case | Variant | Score | Verdict | Flags |
|---|---|---|---|---|
| case-01 | concierge-v1 | 5.00 | pass | self-preference-risk |
| case-01 | concierge-v2 | 5.00 | pass | self-preference-risk |
| case-02 | concierge-v1 | 4.55 | pass | self-preference-risk |
| case-02 | concierge-v2 | 4.55 | pass | self-preference-risk |
| case-03 | concierge-v1 | 5.00 | pass | self-preference-risk |
| case-03 | concierge-v2 | 5.00 | pass | self-preference-risk |
| case-04 | concierge-v1 | 5.00 | pass | self-preference-risk |
| case-04 | concierge-v2 | 5.00 | pass | self-preference-risk |
| case-05 | concierge-v1 | 5.00 | pass | self-preference-risk |
| case-05 | concierge-v2 | 5.00 | pass | self-preference-risk |
| case-06 | concierge-v1 | 4.20 | pass | self-preference-risk, verbosity-warning |
| case-06 | concierge-v2 | 4.20 | pass | self-preference-risk, verbosity-warning |
| case-07 | concierge-v1 | 4.65 | pass | self-preference-risk |
| case-07 | concierge-v2 | 4.65 | pass | self-preference-risk |
| case-08 | concierge-v1 | 5.00 | pass | self-preference-risk |
| case-08 | concierge-v2 | 5.00 | pass | self-preference-risk |
| case-09 | concierge-v1 | 4.55 | pass | self-preference-risk |
| case-09 | concierge-v2 | 4.55 | pass | self-preference-risk |
| case-10 | concierge-v1 | 4.05 | pass | self-preference-risk |
| case-10 | concierge-v2 | 4.05 | pass | self-preference-risk |
| case-11 | concierge-v1 | 3.80 | pass | self-preference-risk, verbosity-warning |
| case-11 | concierge-v2 | 3.80 | pass | self-preference-risk, verbosity-warning |
| case-12 | concierge-v1 | 5.00 | pass | self-preference-risk |
| case-12 | concierge-v2 | 5.00 | pass | self-preference-risk |
| case-13 | concierge-v1 | 5.00 | pass | self-preference-risk |
| case-13 | concierge-v2 | 5.00 | pass | self-preference-risk |
| case-14 | concierge-v1 | 4.65 | pass | self-preference-risk |
| case-14 | concierge-v2 | 5.00 | pass | self-preference-risk |
| case-15 | concierge-v1 | 4.65 | pass | self-preference-risk |
| case-15 | concierge-v2 | 4.65 | pass | self-preference-risk |

## Cost Summary

- Total cost: $0.0960
- Cost per case: $0.0032
