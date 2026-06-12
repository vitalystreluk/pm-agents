#!/usr/bin/env node
// evalagent/cli.js — deterministic backbone of the eval agent.
// Claude Code does the thinking (steps via .claude/commands/); this CLI does
// everything that must NOT be left to an LLM: validation, hash integrity, aggregation, rendering.
// Hard rule 8: confidence and exitState are set ONLY by this CLI — never by LLM output.
//
// Commands:
//   init --feature F --description D [--author Name]   → create eval run skeleton
//   status [run]                                        → validate e1–e4; show next action
//   verify [run]                                        → recompute SHA-256 hashes; report mismatches
//   render-report [run]                                 → markdown report from 04-report.json
//   demo                                               → create demo run from fixtures (no LLM)

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { validateEval } = require('../core/schema');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'output');

// ---------- arg parsing ----------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
    else args._.push(argv[i]);
  }
  return args;
}

// ---------- run resolution ----------

function latestEvalRun() {
  if (!fs.existsSync(OUT)) return null;
  const dirs = fs.readdirSync(OUT).filter(
    (d) => d.includes('-eval-') && fs.statSync(path.join(OUT, d)).isDirectory()
  );
  if (!dirs.length) return null;
  dirs.sort((a, b) => fs.statSync(path.join(OUT, a)).mtimeMs - fs.statSync(path.join(OUT, b)).mtimeMs);
  return path.join(OUT, dirs[dirs.length - 1]);
}

function resolveRun(args) {
  const named = (args._[1] && /^[a-z0-9][\w-]*$/i.test(args._[1])) ? args._[1] : null;
  const dir   = named ? path.join(OUT, named) : latestEvalRun();
  if (named && !fs.existsSync(dir)) {
    console.error(`Run "${named}" not found in output/.`);
    process.exit(1);
  }
  if (!dir || !fs.existsSync(dir)) {
    console.error('No eval run found. Start with: node evalagent/cli.js init --feature ... (or: demo)');
    process.exit(1);
  }
  return dir;
}

// ---------- hashing ----------

function sha256(content) {
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}

