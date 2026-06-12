# Discovery Agent — Test Cases v1

8 test scenarios exercising the discovery pipeline on a synthetic mini-corpus.  
The corpus (42 rows) is embedded directly in this file as a CSV block.  
Run `python discovery/cli.py init --product test --input <(echo "...")` with the CSV below to exercise any scenario.

**Purpose:** validate that the CLI correctly enforces hard rules across edge cases — not to produce meaningful insights. The corpus is artificial and intentionally contains pathological inputs.

---

## Synthetic Corpus

Copy everything between the `---CSV---` markers into a file (e.g., `discovery/test-corpus.csv`) to use with the CLI.

```
---CSV---
text,source,date,segment,rating
O aplicativo trava toda vez que tento cadastrar meu fluxo do WhatsApp.,reclame-aqui,2026-04-14,smb,2
Já perdi minha configuração três vezes por causa de travamentos no cadastro de fluxo.,reclame-aqui,2026-04-15,smb,1
App crashes every time I try to set up a new WhatsApp flow. Lost my work twice.,google-play,2026-04-16,smb,1
O fluxo trava na tela de templates sem mensagem de erro. Preciso recomeçar do zero.,reclame-aqui,2026-04-17,smb,2
Meu fluxo de WhatsApp travou durante a configuração e perdi tudo que havia criado.,g2,2026-04-18,smb,2
O bot parou de responder após reconectar o WhatsApp. Tive que reconfigurar tudo.,reclame-aqui,2026-04-20,smb,1
Após atualizar o app o bot não responde mais. Clientes reclamando que ninguém atende.,reclame-aqui,2026-04-21,enterprise,1
Bot stopped responding completely after I reconnected my WhatsApp account.,google-play,2026-04-22,smb,1
Depois de reconectar o número o bot ficou mudo. Perdi vendas por isso.,reclame-aqui,2026-04-23,smb,1
O período de teste expirou antes de eu conseguir ativar meu primeiro fluxo. Não tive tempo.,reclame-aqui,2026-05-01,smb,2
Trial acabou no meio da configuração. Fui cobrado sem ter usado o produto.,g2,2026-05-02,smb,2
My trial expired while I was still setting up. I never got to use the product.,capterra,2026-05-03,smb,3
O aplicativo travou durante o trial e não consegui reativar sem pagar.,reclame-aqui,2026-05-04,smb,1
Seria muito bom ter integração com Instagram Direct além do WhatsApp.,g2,2026-05-10,smb,4
Quero integração com Instagram. Sem isso fico limitado a um canal só.,reclame-aqui,2026-05-11,smb,3
Would love Instagram DM integration. WhatsApp only is limiting for my business.,capterra,2026-05-12,enterprise,3
Falta integração com Instagram Direct. Perco clientes que só usam Stories.,g2,2026-05-13,smb,3
A interface de configuração de fluxo é confusa. Não entendi onde colocar as respostas automáticas.,reclame-aqui,2026-05-15,smb,3
Como faço para configurar uma resposta automática? Não encontro a opção no menu.,g2,2026-05-16,smb,3
Não consigo entender como adicionar variáveis ao template. A documentação não ajuda.,capterra,2026-05-17,smb,3
Ótimo produto! Transformou meu atendimento. Recomendo para todos os salões.,google-play,2026-05-20,smb,5
Adorei o aplicativo. Muito fácil de usar e meus clientes adoraram o bot.,google-play,2026-05-21,smb,5
Fantastic app, super easy to set up. My response rate doubled in one week.,capterra,2026-05-22,enterprise,5
Produto incrível. Economizei horas por semana com o atendimento automatizado.,g2,2026-05-23,smb,5
O aplicativo trava toda vez que tento cadastrar meu fluxo do WhatsApp.,reclame-aqui,2026-04-14,smb,2
App crashes every time I try to set up a new WhatsApp flow. Lost my work twice.,google-play,2026-04-16,smb,1
,reclame-aqui,2026-04-25,smb,3
ok,g2,2026-04-26,smb,2
👍,google-play,2026-04-27,smb,4
não,capterra,2026-04-28,smb,1
This app is great but also has problems and sometimes works and sometimes does not and I am not sure what to think about it overall because on one hand the setup was easy but on the other hand the bot keeps crashing and the support never responds and I have been waiting for three weeks and nobody helped me and I lost all my flows and I had to start over multiple times and it is very frustrating,reclame-aqui,2026-04-30,smb,2
Boa noite,g2,2026-05-05,smb,3
Olá equipe suporte tudo bem?,capterra,2026-05-06,smb,3
O aplicativo trava frequentemente mas é muito bom para o meu negócio de salão de beleza.,reclame-aqui,2026-05-08,smb,3
O preço é muito alto para pequenas empresas. Não justifica o custo mensal.,reclame-aqui,2026-05-25,smb,2
The monthly fee is too expensive for a small business like mine.,g2,2026-05-26,smb,2
Para o valor que cobram esperava algo mais completo.,capterra,2026-05-27,smb,2
O suporte demora mais de 48h para responder. Inaceitável para um problema crítico.,reclame-aqui,2026-06-01,enterprise,1
Support takes 3-5 business days to respond. Unacceptable when your bot is down.,capterra,2026-06-02,enterprise,1
Já abri 3 tickets e ninguém me respondeu. Bot parado há uma semana.,reclame-aqui,2026-06-03,smb,1
Atendimento ao cliente inexistente. Problema crítico sem resposta.,g2,2026-06-04,enterprise,1
---CSV---
```

