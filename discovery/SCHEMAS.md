# Discovery Agent — Schemas v1

Step output schemas, input contracts, and hard validation rules.  
Every rule here is enforced by the CLI (`discovery/cli.py`) — it is not advisory.

---

## Input: CSV Contract

### Required columns

| Column | Type | Notes |
|---|---|---|
| `text` | string | The feedback text. Must be non-empty after stripping whitespace. Max 10 000 chars — longer rows are truncated at d1 with a warning. |

### Optional columns

| Column | Type | Validation |
|---|---|---|
| `source` | string | Allowed values: `reclame-aqui`, `g2`, `capterra`, `google-play`, `cs-ticket`, `nps`, `other`. Unknown values pass through but are tagged `"sourceUnknown": true` in `01-corpus.json`. |
| `date` | string | ISO 8601: `YYYY-MM-DD`. Rows with unparseable dates are kept but `date` is set to `null` with a warning. |
| `segment` | string | Free text, max 64 chars. Used for per-segment breakdowns in the report. |
| `rating` | number | 1–5 (or 1–10, detected automatically by range). Stored as-is; not used in clustering. Included in citation rendering. |

### d1 validation rules

- **D1-R1:** Rows with empty `text` after stripping are dropped with a count in `01-corpus.json → dropReport`.
- **D1-R2:** Near-duplicate detection: rows with cosine similarity ≥ 0.97 to a previous row are flagged as `"duplicate": true` and excluded from clustering (but kept in `01-corpus.json` for the record). Similarity is computed using a lightweight TF-IDF hash at d1 (no embeddings needed). Deduplication count is reported in `status`.
- **D1-R3:** Row IDs are assigned as `<source_slug>-<zero-padded-6-digit-line-number>`. If the input has a column named `id`, its value is used after uniqueness validation. Collisions cause d1 to fail with a list of duplicate IDs.
- **D1-R4:** Rows shorter than 5 tokens (whitespace-split) are dropped as non-informative. Count reported in `dropReport`.

---

## d1 Output: `01-corpus.json`

```json
{
  "runId": "botconversa-discovery-2026-06-12",
  "inputFile": "data/reviews.csv",
  "ingestedAt": "2026-06-12T10:00:00Z",
  "totalInputRows": 412,
  "acceptedRows": 387,
  "dropReport": {
    "emptyText": 3,
    "tooShort": 8,
    "duplicates": 14
  },
  "rows": [
    {
      "row_id": "reclame-aqui-000001",
      "text": "O aplicativo trava toda vez que tento cadastrar meu fluxo do WhatsApp.",
      "source": "reclame-aqui",
      "date": "2026-04-14",
      "segment": "smb",
      "rating": 2,
      "duplicate": false
    }
  ]
}
```

### Hard rules

- `rows` contains only accepted rows (duplicates excluded). Duplicates are in a separate `duplicateRows` array.
- `row_id` is unique and stable. Re-running d1 on the same file produces the same IDs.
- `text` in `rows` is the original text (not truncated in the JSON, even if embedding was done on truncated text — truncation is an embedding-step concern).

---

## d2 Output: `02-clusters.json`

```json
{
  "runId": "botconversa-discovery-2026-06-12",
  "clusteredAt": "2026-06-12T10:05:00Z",
  "embeddingModel": "paraphrase-multilingual-mpnet-base-v2",
  "hdbscanParams": {
    "min_cluster_size": 5,
    "min_samples": 3,
    "cluster_selection_epsilon": 0.0
  },
  "clusterCount": 12,
  "noiseCount": 31,
  "noiseRatio": 0.080,
  "noiseWarning": false,
  "medianTextLengthTokens": 28,
  "clusters": [
    {
      "cluster_id": "c01",
      "size": 47,
      "centroidRowId": "reclame-aqui-000042",
      "languageMixRatio": 0.06,
      "rowIds": ["reclame-aqui-000001", "reclame-aqui-000042", "..."]
    }
  ],
  "noiseRowIds": ["g2-000017", "capterra-000203"]
}
```

### Hard rules

- **D2-R1:** `size` for every cluster is the exact count of `rowIds` in that cluster. No rounding. No LLM may write to this field.
- **D2-R2:** `noiseWarning: true` is set automatically when `noiseRatio > 0.30`. CLI prints a warning recommending lower `min_cluster_size`.
- **D2-R3:** `embeddingModel` and `hdbscanParams` are mandatory. A `02-clusters.json` without these fields is invalid and blocks d3.
- **D2-R4:** `rowIds` must be a subset of `01-corpus.json → rows[*].row_id`. Any `row_id` not found in the corpus causes d2 to fail.
- **D2-R5:** Clusters with `size < min_cluster_size` do not exist in the output — HDBSCAN absorbs them into noise. If the CLI detects a cluster below `min_cluster_size` (e.g., due to a manual edit), it fails schema validation.
- **D2-R6:** `languageMixRatio` is computed as: fraction of rows in the cluster whose detected primary language differs from the cluster majority language. Detection uses `langdetect` library. Clusters with `languageMixRatio > 0.30` are flagged in d4 report as potentially unreliable.

---

## d3 Output: `03-labels.json`

