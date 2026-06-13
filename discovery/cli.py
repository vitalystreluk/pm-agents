#!/usr/bin/env python3
# discovery/cli.py — deterministic backbone of the discovery agent.
# The LLM does exactly one step (/d3-label, via .claude/commands/); this CLI does
# everything that must NOT be left to an LLM: ingest + validation, embedding +
# clustering, frequency/size/percentage computation, label-schema gating, and render.
#
# Hard rule (DESIGN §2): frequencies, cluster sizes and percentages are written by
# d2 (this CLI) and are read-only in d3/d4. LLM output in d3 may not contain counts.
#
# Commands:
#   init --product P --input F [--sources s1,s2] [--segment S] [--date-range A:B] [--author N]
#                                       → create run, run d1-ingest, write 01-corpus.json
#   status [--run R]                    → validate d1–d4; show next action + warnings + silhouette
#   cluster [--run R] [--min-cluster-size N] [--min-samples M]
#                                       → d2: embed + HDBSCAN (+k-means fallback); write 02-clusters.json
#   report [--run R]                    → d4: validate 03-labels (3 passes), aggregate, render report
#   voc-validate --strategy-run S [--run R]
#                                       → Loop 1: deterministic supported/insufficient-evidence → voc-delta.md
#   export-eval-cases --min-severity N --output F [--run R]
#                                       → Loop 2: export complaint clusters as eval cases
#   demo                                → full d1→d4 on fixtures/corpus.csv with baked d3 labels (no LLM)

import os
os.environ.setdefault("USE_TF", "0")  # keep transformers from importing TensorFlow
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import sys
import re
import json
import math
import shutil
import datetime

DISCOVERY_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(DISCOVERY_DIR)
OUT = os.path.join(ROOT, "output")
FIXTURES_CORPUS = os.path.join(DISCOVERY_DIR, "fixtures", "corpus.csv")

ALLOWED_SOURCES = {"reclame-aqui", "g2", "capterra", "google-play", "cs-ticket", "nps", "other"}
ALLOWED_CLUSTER_TYPES = {"complaint", "question", "praise", "feature-request", "noise-label"}
EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
SCHEMA_VERSION = "1.0"

# Quantitative-claim patterns (DESIGN §4 / SCHEMAS D3-R5) — LLM output may not contain counts.
QUANT_PATTERNS = [
    re.compile(r"\d+\s*%"),
    re.compile(r"\d+\s+(users|respondents|items|cases|reviews)", re.IGNORECASE),
]


# ---------- small utils ----------

def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify(s, maxlen=30):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:maxlen]


def parse_args(argv):
    args = {"_": []}
    i = 0
    while i < len(argv):
        if argv[i].startswith("--"):
            key = argv[i][2:]
            val = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("--") else True
            args[key] = val
            i += 2 if val is not True else 1
        else:
            args["_"].append(argv[i])
            i += 1
    return args


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def rel(path):
    return os.path.relpath(path, ROOT)


# ---------- run resolution ----------

def latest_discovery_run():
    if not os.path.isdir(OUT):
        return None
    dirs = [d for d in os.listdir(OUT)
            if "-discovery-" in d and os.path.isdir(os.path.join(OUT, d))]
    if not dirs:
        return None
    dirs.sort(key=lambda d: os.path.getmtime(os.path.join(OUT, d)))
    return os.path.join(OUT, dirs[-1])


def resolve_run(args):
    named = args.get("run")
    if named is True or not named:
        named = None
    run = os.path.join(OUT, named) if named else latest_discovery_run()
    if named and not os.path.isdir(run):
        die(f'run "{named}" not found in output/')
    if not run or not os.path.isdir(run):
        die("no discovery run found. start with: python discovery/cli.py init --product P --input F (or: demo)")
    return run


def new_run_dir(product):
    slug = slugify(product) or "run"
    ts = datetime.date.today().isoformat()
    base = f"{slug}-discovery-{ts}"
    run = os.path.join(OUT, base)
    n = 2
    while os.path.exists(run):
        run = os.path.join(OUT, f"{base}-{n}")
        n += 1
    os.makedirs(run, exist_ok=True)
    return run


# ---------- language heuristic (no langdetect dependency) ----------
# DESIGN §10/L3 needs languageMixRatio. langdetect is not installed in this env,
# so we use a lightweight PT-vs-EN heuristic: Portuguese diacritics + stopword
# overlap. Good enough for the mix ratio; documented as best-effort.

_PT_HINT = re.compile(r"[ãõçáàâéêíóôúÃÕÇÁÀÂÉÊÍÓÔÚ]")
_PT_WORDS = {"não", "está", "são", "você", "muito", "já", "após", "com", "para", "que",
             "meu", "minha", "tudo", "isso", "sem", "mais", "bom", "aplicativo", "fluxo",
             "suporte", "preço", "produto", "equipe", "tela", "erro", "vez", "vezes",
             "trava", "perdi", "configuração", "responde", "ninguém", "ótimo", "adorei"}
_EN_WORDS = {"the", "app", "crashes", "every", "time", "try", "set", "up", "work", "twice",
             "bot", "stopped", "responding", "trial", "expired", "while", "was", "still",
             "setting", "would", "love", "integration", "only", "limiting", "business",
             "fantastic", "super", "easy", "response", "rate", "doubled", "week", "monthly",
             "fee", "too", "expensive", "small", "mine", "support", "takes", "days",
             "respond", "unacceptable", "when", "your", "down", "great", "and", "of"}


def detect_lang(text):
    if _PT_HINT.search(text):
        return "pt"
    words = set(re.findall(r"[a-zà-ÿ]+", text.lower()))
    pt = len(words & _PT_WORDS)
    en = len(words & _EN_WORDS)
    return "en" if en > pt else "pt"