**Corpus breakdown (42 rows):**
- Rows 1–5: App crashes during flow setup (PT-BR + EN mix)
- Rows 6–9: Bot stops after WhatsApp reconnect (PT-BR + EN mix)
- Rows 10–13: Trial expired before first use (PT-BR + EN mix)
- Rows 14–17: Feature request — Instagram DM integration (PT-BR + EN mix)
- Rows 18–20: UX confusion / how-to questions (PT-BR)
- Rows 21–24: Praise cluster (PT-BR + EN mix)
- Rows 25–26: **Exact duplicates** of rows 1 and 3 (same text, same source, same date)
- Rows 27–30: **Garbage inputs** — empty text, "ok", "👍", "não"
- Row 31: **Pathologically long text** — one run-on sentence covering multiple topics
- Rows 32–33: **Greeting inputs** — "Boa noite", "Olá equipe suporte tudo bem?"
- Row 34: **Contradictory review** — same author complains and praises (single row)
- Rows 35–37: Pricing complaint cluster (PT-BR + EN mix)
- Rows 38–41: Slow support response cluster (PT-BR + EN mix)

---

## Test Case 1 — Duplicate Detection

**Scenario:** Rows 25 and 26 are exact copies of rows 1 and 3 (same text, same source, same date).

**Expected d1 behavior:**
- Both rows detected as near-duplicates (`cosine similarity ≥ 0.97`).
- `dropReport.duplicates` = 2.
- Duplicate rows written to `duplicateRows` array in `01-corpus.json`, excluded from clustering.
- `acceptedRows` = 40 (not 42).

**What to verify:**
- `01-corpus.json → dropReport.duplicates` equals 2.
- Neither `reclame-aqui-000025` nor `google-play-000026` appears in `rows`.
- The original `reclame-aqui-000001` and `google-play-000003` are in `rows` — only the later duplicates are dropped.

**Failure mode being exercised:** If deduplication runs on row order rather than content, one of the originals would be dropped instead of the duplicate. Verify by checking which `row_id` is in `rows` vs `duplicateRows`.

---

## Test Case 2 — Garbage Inputs Dropped at d1

**Scenario:** Rows 27–30 are non-informative: empty text, "ok", "👍", "não". Row 32–33 are greetings.

**Expected d1 behavior:**
- Row 27 (empty): dropped as `emptyText`.
- Rows 28–30 ("ok", "👍", "não"): dropped as `tooShort` (< 5 tokens).
- Rows 32–33 ("Boa noite", "Olá equipe suporte tudo bem?"): row 32 = tooShort (2 tokens); row 33 = accepted (7 tokens) but likely noise cluster at d2.
- `dropReport.emptyText` = 1, `dropReport.tooShort` ≥ 3.

