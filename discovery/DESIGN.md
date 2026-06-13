# Discovery Agent — Architecture Design v1

**Shared spine:** AI conclusions without traceability to data are opinions.  
For the Discovery Agent this means: an insight without source quotes is not an insight — it is a characterization. Every cluster label, every severity score, every frequency number must trace to the exact raw rows that produced it.

---

## 1. What this agent does

The Discovery Agent answers one question: *what are users actually complaining about, and how often?*

Target case: **BotConversa + competitors** — raw feedback from Reclame Aqui, G2, Capterra, Google Play, and CS ticket exports. The agent clusters this feedback into pain themes, labels each cluster with a severity and a theme name, and produces a prioritized report where every insight carries:

- **Frequency** — count of items in the cluster (computed by code, never stated by LLM)
- **Severity** — 1–5 scale from the rubric, with rationale
- **Segment** — product, source, date range, user segment
- **Citations** — 3–5 verbatim quotes with `row_id` pointing to the exact source row

An insight without citations does not render. This is the Discovery Claim Ledger: the analogue of `{{claim:id}}` tokens in the strategy agent, enforced at render time by the CLI.

**What this agent is not:** a sentiment classifier, a customer-support triage tool, or a replacement for a UX research study. It is a first-pass signal amplifier — it shows where raw feedback clusters, so that a human (PM) can decide which themes deserve deeper investigation.

---

## 2. Pipeline: 4 steps

Four steps, alternating deterministic CLI and LLM slash-command.

```
d1-ingest        CLI          Validate + normalize input CSV; assign row_ids; write ingested corpus
d2-embed+cluster CLI          Embed locally; run HDBSCAN; write cluster assignments + noise stats
d3-label         LLM + CLI    LLM proposes theme labels + severity per cluster; CLI validates and gates
d4-report        CLI          Aggregate frequencies, deduplicate citations, render prioritized report
```

### Why Python, not Node

Steps d2 and d3 require `sentence-transformers` (multilingual MiniLM-L12-v2 or paraphrase-multilingual-mpnet-base-v2) and `hdbscan`. These are Python-native ML libraries with no Node.js equivalents of comparable quality. Node handles the strategy and eval agents because they are document-processing and API-calling workloads. The discovery agent is a data pipeline with local ML inference — Python is the right tool.

The CLI entry point is `discovery/cli.py`. Commands follow the same ergonomic pattern as the Node CLIs in the monorepo: `python discovery/cli.py init`, `python discovery/cli.py status`, `python discovery/cli.py report`.

### Step boundaries: what is deterministic vs LLM

| Step | Owner | Why |
|---|---|---|
| d1-ingest | CLI | Schema validation, deduplication, row_id assignment — all deterministic. No LLM knows what a CSV looks like until it has been normalized. |
| d2-embed+cluster | CLI | Embedding + clustering is math. Frequencies and cluster sizes are computed here. LLM may not touch these numbers after this step. |
| d3-label | LLM (`/d3-label`) + CLI gate | LLM proposes labels and severities; CLI cross-checks labels against cluster composition and blocks promotion on validation failures (§4). |
| d4-report | CLI | Aggregation, citation selection, ranking, render. No LLM in the report step — numbers are already fixed. |

**Hard rule (inherited from monorepo):** Frequencies, cluster sizes, and percentages are written by d2 (CLI) and are read-only in d3 and d4. LLM output in d3 may not contain quantitative counts. If d3 output includes a statement like "about 40% of users mention X," the CLI rejects the label block with a schema error.

---

## 3. Embedding & Clustering Subsystem

### Embedding model

Default: `paraphrase-multilingual-mpnet-base-v2` (sentence-transformers, ~420 MB, supports PT-BR and EN natively). Falls back to `paraphrase-multilingual-MiniLM-L12-v2` (~120 MB) if the default is not installed. Model name stored in `02-clusters.json` so the report always records which model produced which embeddings.

**Why not OpenAI Ada or Cohere:** Embeddings are computed locally. Feedback text (which may include PII) never leaves the machine. This is not a policy preference — it is a hard architecture constraint (§9).

### Clustering algorithm

HDBSCAN (`min_cluster_size`, `min_samples`, `cluster_selection_epsilon`) — parameters set at `d2-embed+cluster` time and recorded in `02-clusters.json`. HDBSCAN is chosen over k-means because:

1. Number of clusters is unknown in advance; k-means requires k.
2. HDBSCAN natively labels low-density points as noise (label `-1`), making the noise count an explicit output rather than a hidden failure.
3. Works well on non-spherical clusters — typical of user complaint language, which clusters by topic, not vocabulary.

**Parameters stored, not inferred:** The PM sets HDBSCAN parameters at run time (`--min-cluster-size N --min-samples M`). The defaults are `min_cluster_size=5, min_samples=3`. If the corpus has fewer than 50 rows, a warning is printed and `min_cluster_size` is automatically lowered to 3 to avoid collapsing everything into noise. Parameter choices are recorded in `02-clusters.json` and rendered in the appendix of the report.

**Noise handling:** Items labeled noise by HDBSCAN (cluster `-1`) are written to `02-clusters.json` as `cluster_id: "noise"`. They appear in the report appendix under "Unclustered items" with their count. Noise items are excluded from the main insight report. If noise exceeds 30% of the corpus, the CLI prints a warning recommending lower `min_cluster_size`.

---

## 4. Label Validation Mechanism

d3-label is the only step where LLM output enters the pipeline. The CLI applies three validation passes before accepting any label block:

### Pass 1 — Schema check
LLM output must conform to the `d3-labels` schema (see SCHEMAS.md). Required fields: `cluster_id`, `theme`, `severity` (integer 1–5), `severity_rationale`, `sample_quotes` (array, 3–5 items, each with `row_id`). Missing fields → schema error → block.

### Pass 2 — Citation integrity
Every `row_id` in `sample_quotes` must exist in `01-corpus.json`. The CLI looks up each `row_id` and verifies the quoted text matches the stored text (normalized whitespace, case-insensitive). A quote that cannot be traced to a real row → citation integrity error → block.

**Why this matters:** LLM judges occasionally hallucinate quotes — plausible-sounding text that does not appear in the actual input. The citation check catches this deterministically. An insight traced to a hallucinated quote is worse than no insight.

### Pass 3 — Cluster composition check
The LLM is shown a sample of items from the cluster (up to 20). The CLI checks that the proposed `theme` is consistent with at least 60% of the items shown. Consistency is checked by a second, short LLM call ("does this theme describe this text? yes/no") — but the gate is numerical: if fewer than 60% return yes, the theme label is flagged as `"compositionWarning": true` in `02-clusters.json`. The PM sees this flag in the report and may re-run d3-label for that cluster with a revised prompt.

**The gate is a warning, not a block,** because cluster composition check itself uses an LLM and therefore cannot be a hard gate without circular dependency. The hard gate is citation integrity (pass 2). Composition warnings are surfaced prominently in the report.

### Quantitative claims in LLM output

If the d3-label LLM output contains any of the patterns `\d+%`, `\d+ (users|respondents|items|cases)`, or similar quantitative assertions, the CLI rejects the entire label block with: `"d3 quantitative claim in LLM output — frequencies are set by d2, not d3; remove the count from theme or severity_rationale"`. The LLM must describe the theme qualitatively; the CLI computes all counts.

---

## 5. Hard Rules

| # | Rule |
|---|---|
| R1 | Frequencies, cluster sizes, and percentages are written by d2 (code) and are immutable after that step. |
| R2 | Every insight in the report must carry ≥3 source quotes with row_ids that resolve to real rows in the corpus. An insight without quotes does not render. |
| R3 | Severity must include a rationale of ≥20 words. A severity score without rationale is rejected at d3 schema validation. |
| R4 | Clusters smaller than `min_cluster_size` are labeled noise and do not appear in the main report. |
| R5 | LLM output in d3 may not contain quantitative counts or percentages. Schema rejects blocks that do. |
| R6 | Embedding model name and HDBSCAN parameters are stored in `02-clusters.json` and rendered in the report appendix. A report without these parameters is not reproducible. |
| R7 | Feedback text never leaves the local machine (no embedding API calls, no cloud LLM for d2). d3 uses Claude Code (local process) by default; Ollama is the offline fallback. |
| R8 | Input CSV must include a `text` column. All other columns (`source`, `date`, `segment`, `rating`) are optional but, if present, must pass type validation at d1-ingest before the row is accepted. |

---

## 6. Traceability Chain

Every number in the final report traces back to the raw input row:

```
raw CSV row (row_id assigned by d1-ingest)
  → cluster assignment (02-clusters.json, cluster_id ← row_id)
    → theme label + severity (03-labels.json, cluster_id ← LLM + CLI-validated)
      → insight block (04-report.json, cluster_id + frequency + citations)
        → rendered report (discovery-report.md / .docx)
```

### Row ID assignment

`d1-ingest` assigns a stable `row_id` to every input row: `<source_slug>-<zero-padded-line-number>`. Example: `reclame-aqui-000042`. If the input CSV has a column named `id`, that value is used as `row_id` after uniqueness validation. Duplicate `row_id` values cause d1 to fail with a list of collisions.

Row IDs are stable across re-runs on the same input file (deterministic from source + line number). Re-running d1 on the same file produces identical row IDs, which means downstream cluster labels remain comparable across re-runs.

### Citation rendering

In the rendered report, each citation appears as:

```
"A plataforma travou três vezes durante o cadastro."
  — Reclame Aqui · 2026-04-14 · row reclame-aqui-000042
```

If a row_id cannot be resolved at render time (because the corpus was modified after d3 ran), the CLI prints a render error and lists the broken citations. The report does not render with broken citations.

---

## 7. File and State Layout

```
discovery/
  cli.py                     — init, ingest, embed-cluster, label, report, status
  requirements.txt           — sentence-transformers, hdbscan, pandas, numpy, anthropic
  DESIGN.md                  — this file
  SCHEMAS.md                 — step output schemas and hard rules
  RUBRIC-CLUSTERS.md         — label quality criteria + mini-calibration protocol
  CASES-DRAFT.md             — 8–10 synthetic test scenarios with embedded corpus

output/
  <discovery-run-id>/        — e.g. botconversa-discovery-2026-06-12/
    01-corpus.json           — d1 output: normalized rows with row_ids + dedup report
    02-clusters.json         — d2 output: cluster assignments, HDBSCAN params, noise stats
    03-labels.json           — d3 output: LLM-proposed labels + CLI validation results
    04-report.json           — d4 output: insight blocks with frequencies + citations
    discovery-report.md      — rendered from 04-report.json
    discovery-report.docx    — (optional) rendered via python-docx
```

Run IDs follow the monorepo convention: `<product>-discovery-<YYYY-MM-DD>`. Multiple runs on the same date append a sequence suffix: `-2`, `-3`.

### Init command

```
python discovery/cli.py init \
  --product botconversa \
  --input data/reviews.csv \
  --sources "reclame-aqui,g2,capterra,google-play" \
  [--segment enterprise|smb|unknown] \
  [--date-range 2025-01-01:2026-06-12] \
  [--author "Name"]
```

Creates the run directory and writes `run.json` with all init parameters. Does not touch input data. Prints the next command.

### Status command

```
python discovery/cli.py status [--run <run-id>]
```

Prints completed steps (with row counts), next step, and any active warnings (noise %, composition warnings, unresolved citations). Mirrors the pattern of `node strategy/cli.js status` and `node evalagent/cli.js status`.

---

## 8. Cross-Agent Loops

The discovery agent is designed to feed two other agents in the monorepo:

### Loop 1 — Strategy VoC Validation

The strategy agent's step 1 (s1-research) records VoC signals in `vocSignals` and may emit claims like "users complain about X" or "Y is a top pain point." These claims are estimates (`status: "estimate"`) until confirmed by data.

**Bridge:** After d4-report runs, the PM may annotate each insight block with a `strategyClaimId` pointing to a claim in `claims.json`. The discovery CLI then generates a VoC delta report:

```
python discovery/cli.py voc-validate --strategy-run botconversa-2026-06-112123
```

Output: for each linked claim, a deterministic verdict computed by the CLI, with citation count and cluster frequency as evidence. The delta report is a human-readable file (`voc-delta.md`) — the PM uses it to call `node strategy/cli.js confirm <claimId> --value V --source "discovery-run"` on claims the data now supports.

#### Deterministic verdict scale (v1)

The verdict is computed by the CLI from the data — it is **not** an LLM judgment. Only two automatic verdicts exist in v1:

| Verdict | Condition (all must hold) |
|---|---|
| `supported` | (1) a linked insight cluster exists for the claim (`strategyClaimIds` resolves to a cluster in `04-report.json → insights`); AND (2) that cluster's `frequency` ≥ `min_cluster_size` used in the run (the d2 threshold recorded in `02-clusters.json → hdbscanParams.min_cluster_size`); AND (3) the cluster's severity direction matches the claim's direction — for a claim asserting a **pain/problem** the cluster `clusterType` ∈ {`complaint`, `question`, `feature-request`} and `severity ≥ 3`; for a claim asserting a **positive/strength** the cluster `clusterType` = `praise`. |
| `insufficient-evidence` | Any of the above fails: no linked cluster, cluster `frequency < min_cluster_size`, or severity/type direction does not match the claim. This is the default verdict. |