# ============================================================
# d1 — ingest (part of init)
# ============================================================

def ingest(input_file, run_id, sources_hint=None):
    """Validate + normalize CSV, assign stable row_ids, dedup. Returns 01-corpus dict."""
    import pandas as pd

    if not os.path.isfile(input_file):
        die(f"input file not found: {input_file}")

    df = pd.read_csv(input_file, dtype=str, keep_default_na=False)
    if "text" not in df.columns:
        die("input CSV must include a 'text' column (R8)")

    has_id = "id" in df.columns
    total_input = len(df)
    drop_report = {"emptyText": 0, "tooShort": 0, "duplicates": 0}
    warnings = []

    candidates = []   # rows that pass empty/short checks; dedup runs over these
    seen_ids = {}

    for idx, row in df.iterrows():
        line_no = idx + 1  # 1-based data row index (global, across sources)
        text = (row.get("text") or "").strip()
        source_raw = (row.get("source") or "").strip()
        source = source_raw if source_raw else "other"
        source_unknown = source not in ALLOWED_SOURCES
        slug = slugify(source) or "other"

        if has_id and (row.get("id") or "").strip():
            row_id = (row.get("id") or "").strip()
        else:
            row_id = f"{slug}-{line_no:06d}"

        if row_id in seen_ids:
            die(f"duplicate row_id collision: {row_id} (lines {seen_ids[row_id]} and {line_no})")
        seen_ids[row_id] = line_no

        if text == "":
            drop_report["emptyText"] += 1
            continue
        if len(text.split()) < 5:
            drop_report["tooShort"] += 1
            continue

        # date validation
        date_raw = (row.get("date") or "").strip()
        date_val = None
        if date_raw:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_raw):
                try:
                    datetime.date.fromisoformat(date_raw)
                    date_val = date_raw
                except ValueError:
                    warnings.append(f"{row_id}: unparseable date '{date_raw}' set to null")
            else:
                warnings.append(f"{row_id}: unparseable date '{date_raw}' set to null")

        # rating validation
        rating_raw = (row.get("rating") or "").strip()
        rating_val = None
        if rating_raw:
            try:
                rating_val = float(rating_raw)
                rating_val = int(rating_val) if rating_val.is_integer() else rating_val
            except ValueError:
                warnings.append(f"{row_id}: non-numeric rating '{rating_raw}' dropped")

        seg = (row.get("segment") or "").strip()[:64] or None

        candidates.append({
            "row_id": row_id,
            "text": text,
            "source": source,
            "sourceUnknown": source_unknown,
            "date": date_val,
            "segment": seg,
            "rating": rating_val,
            "duplicate": False,
        })

    # near-duplicate detection (D1-R2): TF-IDF cosine >= 0.97 vs any earlier row
    duplicate_rows = []
    accepted = []
    if candidates:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        texts = [c["text"] for c in candidates]
        try:
            tfidf = TfidfVectorizer().fit_transform(texts)
            sim = cosine_similarity(tfidf)
        except ValueError:
            sim = None
        for j, c in enumerate(candidates):
            is_dup = False
            if sim is not None:
                for k in range(j):
                    if not candidates[k]["duplicate"] and sim[j, k] >= 0.97:
                        is_dup = True
                        break
            if is_dup:
                c["duplicate"] = True
                drop_report["duplicates"] += 1
                duplicate_rows.append(c)
            else:
                accepted.append(c)

    corpus = {
        "schemaVersion": SCHEMA_VERSION,
        "runId": run_id,
        "inputFile": rel(os.path.abspath(input_file)) if os.path.isabs(input_file) else input_file,
        "ingestedAt": now_iso(),
        "totalInputRows": total_input,
        "acceptedRows": len(accepted),
        "dropReport": drop_report,
        "warnings": warnings,
        "rows": accepted,
        "duplicateRows": duplicate_rows,
    }
    return corpus


# ============================================================
# d2 — embed + cluster
# ============================================================

def embed_texts(texts):
    from sentence_transformers import SentenceTransformer
    import numpy as np
    model = SentenceTransformer(EMBEDDING_MODEL)
    emb = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return np.asarray(emb, dtype="float64")