**What to verify:**
- None of `row_id`s for rows 27–30 and 32 appear in `01-corpus.json → rows`.
- Row 33 ("Olá equipe suporte tudo bem?") is accepted (7 tokens). At d2, it likely lands in noise or the question cluster. If HDBSCAN puts it in a singleton, it becomes noise (cluster_id `-1`).

**Failure mode being exercised:** CLI failing to drop emoji-only or single-word inputs. Also: CLI incorrectly dropping row 33 (which is short but above threshold).

---

## Test Case 3 — Singleton Cluster → Noise

**Scenario:** Row 31 is a single pathologically long run-on sentence covering crashes, support, and data loss simultaneously. Its embedding is unlikely to be close to any single cluster.

**Expected d2 behavior:**
- Row 31 assigned to noise (`cluster_id: -1`) by HDBSCAN because it is semantically diffuse and the nearest cluster is below density threshold.
- If HDBSCAN does assign it to a cluster (possible — it contains crash vocabulary), the LLM composition check at d3 should flag it as an outlier within that cluster.

**What to verify:**
- Check `02-clusters.json → noiseRowIds` — row 31's `row_id` should appear here.
- If it appears in a cluster, check `03-labels.json` for `compositionWarning: true` on that cluster.

**Failure mode being exercised:** Pathological text dragging an otherwise coherent cluster toward a wrong theme. Also validates that noise is collected in `noiseRowIds` (not silently dropped).

---

## Test Case 4 — Mixed Language Cluster

**Scenario:** The crash cluster (rows 1–5) contains both PT-BR and EN text on the same topic ("flow setup crash"). The bot-silent cluster (rows 6–9) also mixes languages.

**Expected d2 behavior:**
- Both clusters should form (they are semantically cohesive despite language mixing).
- `languageMixRatio` on crash cluster: at least 1 EN row out of 5 → ratio ≥ 0.20. If < 0.30, no warning. If HDBSCAN splits PT-BR and EN into separate clusters, both appear in `02-clusters.json` with small sizes.

**Expected d3 behavior:**
- If clusters are merged: LLM sees mixed-language samples. Theme should be in English (per rubric Part 3). Citations include both PT-BR and EN quotes.
- If clusters are split: two separate themes with near-identical meaning but different language. PM should notice this in the report and consider merging.

**What to verify:**
- `02-clusters.json → clusters[*].languageMixRatio` for crash cluster is recorded.
- `03-labels.json` theme is in English.
- Citations include at least one PT-BR and one EN quote.
- If the cluster is split, both sub-clusters have `size ≥ min_cluster_size` (otherwise they become noise — bad outcome worth noting).

**Failure mode being exercised:** Embedding model failing to bridge PT-BR/EN for semantically identical content. This is a known limitation (DESIGN §10, L3) — the test confirms whether it manifests at this corpus size.

---

## Test Case 5 — Contradictory Review (Single Row)

**Scenario:** Row 34 — "O aplicativo trava frequentemente mas é muito bom para o meu negócio de salão de beleza." One sentence complains (crash) and praises (good for business).

**Expected d2 behavior:**
- Row 34's embedding will be pulled between the crash cluster and the praise cluster. It may land in either, or in noise.
- If it lands in the praise cluster, it is a false positive (complaint text in praise cluster). If in the crash cluster, it is a false negative on the praise signal.

**Expected d3 behavior:**
- If row 34 lands in the crash cluster and is selected as a citation, the LLM may misread it as a weaker complaint (because of the positive qualifier). The severity_rationale should account for this.
- `compositionWarning` on the cluster containing row 34 may be triggered if it skews the composition check.

**What to verify:**
- Which cluster contains row 34's `row_id` in `02-clusters.json`.
- Whether it was selected as a citation in `03-labels.json → sample_quotes`.
- If selected: does the citation render clearly as a complaint or create misleading framing in the report?

**Failure mode being exercised:** Contradictory sentiment within a single text causing misclassification. Documents known limitation: the agent does not perform aspect-level sentiment analysis.

---

## Test Case 6 — Minimum Cluster Size Gate

**Scenario:** The question/UX-confusion cluster (rows 18–20) has only 3 items. With default `min_cluster_size=5`, HDBSCAN should absorb these into noise.

