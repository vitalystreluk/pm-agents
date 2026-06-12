# Discovery Agent — Cluster Labeling Rubric v1

This rubric governs how LLM assigns theme labels, cluster types, and severity scores in d3-label.  
It also defines the mini-calibration protocol that validates label quality before a run is considered reliable.

**Shared spine:** a severity score without a rationale is an opinion. A label without quotes is a guess.

---

## Part 1 — Severity Scale

Severity measures how badly the pain affects the user and how much it threatens product retention or acquisition. It does not measure frequency — frequency is computed by code (d2). A rare-but-critical bug can be severity 5 at frequency 3.

| Score | Label | Anchor |
|---|---|---|
| 5 | Critical | Workflow is completely blocked. User cannot accomplish their goal at all. Data loss is likely or confirmed. No workaround exists. Typical signals: "não consigo usar," "perdi tudo," "impossível." |
| 4 | Major | Core workflow is severely degraded. User can sometimes complete the goal, but with significant effort or partial failure. A workaround exists but is not obvious or reliable. Typical signals: "trava frequentemente," "às vezes funciona," "perdi dados uma vez." |
| 3 | Moderate | Secondary workflow or quality of life issue. User can complete their goal but the experience is frustrating or suboptimal. Typical signals: "poderia ser melhor," "demora muito," "a interface confunde." |
| 2 | Minor | Cosmetic, stylistic, or extremely low-frequency. Does not affect user goals. Typical signals: "achei feio," "não gostei do design," "poderia ter dark mode." |
| 1 | Noise or praise | The text is not actionable as a complaint: generic praise ("ótimo app"), non-specific frustration ("odiei"), or content that belongs to a different product. |

### Severity anchors for BotConversa-specific failure modes