def cluster_run(run, min_cluster_size=None, min_samples=None):
    import numpy as np
    corpus_path = os.path.join(run, "01-corpus.json")
    if not os.path.isfile(corpus_path):
        die("01-corpus.json not found — run init first")
    corpus = read_json(corpus_path)
    rows = corpus["rows"]
    n = len(rows)
    if n < 2:
        die(f"need at least 2 accepted rows to cluster, have {n}")

    # parameter defaults + small-corpus auto-lowering (DESIGN §3).
    # On corpora < 50 rows HDBSCAN with min_samples=3 collapses most points into
    # noise; we lower min_cluster_size to 3 and min_samples to 1 so coherent small
    # themes survive. Explicit --min-cluster-size/--min-samples override this.
    mcs = int(min_cluster_size) if min_cluster_size else 5
    auto_lowered = False
    if not min_cluster_size and n < 50 and mcs > 3:
        mcs = 3
        auto_lowered = True
    if min_samples:
        ms = int(min_samples)
    elif auto_lowered:
        ms = 1
    else:
        ms = min(3, mcs)

    texts = [r["text"] for r in rows]
    emb = embed_texts(texts)

    import hdbscan
    from sklearn.metrics import silhouette_score

    clusterer = hdbscan.HDBSCAN(min_cluster_size=mcs, min_samples=ms,
                                cluster_selection_epsilon=0.0, metric="euclidean")
    labels = clusterer.fit_predict(emb)
    method = "hdbscan"

    # k-means fallback if HDBSCAN collapses everything into noise (DESIGN §3 robustness)
    n_clusters = len(set(int(l) for l in labels if l != -1))
    if n_clusters == 0:
        from sklearn.cluster import KMeans
        k = max(2, min(8, n // 5))
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(emb)
        method = "kmeans-fallback"
        # enforce min_cluster_size: absorb sub-threshold k-means clusters into noise (D2-R5)
        from collections import Counter
        sizes = Counter(int(l) for l in labels)
        labels = np.array([l if sizes[int(l)] >= mcs else -1 for l in labels])

    # build cluster groups, sorted by size desc → stable c01, c02 ids
    from collections import defaultdict
    groups = defaultdict(list)
    for i, l in enumerate(labels):
        groups[int(l)].append(i)
    noise_idx = groups.pop(-1, [])
    ordered = sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))

    clusters = []
    for ci, (_, idxs) in enumerate(ordered, start=1):
        cid = f"c{ci:02d}"
        sub = emb[idxs]
        centroid = sub.mean(axis=0)
        # centroid row = nearest member to centroid
        dists = np.linalg.norm(sub - centroid, axis=1)
        centroid_row = rows[idxs[int(np.argmin(dists))]]["row_id"]
        langs = [detect_lang(rows[i]["text"]) for i in idxs]
        majority = max(set(langs), key=langs.count)
        mix_ratio = round(sum(1 for l in langs if l != majority) / len(langs), 3)
        clusters.append({
            "cluster_id": cid,
            "size": len(idxs),
            "centroidRowId": centroid_row,
            "languageMixRatio": mix_ratio,
            "rowIds": [rows[i]["row_id"] for i in idxs],
        })

    noise_row_ids = [rows[i]["row_id"] for i in noise_idx]
    noise_count = len(noise_row_ids)
    noise_ratio = round(noise_count / n, 3)

    # silhouette over non-noise points (needs >=2 clusters)
    silhouette = None
    non_noise = [i for i, l in enumerate(labels) if l != -1]
    non_noise_labels = [int(labels[i]) for i in non_noise]
    if len(set(non_noise_labels)) >= 2 and len(non_noise) > len(set(non_noise_labels)):
        silhouette = round(float(silhouette_score(emb[non_noise], non_noise_labels)), 3)

    median_tokens = int(np.median([len(t.split()) for t in texts])) if texts else 0

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "runId": corpus["runId"],
        "clusteredAt": now_iso(),
        "embeddingModel": EMBEDDING_MODEL,
        "clusteringMethod": method,
        "hdbscanParams": {
            "min_cluster_size": mcs,
            "min_samples": ms,
            "cluster_selection_epsilon": 0.0,
            "autoLoweredForSmallCorpus": auto_lowered,
        },
        "silhouette": silhouette,
        "clusterCount": len(clusters),
        "noiseCount": noise_count,
        "noiseRatio": noise_ratio,
        "noiseWarning": noise_ratio > 0.30,
        "medianTextLengthTokens": median_tokens,
        "clusters": clusters,
        "noiseRowIds": noise_row_ids,
    }
    return out


# ============================================================
# d3 label validation (enforced at report time)
# ============================================================

def normalize_ws(s):
    return re.sub(r"\s+", " ", s).strip().lower()


def validate_labels(labels_obj, clusters, corpus_rows):
    """Run the three validation passes on 03-labels. Returns (valid_labels, errors)."""
    cluster_ids = {c["cluster_id"] for c in clusters}
    row_text = {r["row_id"]: r["text"] for r in corpus_rows}
    valid = []
    errors = []

    for lab in labels_obj.get("labels", []):
        cid = lab.get("cluster_id", "<missing>")

        # D3-R1: cluster must exist
        if cid not in cluster_ids:
            errors.append({"cluster_id": cid, "error": f"cluster_id {cid} not found in 02-clusters.json"})
            continue

        # Pass 1 — schema
        schema_errs = []
        theme = lab.get("theme", "")
        if not theme or not isinstance(theme, str):
            schema_errs.append("missing theme")
        ct = lab.get("clusterType")
        if ct not in ALLOWED_CLUSTER_TYPES:
            schema_errs.append(f"clusterType '{ct}' not in {sorted(ALLOWED_CLUSTER_TYPES)}")
        sev = lab.get("severity")
        if not isinstance(sev, int) or not (1 <= sev <= 5):
            schema_errs.append("severity must be integer 1-5")
        rationale = lab.get("severity_rationale", "") or ""
        if len(rationale.split()) < 20:
            schema_errs.append("severity_rationale must be >= 20 words (R3)")
        quotes = lab.get("sample_quotes", [])
        if not (3 <= len(quotes) <= 5):
            schema_errs.append("sample_quotes must contain 3-5 items (D3-R3)")
        if schema_errs:
            errors.append({"cluster_id": cid, "error": "; ".join(schema_errs)})
            continue

        # quantitative-claim gate (D3-R5)
        blob = f"{theme} {rationale}"
        if any(p.search(blob) for p in QUANT_PATTERNS):
            errors.append({"cluster_id": cid,
                           "error": "d3 quantitative claim in LLM output — frequencies are set by d2, not d3; "
                                    "remove the count from theme or severity_rationale"})
            continue

        # Pass 2 — citation integrity (D3-R2)
        cite_err = None
        for q in quotes:
            rid = q.get("row_id")
            if rid not in row_text:
                cite_err = f"citation integrity error: row_id {rid} not found in corpus"
                break
            if normalize_ws(q.get("text", "")) not in normalize_ws(row_text[rid]) \
               and normalize_ws(row_text[rid]) not in normalize_ws(q.get("text", "")):
                cite_err = f"citation integrity error: quote for {rid} does not match stored text"
                break
        if cite_err:
            errors.append({"cluster_id": cid, "error": cite_err})
            continue

        valid.append(lab)

    return valid, errors