**Expected d2 behavior:**
- With `--min-cluster-size 5`: rows 18–20 end up as noise. `noiseCount` increases by 3.
- With `--min-cluster-size 3`: rows 18–20 form a cluster of size 3.

**What to verify:**
- Run d2 twice: once with `--min-cluster-size 5` (default), once with `--min-cluster-size 3`.
- Confirm that with the default, rows 18–20 appear in `noiseRowIds`.
- Confirm that with `--min-cluster-size 3`, a cluster of size 3 appears in `02-clusters.json`.
- Confirm that the smaller-size run records `hdbscanParams.min_cluster_size: 3` in `02-clusters.json` (reproducibility).

**Failure mode being exercised:** R4 hard rule (clusters smaller than `min_cluster_size` do not appear in the main report). Also: parameter sensitivity documented as a known limitation (DESIGN §10, L2).

---

## Test Case 7 — LLM Quantitative Claim Rejection

**Scenario:** Inject a mock d3-label output where `severity_rationale` contains "about 60% of users in this cluster mention crashes." Verify that the CLI rejects this block.

**How to test:** This scenario requires a mock LLM response — the test cannot be run via the normal pipeline. Instead, manually write a `03-labels.json` with a quantitative claim in `severity_rationale` and run `python discovery/cli.py report` (or a validate sub-command) to verify the schema rejects it.

**Expected CLI behavior:**
- Schema validation step in d3 detects the pattern `\d+%` in `severity_rationale`.
- CLI prints: `d3 quantitative claim in LLM output — frequencies are set by d2, not d3; remove the count from severity_rationale`.
- `03-labels.json` is not written (or is written with `validationErrors` populated and the offending cluster excluded from `04-report.json`).

**What to verify:**
- `03-labels.json → validationErrors` is non-empty.
- The offending cluster does not appear in `04-report.json → insights`.

**Failure mode being exercised:** D3-R5 hard rule enforcement. Critical for maintaining frequency sovereignty (all numbers come from code, not LLM).

---

## Test Case 8 — Citation Integrity Failure

**Scenario:** Manually edit a d3-labels output to include a `sample_quotes` entry with a `row_id` that does not exist in `01-corpus.json` (e.g., `reclame-aqui-999999`). Verify that the CLI catches this.

**How to test:** After a successful d3-label run, edit `03-labels.json` to replace one `row_id` with `reclame-aqui-999999`. Then attempt to run d4-report.

**Expected CLI behavior:**
- d4-report reads `03-labels.json` and resolves all `row_id`s against `01-corpus.json`.
- `reclame-aqui-999999` is not found.
- CLI prints: `citation integrity error: row_id reclame-aqui-999999 not found in corpus — insight c01 will not render`.
- The offending insight block is excluded from `04-report.json`. The report renders without it and notes the dropped insight in a warning section.

**What to verify:**
- `04-report.json → insights` does not contain the cluster with the bad citation.
- A warning section in `04-report.json` (or the rendered `discovery-report.md`) lists the dropped insight and reason.

**Failure mode being exercised:** D4-R4 / D3-R2 hard rules. This is the primary defense against hallucinated citations — the same failure mode the eval agent's transcript hash check defends against.

---

## Notes on Running These Tests

**Recommended order:**
1. Cases 1, 2 — run d1 only, verify `01-corpus.json`.
2. Cases 3, 4, 6 — run d1 + d2, vary `--min-cluster-size`, inspect `02-clusters.json`.
3. Cases 5 — run d1 + d2 + d3, inspect cluster assignment and citation selection.
4. Cases 7, 8 — inject mock outputs, verify CLI validation.

**Not tested here (out of scope for design phase):**
- Performance on large corpora (> 1 000 rows) — clustering runtime and memory.
- Ollama backend correctness — placeholder only until Ollama integration is implemented.
- DOCX rendering — implementation detail.
- VoC delta report (`voc-validate` command) — requires a real strategy run to cross-reference.

---

## Changelog

| Date | Version | Change |
|---|---|---|
| 2026-06-12 | 1.0 | Initial cases — 42-row synthetic corpus; 8 scenarios covering duplicates, garbage, singletons, language mix, contradictory reviews, min-cluster gate, quantitative claim rejection, citation integrity |