function writeTranscriptFile(run, transcript) {
  const dir      = path.join(run, 'transcripts');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${transcript.caseId}-${transcript.variantId}.json`;
  const filepath = path.join(dir, filename);
  // inject runId before writing
  const t = { ...transcript, runId: path.basename(run) };
  const content = JSON.stringify(t, null, 2);
  // atomic write: tmp → rename
  const tmp = filepath + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filepath);
  return { filename, hash: sha256(content) };
}

function readTranscriptIndex(run) {
  const p = path.join(run, 'transcripts', 'index.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// ---------- aggregate computation ----------
// This runs after the LLM writes judgments; CLI fills in weightedTotal,
// latencyMs, costUSD, variant aggregates, frontier table, and winner.

function computeAggregates(report, rubricWeights, enrichMap) {
  const weights = rubricWeights || {};

  // enrich judgments with transcript data and recompute weightedTotal
  for (const j of report.judgments) {
    const key = `${j.caseId}-${j.variantId}`;
    if (enrichMap && enrichMap[key]) {
      const em = enrichMap[key];
      if (em.transcriptFile) j.transcriptFile = em.transcriptFile;
      if (em.transcriptHash) j.transcriptHash = em.transcriptHash;
      if (em.latencyMs != null) j.latencyMs   = em.latencyMs;
      if (em.costUSD   != null) j.costUSD      = em.costUSD;
      if (em.category)          j.category     = em.category;
      if (em.segment)           j.segment      = em.segment;
    }
    // weightedTotal is always set by CLI (never trusted from LLM)
    let total = 0;
    for (const [crit, score] of Object.entries(j.scores || {})) {
      total += (score || 0) * (weights[crit] || 0);
    }
    j.weightedTotal = +total.toFixed(2);
  }

  // aggregate by variant
  const vaMap = {};
  for (const j of report.judgments) {
    const vid = j.variantId;
    if (!vaMap[vid]) vaMap[vid] = { scores: [], latencies: [], costs: [], byCategory: {}, byCriterion: {}, bySegment: {}, passes: 0, total: 0, failures: {} };
    const va = vaMap[vid];
    va.scores.push(j.weightedTotal);
    va.latencies.push(j.latencyMs || 0);
    va.costs.push(j.costUSD || 0);
    if (j.passFailVerdict === 'pass') va.passes++;
    va.total++;

    const cat = j.category || 'unknown';
    va.byCategory[cat] = va.byCategory[cat] || []; va.byCategory[cat].push(j.weightedTotal);

    const seg = j.segment || 'unknown';
    va.bySegment[seg] = va.bySegment[seg] || []; va.bySegment[seg].push(j.weightedTotal);

    for (const [crit, score] of Object.entries(j.scores || {})) {
      va.byCriterion[crit] = va.byCriterion[crit] || []; va.byCriterion[crit].push(score);
    }
    for (const flag of (j.flags || [])) va.failures[flag] = (va.failures[flag] || 0) + 1;
  }

  const avg  = (arr, dec = 2) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(dec) : null;
  const mapAvg = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, avg(v)]));

  report.variants = Object.entries(vaMap).map(([id, va]) => ({
    id,
    model: (report.judgments.find((j) => j.variantId === id) || {}).model || '',
    promptVariantId: (report.judgments.find((j) => j.variantId === id) || {}).promptVariantId || '',
    avgWeightedScore: avg(va.scores),
    avgLatencyMs:     avg(va.latencies, 0),
    avgCostUSD:       avg(va.costs, 6),
    scoresByCategory: mapAvg(va.byCategory),
    scoresByCriterion:mapAvg(va.byCriterion),
    scoresBySegment:  mapAvg(va.bySegment),
    passRate: va.total > 0 ? +(va.passes / va.total).toFixed(2) : 0,
    failureTaxonomy: va.failures,
  }));

  // frontier table with Pareto notes
  report.frontierTable = report.variants.map((v) => ({
    variantId: v.id, qualityScore: v.avgWeightedScore,
    avgLatencyMs: v.avgLatencyMs, avgCostUSD: v.avgCostUSD, paretoNote: '',
  }));

  if (report.variants.length > 0) {
    const byQ   = [...report.variants].sort((a, b) => b.avgWeightedScore - a.avgWeightedScore);
    const byC   = [...report.variants].sort((a, b) => a.avgCostUSD - b.avgCostUSD);
    const byL   = [...report.variants].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
    const dominated = new Set();
    for (let i = 0; i < report.variants.length; i++) {
      for (let j = i + 1; j < report.variants.length; j++) {
        const a = report.variants[i], b = report.variants[j];
        if (a.avgWeightedScore >= b.avgWeightedScore && a.avgCostUSD <= b.avgCostUSD && a.avgLatencyMs <= b.avgLatencyMs) dominated.add(b.id);
        if (b.avgWeightedScore >= a.avgWeightedScore && b.avgCostUSD <= a.avgCostUSD && b.avgLatencyMs <= a.avgLatencyMs) dominated.add(a.id);
      }
    }
    for (const row of report.frontierTable) {
      const notes = [];
      if (byQ[0].id === row.variantId) notes.push('highest quality');
      if (byC[0].id === row.variantId) notes.push('cheapest');
      if (byL[0].id === row.variantId) notes.push('fastest');
      if (dominated.has(row.variantId)) notes.push('dominated');
      row.paretoNote = notes.join(', ') || 'on frontier';
    }

    // quality winner: only if single variant OR clear leader with CI check
    // For multi-variant runs the LLM slash command sets the CI; CLI trusts it.
    const qualityWinner = report.variants.length === 1
      ? byQ[0].id
      : (report.winner?.quality || 'inconclusive');

    report.winner = {
      quality: qualityWinner,
      cost: byC[0].id,
      latency: byL[0].id,
      qualityConfidenceInterval: report.winner?.qualityConfidenceInterval || [0, 0],
      qualityWinnerRationale: report.variants.length === 1
        ? `Single variant evaluated — ${byQ[0].id} is the only option`
        : (report.winner?.qualityWinnerRationale || 'See CI in report'),
    };
  }

  // critical failures: pass=fail on any criterion weight ≥ 0.20
  report.criticalFailures = report.judgments
    .filter((j) => j.passFailVerdict === 'fail')
    .map((j) => ({ caseId: j.caseId, variantId: j.variantId, reason: j.passFailRationale || 'fail verdict' }));

  const allCosts = report.judgments.map((j) => j.costUSD || 0);
  report.totalCostUSD = +(allCosts.reduce((a, b) => a + b, 0)).toFixed(4);
  report.costPerCase  = report.judgments.length ? +(report.totalCostUSD / report.judgments.length).toFixed(4) : 0;
  report.generatedAt  = new Date().toISOString();
}

// ---------- markdown renderer ----------

function buildMarkdownReport(report, runId) {
  const L = [];
  const smokeWarning = report.calibrationConfidence === 'smoke';

  L.push(`# Eval Report — ${report.feature || runId}`);
  L.push(`**Run:** ${runId}  `);
  L.push(`**Generated:** ${report.generatedAt || ''}  `);
  L.push(`**Calibration:** ${smokeWarning ? '⚠ SMOKE TEST (N<10) — not statistically valid' : '✓ Statistical (N≥10)'}`);
  if (smokeWarning) L.push('\n> ⚠ **Smoke-test calibration.** Results are directional only. Do not use for deployment decisions without N≥10 statistical calibration.');
  L.push('');

  L.push('## Model Frontier (Quality × Cost × Latency)');
  L.push('');
  L.push('| Variant | Quality Score | Avg Latency ms | Avg Cost/case USD | Note |');
  L.push('|---|---|---|---|---|');
  for (const row of (report.frontierTable || [])) {
    L.push(`| ${row.variantId} | ${row.qualityScore?.toFixed(2) ?? '—'} | ${row.avgLatencyMs ?? '—'} | $${row.avgCostUSD?.toFixed(4) ?? '—'} | ${row.paretoNote || ''} |`);
  }
  L.push('');

  const w = report.winner || {};
  L.push('## Winner Summary');
  L.push('');
  L.push(`- **Quality:** ${w.quality || '—'}${w.quality === 'inconclusive' ? ' (CI overlaps zero — inconclusive)' : w.qualityConfidenceInterval ? ` (CI: [${w.qualityConfidenceInterval[0]?.toFixed(2)}, ${w.qualityConfidenceInterval[1]?.toFixed(2)}])` : ''}`);
  L.push(`- **Cost:** ${w.cost || '—'}`);
  L.push(`- **Latency:** ${w.latency || '—'}`);
  if (w.qualityWinnerRationale) L.push(`- **Rationale:** ${w.qualityWinnerRationale}`);
  L.push('');

  for (const v of (report.variants || [])) {
    L.push(`## Variant: ${v.id}${v.model ? ` (${v.model})` : ''}`);
    L.push('');
    L.push(`- Avg weighted score: **${v.avgWeightedScore?.toFixed(2) ?? '—'}**`);
    L.push(`- Pass rate: ${v.passRate != null ? `${(v.passRate * 100).toFixed(0)}%` : '—'}`);
    L.push(`- Avg latency: ${v.avgLatencyMs ?? '—'} ms`);
    L.push(`- Avg cost/case: $${v.avgCostUSD?.toFixed(4) ?? '—'}`);

    if (v.scoresByCategory && Object.keys(v.scoresByCategory).length) {
      L.push('');
      L.push('**By category:**');
      for (const [cat, s] of Object.entries(v.scoresByCategory))
        L.push(`- ${cat}: ${typeof s === 'number' ? s.toFixed(2) : s}`);
    }

    if (v.scoresBySegment && Object.keys(v.scoresBySegment).length) {
      L.push('');
      L.push('**By vertical segment:**');
      for (const [seg, s] of Object.entries(v.scoresBySegment))
        L.push(`- ${seg}: ${typeof s === 'number' ? s.toFixed(2) : s}`);
    }

    if (v.scoresByCriterion && Object.keys(v.scoresByCriterion).length) {
      L.push('');
      L.push('**By criterion:**');
      for (const [crit, s] of Object.entries(v.scoresByCriterion))
        L.push(`- ${crit}: ${typeof s === 'number' ? s.toFixed(2) : s}`);
    }

    if (v.failureTaxonomy && Object.keys(v.failureTaxonomy).length) {
      L.push('');
      L.push('**Failure taxonomy:**');
      for (const [pattern, count] of Object.entries(v.failureTaxonomy))
        L.push(`- ${pattern}: ${count}`);
    }
    L.push('');
  }

  if ((report.criticalFailures || []).length) {
    L.push('## Critical Failures');
    L.push('');
    L.push('| Case | Variant | Reason |');
    L.push('|---|---|---|');
    for (const cf of report.criticalFailures)
      L.push(`| ${cf.caseId} | ${cf.variantId} | ${cf.reason} |`);
    L.push('');
  }

  L.push('## Per-Case Judgments');
  L.push('');
  L.push('| Case | Variant | Score | Verdict | Flags |');
  L.push('|---|---|---|---|---|');
  for (const j of (report.judgments || []))
    L.push(`| ${j.caseId} | ${j.variantId} | ${j.weightedTotal?.toFixed(2) ?? '—'} | ${j.passFailVerdict || '—'} | ${(j.flags || []).join(', ') || '—'} |`);
  L.push('');

  L.push('## Cost Summary');
  L.push('');
  L.push(`- Total cost: $${report.totalCostUSD?.toFixed(4) ?? '—'}`);
  L.push(`- Cost per case: $${report.costPerCase?.toFixed(4) ?? '—'}`);
  L.push('');

  return L.join('\n');
}