# ============================================================
# d4 — report
# ============================================================

def build_report(run):
    corpus = read_json(os.path.join(run, "01-corpus.json"))
    clusters_obj = read_json(os.path.join(run, "02-clusters.json"))
    labels_path = os.path.join(run, "03-labels.json")
    if not os.path.isfile(labels_path):
        die("03-labels.json not found — run /d3-label (or demo)")
    labels_obj = read_json(labels_path)

    rows = corpus["rows"]
    row_by_id = {r["row_id"]: r for r in rows}
    cluster_by_id = {c["cluster_id"]: c for c in clusters_obj["clusters"]}
    total_accepted = corpus["acceptedRows"]

    valid_labels, errors = validate_labels(labels_obj, clusters_obj["clusters"], rows)

    # report dropped clusters (failed validation) for the warning section
    dropped = [{"cluster_id": e["cluster_id"], "reason": e["error"]} for e in errors]

    insights = []
    for lab in valid_labels:
        cid = lab["cluster_id"]
        cluster = cluster_by_id[cid]
        freq = cluster["size"]  # D4-R1: copied verbatim from d2
        sev = lab["severity"]
        citations = []
        for q in lab["sample_quotes"]:
            r = row_by_id[q["row_id"]]
            citations.append({
                "row_id": r["row_id"],
                "text": r["text"],
                "source": r["source"],
                "date": r.get("date"),
                "rating": r.get("rating"),
            })
        if not citations:  # D4-R5
            dropped.append({"cluster_id": cid, "reason": "no resolvable citations"})
            continue
        insights.append({
            "cluster_id": cid,
            "theme": lab["theme"],
            "clusterType": lab["clusterType"],
            "frequency": freq,
            "frequencyPct": round(freq / total_accepted * 100, 1) if total_accepted else 0.0,
            "severity": sev,
            "severity_rationale": lab["severity_rationale"],
            "priorityScore": freq * sev,
            "compositionWarning": bool(lab.get("compositionWarning", False)),
            "languageMixWarning": cluster["languageMixRatio"] > 0.30,
            "strategyClaimIds": lab.get("strategyClaimIds", []),
            "citations": citations,
        })

    insights.sort(key=lambda x: (-x["priorityScore"], x["cluster_id"]))
    for rank, ins in enumerate(insights, start=1):
        ins["rank"] = rank

    # source breakdown (D4-R7) — counted by CLI
    sources = {}
    for r in rows:
        sources[r["source"]] = sources.get(r["source"], 0) + 1
    dates = [r["date"] for r in rows if r.get("date")]

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "runId": clusters_obj["runId"],
        "reportedAt": now_iso(),
        "corpusSummary": {
            "totalAcceptedRows": total_accepted,
            "clusterCount": clusters_obj["clusterCount"],
            "noiseCount": clusters_obj["noiseCount"],
            "noiseRatio": clusters_obj["noiseRatio"],
            "dateRange": {"from": min(dates), "to": max(dates)} if dates else {"from": None, "to": None},
            "sources": sources,
        },
        "embeddingModel": clusters_obj["embeddingModel"],
        "clusteringMethod": clusters_obj.get("clusteringMethod"),
        "hdbscanParams": clusters_obj["hdbscanParams"],
        "silhouette": clusters_obj.get("silhouette"),
        "medianTextLengthTokens": clusters_obj.get("medianTextLengthTokens"),
        "insights": [{**ins} for ins in insights],
        "noiseItems": {"count": clusters_obj["noiseCount"], "rowIds": clusters_obj["noiseRowIds"]},
        "droppedInsights": dropped,
        "caveat": "Frequencies reflect complaint distribution among users who wrote a public review, "
                  "not the full user population.",
    }
    return report, errors


