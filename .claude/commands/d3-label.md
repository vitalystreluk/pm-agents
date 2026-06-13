Run step d3 (label) of the discovery pipeline. This is the ONLY LLM step — everything else is the deterministic CLI (`discovery/cli.py`).

## What you do

**Prerequisite:** `02-clusters.json` must exist (d2-cluster green in `status`). If not, run `python discovery/cli.py cluster` first.

1. Read `output/<latest discovery run>/02-clusters.json` — the list of clusters, each with `cluster_id`, `size`, and `rowIds`. **`size` is context only — never repeat it or any count in your output.**
2. Read `output/<run>/01-corpus.json` — the corpus rows. You will quote ONLY from here, by `row_id`.
3. Read `discovery/RUBRIC-CLUSTERS.md` in full — internalize the severity scale, cluster-type definitions, theme-naming and citation guidelines, and the judge failure modes.
4. Label each cluster **independently** (one batch call per cluster — see Pass 3). Do not let one cluster's label anchor another.
5. Write `output/<run>/03-labels.json` (schema below).
6. Run `python discovery/cli.py report` — the CLI validates your labels (3 passes), computes all frequencies, and renders the report.

## Hard constraints (the CLI enforces these — violating them gets your block rejected)

- **No quantitative claims (D3-R5).** Your `theme` and `severity_rationale` may NOT contain counts or percentages. Patterns like `40%`, `12 users`, `3 cases`, `many reviews` are rejected by regex. Frequencies are computed by d2, not you. Describe the theme qualitatively; the CLI attaches the numbers.
- **Cite only real rows (D3-R2).** Every `row_id` in `sample_quotes` must exist in `01-corpus.json`, and the quoted `text` must match the stored row text. Do not compose, paraphrase, or invent quotes. A quote you cannot trace to a `row_id` in the cluster's `rowIds` list is a hard block.
- **3–5 quotes per cluster (D3-R3).** Fewer than 3 = insufficient evidence (block). More than 5 = rejected. Pick the best 3–5; do not pad.
- **Severity is an integer 1–5 with a rationale of ≥20 words (R3 / D3-R4).** No rationale, or a rationale under 20 words, is rejected.
- **`severity` measures impact, not frequency (Rubric Part 1).** A rare crash is still severity 5. Do not justify severity with how many rows are in the cluster — that is anti-pattern J2 and also trips the quantitative-claim regex.
- **`clusterType` ∈ {complaint, question, praise, feature-request, noise-label} (D3-R6).** Assign the dominant type (>50%); default to `complaint` if none dominates, and note the ambiguity in the rationale. Use `noise-label` only when the cluster has no coherent theme.

## Pass 3 — one batch call per cluster

For each cluster, read its `rowIds` (sample up to 20 if larger), and in a single pass produce: `theme`, `clusterType`, `severity`, `severity_rationale`, and `sample_quotes`. Do not split a cluster across multiple calls. Themes are written in **English** regardless of the source language of the feedback (Rubric Part 3); quotes are kept **verbatim** in their original language (Rubric Part 4).

If a cluster looks incoherent (multiple unrelated topics, very short texts), label it `noise-label` and let the PM decide — do not force a theme.

## 03-labels.json schema

```json
{
  "schemaVersion": "1.0",
  "runId": "<run folder name>",
  "labeledAt": "<ISO timestamp>",
  "labelBackend": "claude-code",
  "labelModel": "claude-fable-5",
  "labels": [
    {
      "cluster_id": "c01",
      "theme": "App crashes during WhatsApp flow setup",
      "clusterType": "complaint",
      "severity": 4,
      "severity_rationale": "Users report the flow setup screen freezing and losing saved work, which blocks the critical onboarding path. Severity stops below critical because restarting the app is a documented workaround that lets users recover.",
      "sample_quotes": [
        { "row_id": "reclame-aqui-000001", "text": "O aplicativo trava toda vez que tento cadastrar meu fluxo do WhatsApp." },
        { "row_id": "google-play-000003", "text": "App crashes every time I try to set up a new WhatsApp flow. Lost my work twice." },
        { "row_id": "g2-000005", "text": "Meu fluxo de WhatsApp travou durante a configuração e perdi tudo que havia criado." }
      ],
      "compositionWarning": false,
      "strategyClaimIds": []
    }
  ],
  "validationErrors": []
}
```

- One object per cluster in `02-clusters.json`. Do not invent clusters; do not skip clusters silently (label incoherent ones `noise-label`).
- `compositionWarning`: set `true` if the quotes you selected do not represent the majority of the cluster (you suspect a mixed cluster). It does not block — it is surfaced in the report for PM review.
- `strategyClaimIds`: leave `[]` unless you are explicitly linking this insight to a strategy claim; the PM normally maintains this mapping.
- Leave `validationErrors` empty — the CLI fills it.

## After writing

Run: `python discovery/cli.py report`

The CLI re-validates every label block. If a block fails (quantitative claim, bad `row_id`, short rationale, wrong cluster), it is excluded from the report and listed under **Dropped Insights** with the reason. Fix the offending block in `03-labels.json` and re-run `report`.