```json
{
  "runId": "botconversa-discovery-2026-06-12",
  "labeledAt": "2026-06-12T10:15:00Z",
  "labelBackend": "claude-code",
  "labelModel": "claude-sonnet-4-6",
  "labels": [
    {
      "cluster_id": "c01",
      "theme": "App crashes during WhatsApp flow setup",
      "clusterType": "complaint",
      "severity": 4,
      "severity_rationale": "Users report complete workflow failure (not cosmetic). Multiple mentions of data loss. Affects the critical onboarding path. Stops at severity 4 because workaround exists (retry after restart).",
      "sample_quotes": [
        {
          "row_id": "reclame-aqui-000001",
          "text": "O aplicativo trava toda vez que tento cadastrar meu fluxo do WhatsApp."
        },
        {
          "row_id": "reclame-aqui-000042",
          "text": "Já perdi minha configuração três vezes por causa de travamentos."
        },
        {
          "row_id": "g2-000089",
          "text": "Every time I try to set up a new flow the app freezes. Very frustrating."
        }
      ],
      "compositionWarning": false,
      "compositionCheckScore": 0.83,
      "strategyClaimIds": []
    }
  ],
  "validationErrors": [],
  "compositionWarningCount": 0
}
```

### Hard rules

- **D3-R1:** `cluster_id` must match a cluster in `02-clusters.json`. Labels for non-existent clusters cause d3 schema validation to fail.
- **D3-R2:** Every `row_id` in `sample_quotes` must exist in `01-corpus.json`. The CLI looks up each row and verifies the quoted `text` matches the stored `text` (normalized whitespace, case-insensitive substring match). Citation integrity failure is a hard block.
- **D3-R3:** `sample_quotes` must contain 3–5 items. Fewer than 3 = insufficient evidence (block). More than 5 = rejected (use the best 5, do not pad).
- **D3-R4:** `severity` must be an integer 1–5. `severity_rationale` must be ≥20 words. A severity without rationale is rejected.
- **D3-R5:** LLM output may not contain quantitative counts or percentages. Patterns `\d+%`, `\d+ (users|respondents|items|cases|reviews)` in `theme` or `severity_rationale` cause the label block to be rejected with: `"d3 quantitative claim in LLM output — frequencies are set by d2, not d3"`.
- **D3-R6:** `clusterType` must be one of: `complaint`, `question`, `praise`, `feature-request`, `noise-label`. `noise-label` is reserved for clusters the LLM considers semantically incoherent despite passing HDBSCAN's density threshold.
- **D3-R7:** `compositionWarning: true` does not block the step. It is propagated to d4-report and rendered as a callout box in the insight section.

### What the LLM sees in d3-label

The d3 prompt provides:
1. The cluster ID and size (from `02-clusters.json`) — size is provided as context, not to be repeated in output.
2. A sample of up to 20 rows from the cluster (random sample if > 20, seed fixed to cluster_id hash for reproducibility).
3. The rubric from `RUBRIC-CLUSTERS.md` — severity anchors + clusterType definitions.
4. The schema above — explicit instructions that quantitative counts are forbidden in output.

The LLM does not see other clusters or the corpus-level statistics. Each cluster is labeled independently to prevent cross-cluster anchoring bias.

---

## d4 Output: `04-report.json`

```json
{
  "runId": "botconversa-discovery-2026-06-12",
  "reportedAt": "2026-06-12T10:20:00Z",
  "corpusSummary": {
    "totalAcceptedRows": 387,
    "clusterCount": 12,
    "noiseCount": 31,
    "noiseRatio": 0.080,
    "dateRange": { "from": "2025-01-01", "to": "2026-06-12" },
    "sources": { "reclame-aqui": 180, "g2": 120, "capterra": 87 }
  },
  "insights": [
    {
      "rank": 1,
      "cluster_id": "c01",
      "theme": "App crashes during WhatsApp flow setup",
      "clusterType": "complaint",
      "frequency": 47,
      "frequencyPct": 12.1,
      "severity": 4,
      "severity_rationale": "...",
      "priorityScore": 47.9,
      "compositionWarning": false,
      "languageMixWarning": false,
      "strategyClaimIds": [],
      "citations": [
        {
          "row_id": "reclame-aqui-000001",
          "text": "O aplicativo trava toda vez que tento cadastrar meu fluxo do WhatsApp.",
          "source": "reclame-aqui",
          "date": "2026-04-14",
          "rating": 2
        }
      ]
    }
  ],
  "noiseItems": {
    "count": 31,
    "rowIds": ["g2-000017"]
  },
  "compositionWarnings": [],
  "caveat": "Frequencies reflect complaint distribution among users who wrote a public review, not the full user population."
}
```

### Hard rules

- **D4-R1:** `frequency` is copied verbatim from `02-clusters.json → clusters[cluster_id].size`. CLI validates equality; any divergence is a pipeline integrity error.
- **D4-R2:** `frequencyPct` = `frequency / totalAcceptedRows × 100`. Computed by CLI. Rounded to 1 decimal place.
- **D4-R3:** `priorityScore` = `frequency × severity`. Used for ranking only. Not a substitute for RICE. Rendered in the report as a sort key with an explicit label: "Frequency × Severity (heuristic — not RICE)."
- **D4-R4:** `citations` in d4 must be a subset of `sample_quotes` from d3. The CLI resolves each `row_id` to the full row (adding `source`, `date`, `rating` from `01-corpus.json`). If a `row_id` no longer resolves, the report does not render.
- **D4-R5:** Insights without `citations` do not appear in the rendered report. An insight block with `citations: []` causes a render error.
- **D4-R6:** `caveat` is a mandatory field in `04-report.json`. It renders as a disclaimer in the executive summary of the markdown report.
- **D4-R7:** The `corpusSummary.sources` breakdown is a count of accepted rows per source value — computed by CLI from `01-corpus.json`.

---

## Schema Versioning

Each output file carries `"schemaVersion": "1.0"`. Breaking schema changes (field renames, type changes, new required fields) increment the minor version. The CLI prints a warning when reading files with a different schema version than the current code. Non-breaking additions (new optional fields) do not require a version bump.

---

## Changelog

| Date | Version | Change |
|---|---|---|
| 2026-06-12 | 1.0 | Initial schemas — d1–d4 output contracts; input CSV contract; 18 hard rules |