def render_report_md(report):
    L = []
    cs = report["corpusSummary"]
    L.append(f"# Discovery Report — {report['runId']}")
    L.append("")
    L.append(f"**Generated:** {report['reportedAt']}  ")
    L.append(f"**Embedding model:** {report['embeddingModel']}  ")
    L.append(f"**Clustering:** {report.get('clusteringMethod')}  ")
    L.append("")
    L.append(f"> ⚠ {report['caveat']}")
    L.append("")
    L.append("## Corpus Summary")
    L.append("")
    L.append(f"- Accepted rows: **{cs['totalAcceptedRows']}**")
    L.append(f"- Clusters: {cs['clusterCount']} · Noise: {cs['noiseCount']} ({cs['noiseRatio']*100:.1f}%)")
    if cs["dateRange"]["from"]:
        L.append(f"- Date range: {cs['dateRange']['from']} → {cs['dateRange']['to']}")
    L.append(f"- Sources: " + ", ".join(f"{k}: {v}" for k, v in sorted(cs["sources"].items())))
    L.append("")

    L.append("## Prioritized Insights")
    L.append("")
    L.append("_Sorted by Frequency × Severity (heuristic — not RICE)._")
    L.append("")
    L.append("| Rank | Theme | Type | Freq | % | Sev | Priority |")
    L.append("|---|---|---|---|---|---|---|")
    for ins in report["insights"]:
        L.append(f"| {ins['rank']} | {ins['theme']} | {ins['clusterType']} | "
                 f"{ins['frequency']} | {ins['frequencyPct']}% | {ins['severity']} | {ins['priorityScore']} |")
    L.append("")

    for ins in report["insights"]:
        L.append(f"### {ins['rank']}. {ins['theme']}")
        L.append("")
        flags = []
        if ins["compositionWarning"]:
            flags.append("⚠ composition warning")
        if ins["languageMixWarning"]:
            flags.append("⚠ high language mix")
        L.append(f"- **Type:** {ins['clusterType']} · **Severity:** {ins['severity']}/5 · "
                 f"**Frequency:** {ins['frequency']} ({ins['frequencyPct']}%) · "
                 f"**Priority:** {ins['priorityScore']}" + (("  \n- " + "; ".join(flags)) if flags else ""))
        L.append(f"- **Severity rationale:** {ins['severity_rationale']}")
        if ins["strategyClaimIds"]:
            L.append(f"- **Strategy claims:** {', '.join(ins['strategyClaimIds'])}")
        L.append("")
        L.append("**Citations:**")
        L.append("")
        for c in ins["citations"]:
            meta = " · ".join(filter(None, [c["source"], c.get("date"),
                                            f"rating {c['rating']}" if c.get("rating") is not None else None,
                                            f"row {c['row_id']}"]))
            L.append(f'> "{c["text"]}"  ')
            L.append(f">   — {meta}")
            L.append("")

    if report["droppedInsights"]:
        L.append("## ⚠ Dropped Insights (failed validation)")
        L.append("")
        L.append("| Cluster | Reason |")
        L.append("|---|---|")
        for d in report["droppedInsights"]:
            L.append(f"| {d['cluster_id']} | {d['reason']} |")
        L.append("")

    L.append("## Appendix — Reproducibility")
    L.append("")
    p = report["hdbscanParams"]
    L.append(f"- Embedding model: {report['embeddingModel']}")
    L.append(f"- Clustering method: {report.get('clusteringMethod')}")
    L.append(f"- HDBSCAN params: min_cluster_size={p['min_cluster_size']}, "
             f"min_samples={p['min_samples']}, cluster_selection_epsilon={p['cluster_selection_epsilon']}"
             + (" (auto-lowered for small corpus)" if p.get("autoLoweredForSmallCorpus") else ""))
    L.append(f"- Silhouette score: {report.get('silhouette')}")
    L.append(f"- Median text length (tokens): {report.get('medianTextLengthTokens')}")
    L.append(f"- Unclustered (noise) items: {report['noiseItems']['count']}")
    L.append("")
    return "\n".join(L)


# ============================================================
# baked d3 labels for demo (no LLM)
# ============================================================

# Keyword voting maps each cluster to a known theme. Severities/rationales follow
# RUBRIC-CLUSTERS.md anchors. Rationales contain no digit-with-unit patterns (D3-R5).
BAKED_THEMES = {
    "crash": {
        "keywords": ["trava", "travou", "travamento", "crash", "crashes", "freezes", "perdi", "lost", "configuração", "cadastr", "fluxo", "flow", "templates"],
        "theme": "App crashes during WhatsApp flow setup",
        "clusterType": "complaint", "severity": 4,
        "severity_rationale": "Users report the flow setup screen freezing and losing saved configuration during onboarding, which blocks the core task. Severity stops below critical because restarting the app is a known workaround that lets affected users recover and retry.",
    },
    "bot_silent": {
        "keywords": ["bot", "responde", "responder", "responding", "reconect", "reconnect", "mudo", "parou", "atende", "stopped"],
        "theme": "Bot stops responding after WhatsApp reconnection",
        "clusterType": "complaint", "severity": 5,
        "severity_rationale": "After reconnecting the WhatsApp number the bot goes silent and stops answering customers, so the product fails at its single core promise. No reliable self-service recovery is described and users report lost sales, which makes this a fully blocking failure.",
    },
    "trial": {
        "keywords": ["teste", "trial", "expirou", "expired", "período", "cobrado", "reativar", "ativar"],
        "theme": "Trial expired before first flow could be activated",
        "clusterType": "complaint", "severity": 4,
        "severity_rationale": "The trial window ends before users finish onboarding, so they are charged or locked out before ever activating a single flow. This severely degrades acquisition, though some users can recover by contacting billing, keeping it just below critical.",
    },
    "instagram": {
        "keywords": ["instagram", "integração", "integration", "direct", "stories", "canal", "channel"],
        "theme": "Requested Instagram Direct integration alongside WhatsApp",
        "clusterType": "feature-request", "severity": 3,
        "severity_rationale": "Users want Instagram Direct messaging in addition to WhatsApp because a single channel limits their reach. This is a missing capability rather than a defect, so it sits in the moderate band, raised only when it blocks a clearly paid use case.",
    },
    "ux_question": {
        "keywords": ["confusa", "configurar", "como", "entendi", "entender", "variáveis", "documentação", "menu", "opção", "resposta"],
        "theme": "Confusion configuring automated replies and templates",
        "clusterType": "question", "severity": 3,
        "severity_rationale": "Users cannot find where to configure automated replies or template variables and the documentation does not help, so they get stuck. The goal is reachable but the experience is frustrating, which places this firmly in the moderate quality-of-life band.",
    },
    "praise": {
        "keywords": ["ótimo", "adorei", "incrível", "fantastic", "recomendo", "fácil", "easy", "economizei", "transformou", "great"],
        "theme": "Positive feedback on automation and ease of use",
        "clusterType": "praise", "severity": 1,
        "severity_rationale": "These rows are generic positive feedback praising automation, ease of setup and time savings. They carry no actionable defect and are preserved intentionally as a signal of what currently works well for the customer base, so severity is the lowest anchor.",
    },
    "pricing": {
        "keywords": ["preço", "caro", "alto", "custo", "valor", "expensive", "fee", "monthly", "cobram"],
        "theme": "Pricing perceived as too high for small businesses",
        "clusterType": "complaint", "severity": 2,
        "severity_rationale": "Users perceive the monthly price as too high for a small business and expected more for the money. This is a perception complaint rather than a functional defect, so it sits in the minor band unless it is shown to directly drive trial churn.",
    },
    "support": {
        "keywords": ["suporte", "support", "demora", "responder", "tickets", "atendimento", "inexistente", "takes", "respond"],
        "theme": "Slow or absent customer support response",
        "clusterType": "complaint", "severity": 4,
        "severity_rationale": "Support takes far too long or never replies while the customer's bot is down, turning a recoverable incident into prolonged downtime and lost revenue. Because a workaround channel sometimes exists, it stays just below the fully critical anchor.",
    },
}