**Numeric thresholds (explicit, v1):**
- Linked cluster required: yes (no link → `insufficient-evidence`).
- Minimum cluster frequency: `frequency ≥ min_cluster_size` (run value from `02-clusters.json`; default 5, auto-lowered to 3 for corpora < 50 rows per §3).
- Severity direction match for pain claims: `severity ≥ 3` AND `clusterType ∈ {complaint, question, feature-request}`.
- Severity direction match for positive claims: `clusterType = praise`.

**`contradicts` is not an automatic verdict.** The CLI never emits `contradicts`. When the PM reads `voc-delta.md` and judges that the discovery data actively refutes a claim (e.g., a claim says "users love onboarding" but the only matching cluster is a `complaint` about onboarding at `severity 4`), the PM records a **manual** `contradicts` verdict directly in `voc-delta.md`, with a written justification under the claim's entry. This is a semantic judgment that requires reading the quotes — the CLI surfaces the evidence (cluster type, severity, citations) but does not decide refutation. `voc-delta.md` therefore has a per-claim "PM verdict" line that the human fills in, distinct from the CLI's automatic `supported` / `insufficient-evidence` line.

**Schema contract:** `04-report.json` insight blocks have an optional `strategyClaimIds: ["claim-id-1"]` field. The CLI populates this from a mapping file (`claim-map.json`) that the PM maintains manually. The mapping file is not generated automatically — claim correspondence is a semantic judgment.

**What this prevents:** Strategy claims about user pain staying as estimates forever. With the bridge, VoC estimates graduate to `confirmed` or `contradicted` based on actual feedback data, triggering the strategy agent's delta report mechanism.

### Loop 2 — Eval Complaint Mining

Complaint clusters (severity ≥ 3, `clusterType: "complaint"`) can be exported as candidate eval cases for the eval agent:

```
python discovery/cli.py export-eval-cases \
  --min-severity 3 \
  --output evalagent/cases-from-discovery.json
```