// ---------- commands ----------

function cmdInit(args) {
  if (!args.feature) { console.error('--feature is required'); process.exit(1); }
  const slug = args.feature.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const ts   = new Date().toISOString().slice(0, 10);
  const run  = path.join(OUT, `${slug}-eval-${ts}`);
  fs.mkdirSync(run, { recursive: true });
  const intake = {
    feature: args.feature, description: args.description || '',
    targetUser: '', successCriteria: [], variants: [],
    userSimulatorModel: '', rubricFile: 'evalagent/RUBRIC-DRAFT.md',
    maxTurnsPerCase: 8,
    cases: { cases: [], summary: { total: 0, byCategory: { 'happy-path': 0, 'edge-case': 0, adversarial: 0 } } },
    createdAt: new Date().toISOString(), author: args.author || '',
  };
  fs.writeFileSync(path.join(run, 'intake.json'), JSON.stringify(intake, null, 2));
  console.log(`Eval run created: ${path.relative(ROOT, run)}`);
  console.log('Next: open Claude Code and run /e1-intake to fill in cases and variants');
}

function cmdStatus(args) {
  const run = resolveRun(args);
  console.log(`Eval run: ${path.relative(ROOT, run)}\n`);

  const STEPS = [
    { key: 'e1', label: 'e1-intake',    file: path.join(run, 'intake.json') },
    { key: 'e2', label: 'e2-calibrate', file: path.join(run, 'calibration.json') },
    { key: 'e3', label: 'e3-run',       file: path.join(run, 'transcripts', 'index.json') },
    { key: 'e4', label: 'e4-judge',     file: path.join(run, '04-report.json') },
  ];

  let next = null;
  for (const step of STEPS) {
    if (!fs.existsSync(step.file)) {
      console.log(`  [ ] ${step.label}`);
      if (!next) next = step;
      continue;
    }
    let errors;
    try {
      errors = validateEval(step.key, JSON.parse(fs.readFileSync(step.file, 'utf8')));
    } catch (ex) {
      errors = [`invalid JSON: ${ex.message}`];
    }
    if (errors.length) {
      console.log(`  [!] ${step.label} — ${errors.length} error(s):`);
      errors.slice(0, 6).forEach((er) => console.log(`        - ${er}`));
      if (!next) next = step;
    } else {
      console.log(`  [x] ${step.label}`);
    }
  }

  // cross-step dependency: e3 blocked until calibrationPassed
  const calFile = path.join(run, 'calibration.json');
  if (fs.existsSync(calFile)) {
    try {
      const cal = JSON.parse(fs.readFileSync(calFile, 'utf8'));
      if (cal.confidence === 'smoke') {
        console.log(`\n  ⚠  calibration: SMOKE TEST (N=${cal.nCases || '?'}). Upgrade to N≥10 for statistical confidence.`);
      }
      if (!cal.calibrationPassed) {
        console.log(`  ✗  e3-run BLOCKED: calibrationPassed=false — fix failing criteria in rubric and re-run /e2-calibrate`);
      }
    } catch (_) {}
  }

  if (next) {
    console.log(`\nNext action: run /${next.label.replace('-', '')} in Claude Code`);
  } else {
    console.log('\nAll steps complete. Run: node evalagent/cli.js render-report');
  }
}