def bake_labels(run):
    corpus = read_json(os.path.join(run, "01-corpus.json"))
    clusters_obj = read_json(os.path.join(run, "02-clusters.json"))
    row_by_id = {r["row_id"]: r for r in corpus["rows"]}

    def row_hits(text_low, spec):
        return sum(text_low.count(kw) for kw in spec["keywords"])

    labels = []
    for cluster in clusters_obj["clusters"]:
        cid = cluster["cluster_id"]
        rids = cluster["rowIds"]
        texts_low = {rid: row_by_id[rid]["text"].lower() for rid in rids}

        # vote: theme with most keyword hits across cluster members
        best_key, best_score = None, 0
        for key, spec in BAKED_THEMES.items():
            score = sum(row_hits(texts_low[rid], spec) for rid in rids)
            if score > best_score:
                best_key, best_score = key, score

        if best_key is None:
            spec = {"theme": "Incoherent cluster (no dominant theme)", "clusterType": "noise-label",
                    "severity": 1, "severity_rationale": "The clustering grouped these rows by density but no "
                    "single coherent theme dominates, so this block is labeled as noise and excluded from the "
                    "prioritized insights pending manual review by the product manager."}
            on_theme = list(rids)
        else:
            spec = BAKED_THEMES[best_key]
            on_theme = [rid for rid in rids if row_hits(texts_low[rid], spec) > 0]

        # citations: rows that actually match the winning theme; only pad with
        # off-theme rows if fewer than 3 on-theme rows exist (D3-R3 needs >=3)
        if len(on_theme) >= 3:
            chosen = on_theme[:5]
        else:
            chosen = on_theme + [rid for rid in rids if rid not in on_theme]
            chosen = chosen[:5]
        quotes = [{"row_id": rid, "text": row_by_id[rid]["text"]} for rid in chosen]
        if len(quotes) < 3:
            continue  # cannot satisfy D3-R3 (should not happen with min_cluster_size>=3)

        # composition warning when the winning theme covers < 60% of the cluster (DESIGN §4 Pass 3)
        composition_warning = best_key is not None and (len(on_theme) / len(rids)) < 0.60

        labels.append({
            "cluster_id": cid,
            "theme": spec["theme"],
            "clusterType": spec["clusterType"],
            "severity": spec["severity"],
            "severity_rationale": spec["severity_rationale"],
            "sample_quotes": quotes[:5],
            "compositionWarning": composition_warning,
            "strategyClaimIds": [],
        })

    return {
        "schemaVersion": SCHEMA_VERSION,
        "runId": clusters_obj["runId"],
        "labeledAt": now_iso(),
        "labelBackend": "baked-demo",
        "labelModel": "none (deterministic keyword voting)",
        "labels": labels,
        "validationErrors": [],
    }


# ============================================================
# Commands
# ============================================================

def cmd_init(args):
    if not args.get("product"):
        die("--product is required")
    if not args.get("input") or args.get("input") is True:
        die("--input <csv> is required")
    run = new_run_dir(args["product"])
    run_id = os.path.basename(run)

    run_meta = {
        "schemaVersion": SCHEMA_VERSION,
        "runId": run_id,
        "product": args["product"],
        "inputFile": args["input"],
        "sources": (args.get("sources") or "").split(",") if isinstance(args.get("sources"), str) else [],
        "segment": args.get("segment") if isinstance(args.get("segment"), str) else None,
        "dateRange": args.get("date-range") if isinstance(args.get("date-range"), str) else None,
        "author": args.get("author") if isinstance(args.get("author"), str) else "",
        "createdAt": now_iso(),
    }
    write_json(os.path.join(run, "run.json"), run_meta)

    corpus = ingest(args["input"], run_id)
    write_json(os.path.join(run, "01-corpus.json"), corpus)

    print(f"Discovery run created: {rel(run)}")
    print(f"  d1-ingest: {corpus['acceptedRows']} accepted / {corpus['totalInputRows']} input "
          f"(dropped: {corpus['dropReport']})")
    print("Next: python discovery/cli.py cluster")