| Failure mode | Default severity | Override condition |
|---|---|---|
| Flow setup crashes / data loss | 5 | Lower to 4 if workaround is documented in-app |
| Flow not activating (bot doesn't respond) | 5 | — |
| Integration broken (WhatsApp connection dropped) | 5 | Lower to 4 if reconnect is self-service |
| Onboarding stuck / trial expired before setup | 4 | Raise to 5 if user could not recover the account |
| Incorrect template recommendation | 3 | Raise to 4 if it caused a compliance failure |
| Slow load times | 3 | Raise to 4 if > 30 seconds or caused session loss |
| Missing feature (user expected it) | 3 | Raise to 4 if it's blocking a paid use case |
| UI confusion / bad copy | 2 | — |
| Pricing complaint (perceived not actual bug) | 2 | Raise to 3 if pricing caused trial churn |

### Severity anti-patterns (common LLM mistakes)

- **Severity inflation:** Labeling every complaint as 4 or 5. The distribution should resemble a pyramid — most complaints are 2–3; 4–5 is reserved for workflow-blocking failures.
- **Severity from frequency:** Writing "this affects many users" as a severity justification. Frequency is irrelevant to severity. A crash that happens to 1 user is still severity 5.
- **Severity from emotion:** User anger ("odeio esse app") does not raise severity. Score the actual impact, not the tone.
- **Missing workaround check:** Severity 5 requires "no workaround exists." If the user mentions a workaround ("consertei reiniciando"), cap at 4.

---

## Part 2 — Cluster Type Definitions

`clusterType` classifies the nature of the feedback in the cluster, not its severity.

| Type | Definition | Typical signals |
|---|---|---|
| `complaint` | Users report something that broke, failed, or fell short of expectation. | "trava," "não funciona," "perdeu," "impossível," "erro," "bug" |
| `feature-request` | Users describe something they want that doesn't exist. | "seria bom se," "falta," "gostariam de," "por que não tem," "quero" |
| `question` | Users are confused about how to do something (suggests UX or documentation gap). | "como faço," "como configuro," "não entendi," "preciso de ajuda com" |
| `praise` | Positive signal — something working well. Useful to preserve intentionally. | "adorei," "funciona perfeitamente," "muito fácil," "recomendo" |
| `noise-label` | HDBSCAN grouped these rows by density, but the LLM finds no coherent theme. Cluster is semantically incoherent. | Mixed signals, multiple unrelated topics, very short texts |

**A cluster may contain multiple types.** Assign the dominant type (>50% of items). If no type exceeds 50%, assign `complaint` (default — complaints are the most actionable for PM purposes) and note the ambiguity in `severity_rationale`.

---

## Part 3 — Theme Naming Guidelines

The theme is a short title (3–12 words) describing the cluster's dominant pain. It appears in the report headline and must be readable by a non-technical stakeholder.

**Good theme names:**
- "App crashes during WhatsApp flow setup"
- "Onboarding trial expired before first flow activated"
- "Bot stops responding after WhatsApp reconnection"
- "Confusing template selection in onboarding wizard"

**Bad theme names:**
- "Issues with the application" — too vague
- "Users report problems with flows 47% of the time" — contains a quantitative claim (forbidden, D3-R5)
- "WhatsApp integration bug #3" — technical ID, not a PM-readable theme
- "Negative feedback about product quality" — describes the cluster type, not the theme

**Language:** Write the theme in English regardless of the source language of the feedback. This aligns with the strategy agent's claim statements (which are in English) and enables cross-referencing via `strategyClaimIds`.

---

## Part 4 — Citation Selection Guidelines

`sample_quotes` should be chosen to maximize evidence value:

1. **Diversity:** Do not select 3 quotes that all say the same thing. Select quotes that cover the range of the cluster — different phrasings, different sources, different severities within the cluster.
2. **Specificity:** Prefer quotes that name a specific feature, screen, or error over generic frustration. "O fluxo de cadastro trava na tela de templates" > "o app é ruim."
3. **Attributability:** If a quote contains PII (name, email, CPF), redact or skip it. Use `[redacted]` inline — do not alter the row_id.
4. **Language:** Include quotes in the source language (PT-BR or EN). Do not translate quotes. The citation appears verbatim in the report.
5. **Authenticity check:** Only select quotes whose `row_id` you have verified in the cluster's `rowIds` list. Do not compose a quote from memory.

---

## Part 5 — Mini-Calibration Protocol

Before relying on discovery output for strategic decisions, the PM should run a mini-calibration to validate that the LLM's labels are consistent with human judgment. This mirrors the eval agent's e2-calibrate step.

### Why calibration is needed

LLM labelers show predictable biases in cluster labeling:
- Severity inflation (defaulting to 4–5)
- Feature-request/complaint confusion (labeling legitimate bugs as feature requests)
- Theme specificity drift (vague themes for large, heterogeneous clusters)

A calibration step catches these systematically before they affect a full run.

### How to run mini-calibration

1. **Select calibration sample:** Choose 5–8 clusters from `02-clusters.json` representing a range of sizes, cluster types, and source languages. Include at least one small cluster (< 10 items), one large cluster (> 30 items), and one mixed-language cluster.

2. **Human labels first:** For each calibration cluster, the PM reads the cluster's items (all items for small clusters; random 20-item sample for large clusters) and records:
   - `theme` (3–12 words)
   - `clusterType` (one of the 5 types)
   - `severity` (1–5)
   - `severity_rationale` (≥20 words)

   Human labels are written to `calibration.json → humanLabels` before d3-label is run on calibration clusters. This prevents anchoring (the PM must not see the LLM's labels before writing their own).

3. **Run d3-label on calibration clusters only:**
   ```
   python discovery/cli.py label --calibration-only
   ```
   Produces LLM labels for the 5–8 calibration clusters.

4. **CLI computes agreement:**
   - **Severity agreement:** `|human_severity − llm_severity| ≤ 1` → within-1-point. Must be ≥75% of calibration cases.
   - **ClusterType agreement:** Exact match. Must be ≥75% of calibration cases.
   - **Theme agreement:** Not automated (themes are natural language). PM reviews theme pairs and marks each as `"aligned"` / `"misaligned"` / `"acceptable"` in `calibration.json`.

5. **Gate:**
   - Severity agreement ≥ 75% AND clusterType agreement ≥ 75% → `calibrationPassed: true`
   - Either criterion < 75% → `calibrationPassed: false`. CLI prints disagreement cases and likely rubric gaps. Rubric amended and calibration re-run.

6. **After calibration:** Run d3-label on remaining clusters:
   ```
   python discovery/cli.py label --skip-calibrated
   ```

### Calibration output schema

```json
{
  "calibrationClusters": ["c01", "c03", "c07", "c09", "c11", "c12"],
  "nClusters": 6,
  "labelSource": "human",
  "humanLabels": {
    "c01": { "theme": "...", "clusterType": "complaint", "severity": 4, "severity_rationale": "..." }
  },
  "llmLabels": {
    "c01": { "theme": "...", "clusterType": "complaint", "severity": 5, "severity_rationale": "..." }
  },
  "agreement": {
    "severity": { "withinOnePct": 83, "avgAbsError": 0.50 },
    "clusterType": { "exactMatchPct": 83 }
  },
  "calibrationPassed": true,
  "disagreementNotes": {
    "c01-severity": "Human=4, LLM=5. LLM cited frequency as severity justification (anti-pattern). Fixed: severity inflation anti-pattern added to rubric."
  },
  "judgeModel": "claude-sonnet-4-6"
}
```

### Calibration confidence levels

| Mode | N clusters | `confidence` | Meaning |
|---|---|---|---|
| Smoke | 5–7 | `"smoke"` | Catches gross misalignment. Does not validate rubric accuracy. |
| Statistical | ≥10 | `"statistical"` | Agreement percentages have statistical weight. |

`confidence` is set by the CLI from N — not overridable by the PM.

---

## Part 6 — Known Judge Failure Modes

| # | Failure mode | Mitigation |
|---|---|---|
| J1 | Severity inflation — LLM defaults to 4–5 for all complaints | Calibration. Explicit anchor table. Anti-pattern list in Part 1. |
| J2 | Frequency-as-severity — LLM uses cluster size to justify high severity | D3-R5 blocks quantitative claims in severity_rationale. Anti-pattern J2 in calibration review. |
| J3 | Hallucinated quotes — LLM cites text not present in the cluster | Citation integrity check (D3-R2) catches this deterministically. |
| J4 | Vague themes for large clusters — LLM generalizes too broadly | Composition check (Pass 3 in DESIGN §4). PM spot-check recommended for clusters > 50 items. |
| J5 | Feature-request/complaint conflation — missing feature labeled as complaint | ClusterType agreement in calibration. Definition table in Part 2. |
| J6 | Anchoring from cluster size — LLM labels large clusters more severely | LLM sees cluster size as context but is explicitly told not to use it for severity. Calibration detects if this instruction is ignored. |
| J7 | Language switching — LLM writes severity_rationale in PT-BR when corpus is mixed | No hard rule (rationale language doesn't affect validity). PM may set preference in d3 prompt. |

---

## Changelog

| Date | Version | Change |
|---|---|---|
| 2026-06-12 | 1.0 | Initial rubric — severity scale; BotConversa-specific anchors; cluster types; citation guidelines; mini-calibration protocol; known failure modes |