function cmdVerify(args) {
  const run   = resolveRun(args);
  const index = readTranscriptIndex(run);
  if (!index) { console.error('No transcript index. Run /e3run first.'); process.exit(1); }

  let ok = 0, fail = 0;
  for (const entry of index.entries) {
    const filepath = path.join(run, 'transcripts', entry.file);
    if (!fs.existsSync(filepath)) {
      console.log(`  [MISSING] ${entry.file}`); fail++; continue;
    }
    const actual = sha256(fs.readFileSync(filepath, 'utf8'));
    if (actual !== entry.sha256) {
      console.log(`  [TAMPERED] ${entry.file}`);
      console.log(`    stored:   ${entry.sha256}`);
      console.log(`    computed: ${actual}`);
      fail++;
    } else {
      console.log(`  [OK] ${entry.file}`); ok++;
    }
  }
  console.log(`\nVerify: ${ok} OK, ${fail} FAILED`);
  if (fail > 0) { console.error('Pipeline integrity failure — render-report blocked.'); process.exit(1); }
}

function cmdRenderReport(args) {
  const run        = resolveRun(args);
  const reportPath = path.join(run, '04-report.json');
  if (!fs.existsSync(reportPath)) { console.error('04-report.json not found. Run /e4judge first.'); process.exit(1); }

  // integrity check
  const index = readTranscriptIndex(run);
  if (index) {
    for (const entry of index.entries) {
      const fp = path.join(run, 'transcripts', entry.file);
      if (fs.existsSync(fp) && sha256(fs.readFileSync(fp, 'utf8')) !== entry.sha256) {
        console.error(`Integrity failure: ${entry.file} was modified after judging. Run verify for details.`);
        process.exit(1);
      }
    }
  }

  let report;
  try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); }
  catch (ex) { console.error(`Cannot parse 04-report.json: ${ex.message}`); process.exit(1); }

  const errors = validateEval('e4', report);
  if (errors.length) {
    console.error(`04-report.json has ${errors.length} schema errors:`);
    errors.forEach((er) => console.error(`  - ${er}`)); process.exit(1);
  }

  const runId  = path.basename(run);
  const md     = buildMarkdownReport(report, runId);
  const outFile= path.join(run, 'eval-report.md');
  fs.writeFileSync(outFile, md);
  console.log(`Report rendered: ${path.relative(ROOT, outFile)}`);
  if (report.calibrationConfidence === 'smoke')
    console.log('⚠  SMOKE TEST — directional only. Upgrade calibration to N≥10 before deployment decisions.');
  if (report.winner?.quality === 'inconclusive')
    console.log('ℹ  Quality winner: INCONCLUSIVE (CI overlaps zero).');
}