def cmd_status(args):
    run = resolve_run(args)
    print(f"Discovery run: {rel(run)}\n")
    steps = [
        ("d1-ingest", "01-corpus.json"),
        ("d2-cluster", "02-clusters.json"),
        ("d3-label", "03-labels.json"),
        ("d4-report", "04-report.json"),
    ]
    next_step = None
    for label, fname in steps:
        path = os.path.join(run, fname)
        if not os.path.isfile(path):
            print(f"  [ ] {label}")
            if not next_step:
                next_step = label
            continue
        try:
            obj = read_json(path)
        except Exception as ex:
            print(f"  [!] {label} — invalid JSON: {ex}")
            if not next_step:
                next_step = label
            continue
        detail = ""
        if fname == "01-corpus.json":
            detail = f"{obj['acceptedRows']} accepted, dropped {obj['dropReport']}"
        elif fname == "02-clusters.json":
            detail = (f"{obj['clusterCount']} clusters, {obj['noiseCount']} noise "
                      f"({obj['noiseRatio']*100:.1f}%), silhouette={obj.get('silhouette')}, "
                      f"method={obj.get('clusteringMethod')}")
        elif fname == "03-labels.json":
            detail = f"{len(obj.get('labels', []))} labels"
        elif fname == "04-report.json":
            detail = f"{len(obj.get('insights', []))} insights, {len(obj.get('droppedInsights', []))} dropped"
        print(f"  [x] {label} — {detail}")

    # warnings
    cpath = os.path.join(run, "02-clusters.json")
    if os.path.isfile(cpath):
        c = read_json(cpath)
        if c.get("noiseWarning"):
            print(f"\n  ⚠  noise ratio {c['noiseRatio']*100:.1f}% > 30% — consider lowering --min-cluster-size")
        if c.get("hdbscanParams", {}).get("autoLoweredForSmallCorpus"):
            print(f"  ⚠  small corpus (<50 rows) — min_cluster_size auto-lowered to "
                  f"{c['hdbscanParams']['min_cluster_size']}")
        if c.get("clusteringMethod") == "kmeans-fallback":
            print("  ⚠  HDBSCAN found no clusters — fell back to k-means")

    if next_step:
        nxt = {"d1-ingest": "python discovery/cli.py init ...",
               "d2-cluster": "python discovery/cli.py cluster",
               "d3-label": "/d3-label (Claude Code slash command)",
               "d4-report": "python discovery/cli.py report"}[next_step]
        print(f"\nNext: {nxt}")
    else:
        print("\nAll steps complete. Report: open discovery-report.md in the run folder.")


def cmd_cluster(args):
    run = resolve_run(args)
    out = cluster_run(run,
                      min_cluster_size=args.get("min-cluster-size") if isinstance(args.get("min-cluster-size"), str) else None,
                      min_samples=args.get("min-samples") if isinstance(args.get("min-samples"), str) else None)
    write_json(os.path.join(run, "02-clusters.json"), out)
    print(f"d2-cluster: {out['clusterCount']} clusters, {out['noiseCount']} noise "
          f"({out['noiseRatio']*100:.1f}%), method={out['clusteringMethod']}, "
          f"silhouette={out['silhouette']}")
    if out["noiseWarning"]:
        print(f"  ⚠ noise {out['noiseRatio']*100:.1f}% > 30% — consider lower --min-cluster-size")
    print("Next: /d3-label (Claude Code), then python discovery/cli.py report")