Output format matches the eval agent's `cases.json` schema. Each exported case:
- `id`: `disc-<cluster_id>-case-01` (auto-generated)
- `title`: cluster theme
- `description`: top 3 citations from the cluster
- `category`: inferred from `clusterType` (complaint → edge-case or adversarial; question → happy-path)
- `source`: `"complaint-mined"` (matching the eval agent's `segment.source` field)
- `calibrationStatus`: `"unvalidated"` — must be calibrated before inclusion in a scored eval run

The PM reviews exported cases, edits as needed, and appends to the eval case set. The discovery agent does not write directly to the eval agent's intake — export is a hand-off, not an automated feed.

---

## 9. Privacy Modes

| Mode | Embedding | Labeling | When to use |
|---|---|---|---|
| `local` (default) | sentence-transformers (local process) | Claude Code (local subprocess via Anthropic CLI) | Default. Feedback never leaves the machine. |
| `ollama` | sentence-transformers (local process) | Ollama (`llama3` or configured model) | Full air-gap: no network calls at any step. Requires Ollama running locally. |

**What "Claude Code" means here:** d3-label calls the Claude API via the Anthropic SDK (the same API that Claude Code uses), which does make network calls. The "local" designation refers to the embedding step only. If true air-gap is required, use `ollama` mode for d3.

**PII handling:** d1-ingest has an optional `--redact` flag that runs a regex pass over text before writing `01-corpus.json`. Patterns redacted: email addresses, Brazilian CPF/CNPJ patterns, phone numbers. The original input file is never modified. Redaction is best-effort — it does not guarantee PII removal. For regulated environments, PII removal must be done by the data provider before handing the CSV to this agent.

---

## 10. Honest Limitations

### L1 — Short-text clustering quality degrades rapidly

User reviews, NPS verbatims, and CS ticket titles are often 5–20 words. HDBSCAN on short text embeddings produces high noise rates and semantically shallow clusters. The agent performs best on texts ≥ 30 words. Below 30 words, cluster stability (reproducibility across random seeds) drops significantly. The report appendix always shows the median text length in the corpus.

### L2 — HDBSCAN parameter sensitivity

`min_cluster_size` and `min_samples` have large effects on the number of clusters and the noise rate. There is no "correct" setting — it depends on corpus size and desired cluster granularity. A corpus of 500 reviews with `min_cluster_size=20` may produce 5 clusters; with `min_cluster_size=5` it may produce 40. The PM must inspect the cluster count and noise rate in the status output and re-run d2 with adjusted parameters if the result is not useful. No automated parameter search is included — that would be premature optimization for a first-pass tool.

### L3 — Language mixing degrades cluster coherence

PT-BR and EN text are embedded in the same multilingual space, but semantic proximity is imperfect across languages. "O app trava" (PT-BR) and "The app crashes" (EN) will cluster together most of the time, but boundary cases (mixed Portunhol, product-specific jargon) may split or merge incorrectly. The report flags clusters with high language mixing (`languageMixRatio > 0.3`) as potentially unreliable.

### L4 — Selection bias in review sources

Reclame Aqui, G2, and Google Play attract users who are motivated to complain (or to praise, for G2). The distribution of themes in this corpus is not the distribution of themes in the user population. Users who had no strong reaction — the majority — are invisible. Frequency numbers in the report answer "how common is this complaint among people who wrote a review," not "how common is this problem among all users." The report renders this caveat in the executive summary.

### L5 — Label quality depends on cluster representativeness

d3-label shows the LLM a sample of up to 20 items per cluster. If the cluster has 200 items and the sample is not representative, the label may describe a minority sub-theme. The composition check (§4, Pass 3) catches gross mismatches, but a label can pass the 60% threshold while still missing the dominant sub-theme. Manual spot-checks of large clusters (> 50 items) are recommended before publishing the report.

---

## 11. What the Discovery Agent Does NOT Do

- It does not scrape Reclame Aqui, G2, Capterra, or Google Play. Data collection is outside the agent; the PM provides the CSV.
- It does not classify sentiment. Clusters are thematic, not positive/negative. A cluster may contain both "love the onboarding" and "hate the onboarding" if they share vocabulary — the composition warning catches this.
- It does not produce a RICE or ICE score. The report ranks by `frequency × severity` as a heuristic. Reach and confidence (the R and C in RICE) require business context the agent does not have.
- It does not update `claims.json` automatically. The VoC validation loop produces a delta report; the PM calls `confirm` manually.
- It does not make web requests. All network calls (if any) are limited to the d3 LLM backend.
- It does not store embeddings persistently across runs. Each d2 run recomputes embeddings from scratch. If the corpus has not changed, re-running d2 will produce the same clusters (HDBSCAN is deterministic given fixed parameters and fixed embeddings from the same model).

---

## 12. Relationship to Other Agents

| Strategy concept | Discovery equivalent |
|---|---|
| Claim Ledger (`claims.json`) | Insight Ledger (`04-report.json` insight blocks with mandatory citations) |
| `{{claim:id}}` token | `row_id` reference in citation |
| `dependsOnClaims` gate | Citation integrity gate (render blocked without valid row_ids) |
| `status: "estimate"` | `calibrationStatus: "unvalidated"` on exported eval cases |
| `node strategy/cli.js confirm` | `python discovery/cli.py voc-validate` + manual `confirm` call |
| `node strategy/cli.js status` | `python discovery/cli.py status` |

The Eval Agent and Discovery Agent are parallel, not sequential: eval runs on simulated transcripts before the product exists; discovery runs on real user feedback after (or during) product operation. Their connection is the complaint-mining export (§8, Loop 2), which converts discovery cluster themes into new eval cases, closing the loop between user feedback and quality testing.

```
Strategy Agent  ──→  Eval Agent  ──→  (deployed product)  ──→  Discovery Agent
     ↑                                                               │
     └───────────────── VoC validation / confirm loop ──────────────┘
```

---

## Changelog

| Date | Version | Change |
|---|---|---|
| 2026-06-12 | 1.0 | Initial design — 4-step pipeline; Python CLI; local embeddings; cross-agent loops; privacy modes; honest limitations |
| 2026-06-13 | 1.1 | §8 Loop 1: voc-validate verdict made deterministic — v1 scale `supported` / `insufficient-evidence` with explicit numeric thresholds; `contradicts` removed from automatic verdicts and moved to a manual PM verdict in `voc-delta.md` |