function cmdDemo() {
  const fixtures = require('./fixtures');
  const ts   = new Date().toISOString().slice(0, 10);
  const run  = path.join(OUT, `botconversa-eval-demo-${ts}`);
  fs.mkdirSync(run, { recursive: true });

  // e1: intake.json
  fs.writeFileSync(path.join(run, 'intake.json'), JSON.stringify(fixtures.intake, null, 2));

  // e3: transcripts — write files and compute real SHA-256 hashes
  const transcriptDir = path.join(run, 'transcripts');
  fs.mkdirSync(transcriptDir, { recursive: true });
  const indexEntries = [];
  const enrichMap    = {};  // key → { transcriptFile, transcriptHash, latencyMs, costUSD, category, segment }

  // build lookup maps from intake cases
  const caseMap = {};
  for (const c of (fixtures.intake.cases?.cases || [])) caseMap[c.id] = c;

  for (const transcript of fixtures.transcripts) {
    const { filename, hash } = writeTranscriptFile(run, transcript);
    indexEntries.push({
      caseId: transcript.caseId, variantId: transcript.variantId,
      file: filename, sha256: hash,
      latencyMs: transcript.latencyMs, costUSD: transcript.costUSD,
      exitState: transcript.exitState,
    });
    const c = caseMap[transcript.caseId];
    enrichMap[`${transcript.caseId}-${transcript.variantId}`] = {
      transcriptFile: `transcripts/${filename}`,
      transcriptHash: hash,
      latencyMs: transcript.latencyMs,
      costUSD: transcript.costUSD,
      category: c?.category,
      segment: c?.segment?.vertical || 'unknown',
    };
  }

  fs.writeFileSync(
    path.join(transcriptDir, 'index.json'),
    JSON.stringify({ runId: path.basename(run), createdAt: new Date().toISOString(), entries: indexEntries }, null, 2)
  );

  // e2: calibration.json
  fs.writeFileSync(path.join(run, 'calibration.json'), JSON.stringify(fixtures.calibration, null, 2));

  // e4: 04-report.json — inject hashes + compute aggregates
  const report   = JSON.parse(JSON.stringify(fixtures.report));
  report.runId   = path.basename(run);
  report.feature = fixtures.intake.feature;
  computeAggregates(report, fixtures.rubricWeights, enrichMap);

  fs.writeFileSync(path.join(run, '04-report.json'), JSON.stringify(report, null, 2));

  console.log(`Demo eval run created: ${path.relative(ROOT, run)}`);
  console.log('Now: node evalagent/cli.js status');
  console.log('     node evalagent/cli.js render-report');
}

// ---------- main ----------
const args = parseArgs(process.argv.slice(2));
const cmd  = args._[0];
({
  init:           cmdInit,
  status:         cmdStatus,
  verify:         cmdVerify,
  'render-report':cmdRenderReport,
  demo:           cmdDemo,
}[cmd] || (() => {
  console.log('Commands: init | status | verify | render-report | demo');
}))(args);