def cmd_report(args):
    run = resolve_run(args)
    report, errors = build_report(run)
    write_json(os.path.join(run, "04-report.json"), report)
    md = render_report_md(report)
    md_path = os.path.join(run, "discovery-report.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"d4-report: {len(report['insights'])} insights rendered → {rel(md_path)}")
    if errors:
        print(f"  ⚠ {len(errors)} label block(s) rejected at validation:")
        for e in errors:
            print(f"    - {e['cluster_id']}: {e['error']}")


def cmd_voc_validate(args):
    run = resolve_run(args)
    strat = args.get("strategy-run")
    if not strat or strat is True:
        die("--strategy-run <run-id> is required")
    claims_path = os.path.join(OUT, strat, "claims.json")
    if not os.path.isfile(claims_path):
        die(f"strategy claims not found: {rel(claims_path)}")
    report_path = os.path.join(run, "04-report.json")
    if not os.path.isfile(report_path):
        die("04-report.json not found — run report first")

    claims_raw = read_json(claims_path)
    claims = claims_raw.get("claims", claims_raw) if isinstance(claims_raw, dict) else claims_raw
    claim_by_id = {c["id"]: c for c in claims}
    report = read_json(report_path)
    clusters_obj = read_json(os.path.join(run, "02-clusters.json"))
    min_cluster_size = clusters_obj["hdbscanParams"]["min_cluster_size"]

    # claim → cluster mapping: from insights' strategyClaimIds, or optional claim-map.json
    mapping = {}  # claimId -> {clusterId, direction}
    map_path = os.path.join(run, "claim-map.json")
    if os.path.isfile(map_path):
        for m in read_json(map_path).get("mappings", []):
            mapping[m["claimId"]] = {"clusterId": m.get("clusterId"), "direction": m.get("direction", "pain")}
    for ins in report["insights"]:
        for cidv in ins.get("strategyClaimIds", []):
            mapping.setdefault(cidv, {"clusterId": ins["cluster_id"], "direction": "pain"})

    insight_by_cluster = {i["cluster_id"]: i for i in report["insights"]}

    lines = ["# VoC Delta Report", "",
             f"**Discovery run:** {report['runId']}  ",
             f"**Strategy run:** {strat}  ",
             f"**Generated:** {now_iso()}  ",
             f"**min_cluster_size (run):** {min_cluster_size}",
             "",
             "Automatic verdict is computed by the CLI (DESIGN §8, v1 scale): "
             "`supported` / `insufficient-evidence`. `contradicts` is never automatic — "
             "fill the **PM verdict** line manually after reading the citations.",
             ""]

    if not mapping:
        lines += ["_No claim ↔ cluster mappings found. Add `strategyClaimIds` to insights in "
                  "04-report.json, or create claim-map.json with `mappings: [{claimId, clusterId, direction}]`._", ""]

    for claim_id, m in sorted(mapping.items()):
        claim = claim_by_id.get(claim_id)
        cluster_id = m["clusterId"]
        direction = m.get("direction", "pain")
        ins = insight_by_cluster.get(cluster_id)

        verdict = "insufficient-evidence"
        reason = []
        if not ins:
            reason.append("no linked insight cluster in report")
        else:
            freq_ok = ins["frequency"] >= min_cluster_size
            if direction == "positive":
                dir_ok = ins["clusterType"] == "praise"
            else:
                dir_ok = ins["clusterType"] in {"complaint", "question", "feature-request"} and ins["severity"] >= 3
            if not freq_ok:
                reason.append(f"frequency {ins['frequency']} < min_cluster_size {min_cluster_size}")
            if not dir_ok:
                reason.append(f"severity/type direction mismatch (type={ins['clusterType']}, sev={ins['severity']}, claim={direction})")
            if freq_ok and dir_ok:
                verdict = "supported"

        lines.append(f"## Claim {claim_id}")
        lines.append("")
        if claim:
            lines.append(f"> {claim.get('statement', '(no statement)')}")
            lines.append("")
        lines.append(f"- **Linked cluster:** {cluster_id or '—'}")
        if ins:
            lines.append(f"- **Evidence:** type={ins['clusterType']}, severity={ins['severity']}, "
                         f"frequency={ins['frequency']}, citations={len(ins['citations'])}")
        lines.append(f"- **CLI verdict:** `{verdict}`" + (f" ({'; '.join(reason)})" if reason else ""))
        lines.append(f"- **PM verdict:** _(supported / insufficient-evidence / **contradicts** — fill manually with justification)_")
        lines.append("")

    out_path = os.path.join(run, "voc-delta.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"voc-validate: {len(mapping)} claim(s) checked → {rel(out_path)}")


def cmd_export_eval_cases(args):
    run = resolve_run(args)
    min_sev = int(args["min-severity"]) if isinstance(args.get("min-severity"), str) else 3
    out_path = args.get("output")
    if not out_path or out_path is True:
        out_path = os.path.join(ROOT, "evalagent", "cases-from-discovery.json")
    report_path = os.path.join(run, "04-report.json")
    if not os.path.isfile(report_path):
        die("04-report.json not found — run report first")
    report = read_json(report_path)

    cases = []
    by_category = {"happy-path": 0, "edge-case": 0, "adversarial": 0}
    for ins in report["insights"]:
        if ins["clusterType"] != "complaint" or ins["severity"] < min_sev:
            continue
        category = "edge-case" if ins["severity"] >= 4 else "adversarial"
        by_category[category] += 1
        desc = " | ".join(c["text"] for c in ins["citations"][:3])
        cases.append({
            "id": f"disc-{ins['cluster_id']}-case-01",
            "title": ins["theme"],
            "description": desc,
            "category": category,
            "source": "complaint-mined",
            "calibrationStatus": "unvalidated",
        })

    payload = {
        "cases": cases,
        "summary": {"total": len(cases), "byCategory": by_category},
        "exportedFrom": report["runId"],
        "minSeverity": min_sev,
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    write_json(os.path.abspath(out_path), payload)
    print(f"export-eval-cases: {len(cases)} complaint case(s) (severity >= {min_sev}) → {rel(os.path.abspath(out_path))}")


def cmd_demo(args):
    if not os.path.isfile(FIXTURES_CORPUS):
        die(f"fixtures corpus not found: {FIXTURES_CORPUS}")
    ts = datetime.date.today().isoformat()
    run = os.path.join(OUT, f"botconversa-discovery-demo-{ts}")
    if os.path.exists(run):
        shutil.rmtree(run)
    os.makedirs(run, exist_ok=True)
    run_id = os.path.basename(run)

    write_json(os.path.join(run, "run.json"), {
        "schemaVersion": SCHEMA_VERSION, "runId": run_id, "product": "botconversa",
        "inputFile": rel(FIXTURES_CORPUS), "mode": "demo", "createdAt": now_iso(),
    })

    # d1
    corpus = ingest(FIXTURES_CORPUS, run_id)
    write_json(os.path.join(run, "01-corpus.json"), corpus)
    print(f"d1-ingest: {corpus['acceptedRows']} accepted / {corpus['totalInputRows']} input, "
          f"dropped {corpus['dropReport']}")

    # d2
    clusters = cluster_run(run)
    write_json(os.path.join(run, "02-clusters.json"), clusters)
    print(f"d2-cluster: {clusters['clusterCount']} clusters, {clusters['noiseCount']} noise, "
          f"method={clusters['clusteringMethod']}, silhouette={clusters['silhouette']}")

    # d3 (baked, no LLM)
    labels = bake_labels(run)
    write_json(os.path.join(run, "03-labels.json"), labels)
    print(f"d3-label (baked): {len(labels['labels'])} labels")

    # d4
    report, errors = build_report(run)
    write_json(os.path.join(run, "04-report.json"), report)
    md = render_report_md(report)
    with open(os.path.join(run, "discovery-report.md"), "w", encoding="utf-8") as f:
        f.write(md)
    print(f"d4-report: {len(report['insights'])} insights → {rel(os.path.join(run, 'discovery-report.md'))}")
    print(f"\nDemo run: {rel(run)}")
    print("Now: python discovery/cli.py status --run " + run_id)
    print("     python discovery/cli.py report --run " + run_id)


COMMANDS = {
    "init": cmd_init,
    "status": cmd_status,
    "cluster": cmd_cluster,
    "report": cmd_report,
    "voc-validate": cmd_voc_validate,
    "export-eval-cases": cmd_export_eval_cases,
    "demo": cmd_demo,
}


def main():
    args = parse_args(sys.argv[1:])
    cmd = args["_"][0] if args["_"] else None
    fn = COMMANDS.get(cmd)
    if not fn:
        print("Commands: init | status | cluster | report | voc-validate | export-eval-cases | demo")
        sys.exit(0 if cmd is None else 1)
    fn(args)


if __name__ == "__main__":
    main()
