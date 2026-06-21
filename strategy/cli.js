#!/usr/bin/env node
// strategy/cli.js — deterministic backbone of the strategy agent.
// Claude Code does the thinking (steps via .claude/commands/); this CLI does
// everything that must NOT be left to an LLM: validation, ledger, rendering, deltas.
//
// Commands:
//   init --product X --description Y --market Z [--competitors a,b] [--verticals v1,v2] [--author Name]
//   status [run]                  → which steps exist, schema validity, next action
//   claims [run]                  → data-request: all unconfirmed claims, prioritized
//   confirm <claimId> --value V --source "S" [run]   → V2: record internal data, print delta
//   render [run]                  → build DOCX from state (always full re-render)
//   demo                          → create a run from bundled fixtures (no LLM needed)
//
// Run resolution: explicit arg, else the latest folder in output/.

const fs = require('fs');
const path = require('path');
const { Ledger } = require('../core/ledger');
const { validate, validateNotes, STEP_ORDER, STEP_DECISION_WEIGHT } = require('../core/schema');
const notesLib = require('../core/notes');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    } else args._.push(argv[i]);
  }
  return args;
}

function latestRun() {
  if (!fs.existsSync(OUT)) return null;
  const dirs = fs.readdirSync(OUT).filter((d) => fs.statSync(path.join(OUT, d)).isDirectory());
  if (!dirs.length) return null;
  // sort by mtime, not name — "demo-<epoch>" must not outrank "botconversa-<date>" alphabetically
  dirs.sort((a, b) => fs.statSync(path.join(OUT, a)).mtimeMs - fs.statSync(path.join(OUT, b)).mtimeMs);
  return path.join(OUT, dirs[dirs.length - 1]);
}

function resolveRun(args) {
  // ignore junk positionals (e.g. a pasted "#comment" passed through npm run)
  // --run wins (used by subcommands like `note add` where _[1] is the verb, not the run)
  const named = (typeof args.run === 'string' && args.run)
    ? args.run
    : ((args._[1] && /^[a-z0-9][\w-]*$/i.test(args._[1])) ? args._[1] : null);
  const dir = named ? path.join(OUT, named) : latestRun();
  if (named && !fs.existsSync(dir)) {
    console.error(`Run "${named}" not found in output/. Available: ${fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(d => fs.statSync(path.join(OUT, d)).isDirectory()).join(', ') || '(none)' : '(none)'}`);
    process.exit(1);
  }
  if (!dir || !fs.existsSync(dir)) {
    console.error('No run found. Start with: node strategy/cli.js init --product ... (or: demo)');
    process.exit(1);
  }
  return dir;
}

function stepFile(run, step) {
  return path.join(run, `${step}.json`);
}

function ingestLedger(run) {
  const ledger = new Ledger(run);
  ledger.ingest(STEP_ORDER.map((s) => stepFile(run, s)));
  return ledger;
}

// ---------- commands ----------

function cmdInit(args) {
  for (const k of ['product', 'description', 'market']) {
    if (!args[k]) {
      console.error(`--${k} is required`);
      process.exit(1);
    }
  }
  const slug = args.product.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
  const run = path.join(OUT, `${slug}-${ts}`);
  fs.mkdirSync(run, { recursive: true });
  const intake = {
    product: args.product,
    description: args.description,
    market: args.market,
    competitors: (args.competitors || '').split(',').map((s) => s.trim()).filter(Boolean),
    verticals: (args.verticals || '').split(',').map((s) => s.trim()).filter(Boolean),
    author: args.author || '',
    createdAt: new Date().toISOString(),
    version: '1.0',
  };
  fs.writeFileSync(path.join(run, 'intake.json'), JSON.stringify(intake, null, 2));
  console.log(`Run created: ${path.relative(ROOT, run)}`);
  console.log('Next: open Claude Code in this repo and run /s1-research');
}

function cmdStatus(args) {
  const run = resolveRun(args);
  console.log(`Run: ${path.relative(ROOT, run)}\n`);
  let next = null;
  for (const step of STEP_ORDER) {
    const f = stepFile(run, step);
    if (!fs.existsSync(f)) {
      console.log(`  [ ] ${step}`);
      if (!next) next = step;
      continue;
    }
    let errors;
    try {
      errors = validate(step, JSON.parse(fs.readFileSync(f, 'utf8')));
    } catch (e) {
      errors = [`invalid JSON: ${e.message}`];
    }
    if (errors.length) {
      console.log(`  [!] ${step} — ${errors.length} schema error(s):`);
      errors.slice(0, 6).forEach((er) => console.log(`        - ${er}`));
      if (!next) next = `${step} (fix schema errors, then re-run /${slashName(step)})`;
    } else {
      console.log(`  [x] ${step}`);
    }
  }
  const ledger = ingestLedger(run);
  const unc = ledger.unconfirmed();
  console.log(`\nLedger: ${ledger.claims.length} claims, ${unc.length} unconfirmed`);
  if (next) {
    const action = next.includes('(') ? next : `run /${slashName(next)} in Claude Code`;
    console.log(`Next action: ${action}`);
  } else {
    console.log('All steps complete. Run: node strategy/cli.js render');
  }
}

function slashName(step) {
  return 's' + step.replace(/^0?(\d+)-/, '$1-');
}

function cmdClaims(args) {
  const run = resolveRun(args);
  const ledger = ingestLedger(run);
  const eff = ledger.effective();
  if (!eff.length) {
    console.log('No claims yet — run steps first.');
    return;
  }
  console.log('CLAIM LEDGER — data request (unconfirmed first)\n');
  const order = { estimate: 0, public: 1, contradicted: 2, confirmed: 3 };
  eff.sort((a, b) => order[a.status] - order[b.status]);
  for (const c of eff) {
    const tag = { estimate: '→ VALIDATE', public: 'PUBLIC', confirmed: 'CONFIRMED', contradicted: 'REVISED' }[c.status];
    const val = c.confirmedValue ?? c.value ?? '?';
    console.log(`  [${tag}] ${c.id}: ${c.statement}`);
    console.log(`           value: ${val}${c.unit || ''} · source: ${c.confirmedSource || c.source} · used in: ${c.usedIn.join(', ')}`);
  }
  console.log('\nTo confirm with internal data:');
  console.log('  node strategy/cli.js confirm <claimId> --value 55 --source "billing system, Apr 2026"');
}

function cmdConfirm(args) {
  const run = resolveRun({ _: ['confirm', args._[2]] }) || resolveRun(args);
  const id = args._[1];
  if (!id || args.value === undefined) {
    console.error('Usage: confirm <claimId> --value V --source "where it came from"');
    process.exit(1);
  }
  const ledger = ingestLedger(run);
  const delta = ledger.confirm(id, { value: args.value, source: args.source });
  console.log('DELTA REPORT');
  console.log(`  Claim: ${delta.claim.id} — ${delta.claim.statement}`);
  console.log(`  Estimate was: ${delta.claim.value ?? '(none)'}${delta.claim.unit || ''}`);
  console.log(`  Confirmed:    ${delta.claim.confirmedValue}${delta.claim.unit || ''} (${delta.claim.confirmedSource})`);
  if (delta.contradicted) {
    console.log('  STATUS: CONTRADICTED — confirmed value differs from the estimate.');
    console.log(`  Affected steps to re-run in Claude Code: ${delta.affectedSteps.map(slashName).map((s) => '/' + s).join(', ')}, then /s7-synthesis`);
    console.log('  Conclusions built on the old estimate must be re-checked, not just re-labelled.');
  } else {
    console.log('  STATUS: confirmed (matches estimate). Re-render is enough:');
    console.log('  node strategy/cli.js render');
  }
}

function cmdRender(args) {
  const run = resolveRun(args);
  // gate: all steps present and valid
  const missing = STEP_ORDER.filter((s) => !fs.existsSync(stepFile(run, s)));
  if (missing.length) {
    console.error(`Cannot render — missing steps: ${missing.join(', ')}. Run them in Claude Code first (see status).`);
    process.exit(1);
  }
  for (const s of STEP_ORDER) {
    const errors = validate(s, JSON.parse(fs.readFileSync(stepFile(run, s), 'utf8')));
    if (errors.length) {
      console.error(`Cannot render — ${s} has schema errors. Run status for details.`);
      process.exit(1);
    }
  }
  // V3.2: a malformed notes.json should block render, not silently render without voice.
  const noteErrors = validateNotes(notesLib.load(run));
  if (noteErrors.length) {
    console.error(`Cannot render — notes.json has errors:\n  ${noteErrors.join('\n  ')}`);
    process.exit(1);
  }
  const ledger = ingestLedger(run);
  const { render } = require('./render-docx');
  render(run, ledger).then((outFile) => {
    console.log(`Rendered: ${path.relative(ROOT, outFile)}`);
    const unc = ledger.unconfirmed().length;
    if (unc) console.log(`Note: ${unc} claims remain unconfirmed — they render as [→ Validate] markers and fill the data-request appendix.`);
    // V3.2: warn if author notes were added but s7 hasn't woven them into the body yet.
    const { unwoven } = notesStaleness(run);
    if (unwoven.length) {
      console.log(`⚠ STALE: ${unwoven.length} author note(s) not yet woven into the body (${unwoven.map((n) => n.id).join(', ')}). Re-run /s7-synthesis, then render again.`);
    }
  });
}

// ---------- V3: guided data collection ----------
// The DETERMINISTIC half of /collect-data. Selection order, the "why", and the
// progress count are computed here (hard rule 8: the CLI owns numbers, never the
// LLM). The slash command reads this, runs the conversation, and calls `confirm`.

const STEP_LABEL = {
  '05-monetization': 'монетизация',
  '04-scoring': 'скоринг фич',
  '03-roadmap': 'роадмап',
  '02-framework': 'метрики/North Star',
  '01-research': 'ресёрч',
};

function dependsSet(run) {
  // The one hard signal of "this number gates the verdict".
  const f = stepFile(run, '05-monetization');
  if (!fs.existsSync(f)) return new Set();
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    return new Set(d.dependsOnClaims || []);
  } catch {
    return new Set();
  }
}

function stepWeight(claim) {
  return Math.max(0, ...claim.usedIn.map((s) => STEP_DECISION_WEIGHT[s] ?? 0));
}

function isNullGap(claim) {
  return claim.value === null || claim.value === undefined || claim.value === '';
}

function impactOf(claim, deps) {
  // verdict gate floats to the top; then step weight; then breadth of use; then
  // a small bump for true null gaps (they render as [→ Validate] holes today).
  const gate = deps.has(claim.id) ? 100 : 0;
  return gate + stepWeight(claim) * 10 + claim.usedIn.length + (isNullGap(claim) ? 0.5 : 0);
}

function whyOf(claim, deps) {
  const parts = [];
  if (deps.has(claim.id)) parts.push('гейтит вердикт монетизации');
  const named = claim.usedIn
    .filter((s) => (STEP_DECISION_WEIGHT[s] ?? 0) > 0)
    .map((s) => STEP_LABEL[s] || s);
  if (named.length) parts.push('используется в: ' + named.join(', '));
  if (!parts.length) parts.push('описательный контекст');
  return parts.join(' · ');
}

// V3.1: a claim is collectable from a client only if it is an internal metric.
// Absent kind is treated as benchmark (safe default — never asked of a client).
function isCollectable(claim) {
  return (claim.kind || 'benchmark') === 'metric';
}

function buildCollectionPlan(run) {
  const ledger = ingestLedger(run);
  const eff = ledger.effective();
  const deps = dependsSet(run);

  // Denominator and queue are now defined by kind=metric, not by structural weight.
  // Recommendations (our proposals/targets) and benchmarks (public/derived facts) are
  // never surfaced as questions to a client, so they leave the collection queue entirely.
  const metrics = eff.filter(isCollectable);
  const collected = metrics.filter((c) => c.status === 'confirmed' || c.status === 'contradicted');

  const queue = metrics
    .filter((c) => c.status === 'estimate' || c.status === 'public') // unconfirmed metrics only
    .map((c) => ({
      id: c.id,
      statement: c.statement,
      status: c.status,
      value: c.value,
      unit: c.unit || '',
      kind: c.kind || 'benchmark',
      gatesVerdict: deps.has(c.id),
      why: whyOf(c, deps),
      collectionHint: c.collectionHint || null,
      impact: impactOf(c, deps),
    }))
    .sort((a, b) => b.impact - a.impact);

  return { progress: { collected: collected.length, total: metrics.length }, queue };
}

function cmdCollectPlan(args) {
  const run = resolveRun(args);
  const plan = buildCollectionPlan(run);

  if ('json' in args) {
    console.log(JSON.stringify({ run: path.relative(ROOT, run), ...plan }, null, 2));
    return;
  }

  console.log(`COLLECT-DATA PLAN — ${path.relative(ROOT, run)}\n`);
  console.log(`Progress: ${plan.progress.collected} of ${plan.progress.total} internal metrics collected\n`);
  if (!plan.queue.length) {
    console.log('Nothing left to collect — every internal metric is confirmed.');
    return;
  }
  console.log('Metrics to collect from the client (highest impact first; the agent asks one at a time):');
  plan.queue.forEach((c, i) => {
    const cur = isNullGap(c) ? '(no value yet)' : `${c.value}${c.unit}`;
    const gate = c.gatesVerdict ? ' *gates verdict' : '';
    console.log(`  ${i + 1}. ${c.id} — ${c.statement}${gate}`);
    console.log(`        current: ${cur} (${c.status})`);
    console.log(`        why: ${c.why}`);
    console.log(`        where: ${c.collectionHint || '(no hint — add collectionHint in the step)'}`);
  });
  console.log('\nConfirm a value with:');
  console.log('  node strategy/cli.js confirm <id> --value V --source "where it came from"');
}

// ---------- V3.2: author notes ----------
// Notes are the author's voice layered on the strategy. The CLI owns the write
// (notes.json); /s7-synthesis weaves them into the body and records wovenNotes.

// Which notes.json entries have NOT yet been woven by the last s7 run.
function notesStaleness(run) {
  const notes = notesLib.load(run);
  if (!notes.length) return { notes, unwoven: [] };
  let woven = [];
  const s7 = stepFile(run, '07-synthesis');
  if (fs.existsSync(s7)) {
    try { woven = JSON.parse(fs.readFileSync(s7, 'utf8')).wovenNotes || []; } catch { woven = []; }
  }
  const wovenSet = new Set(woven);
  const unwoven = notes.filter((n) => !wovenSet.has(n.id));
  return { notes, unwoven };
}

function cmdNote(args) {
  const sub = args._[1];
  const run = resolveRun(args);

  if (sub === 'list' || !sub) {
    const { notes, unwoven } = notesStaleness(run);
    if (!notes.length) { console.log('No author notes yet. Add one with: note add --anchor <section|claim> --body "..."'); return; }
    const unwovenSet = new Set(unwoven.map((n) => n.id));
    console.log(`Author notes (${notes.length}) — ${path.relative(ROOT, run)}\n`);
    notes.forEach((n) => {
      const flag = unwovenSet.has(n.id) ? ' [NOT YET WOVEN — re-run /s7-synthesis]' : '';
      console.log(`  ${n.id} @${n.anchor}${n.kind ? ' (' + n.kind + ')' : ''}${flag}`);
      console.log(`     ${n.body}`);
      for (const c of n.claims || []) {
        console.log(`     · fact ${c.id} = ${c.value}${c.unit ? ' ' + c.unit : ''} (${c.status}/${c.kind}) — ${c.source}`);
      }
    });
    return;
  }

  if (sub === 'add') {
    if (!args.anchor || !args.body) {
      console.error('Usage: note add --anchor <section|claim> [--kind context|rationale|risk|caveat] --body "..." [--claim "id | statement | value | unit | source | kind"]... [--run <run>]');
      process.exit(1);
    }
    // --claim is repeatable; parseArgs keeps only the last, so collect from raw argv.
    const rawArgv = process.argv.slice(2);
    const claimSpecs = rawArgv.filter((a, i) => rawArgv[i - 1] === '--claim');
    let claims = [];
    try {
      claims = claimSpecs.map((s) => notesLib.parseClaimSpec(s));
    } catch (e) {
      console.error(`Bad --claim: ${e.message}`);
      process.exit(1);
    }
    // Validate the note (incl. its claims) before writing — same contract as steps.
    const shapeErrors = validateNotes([{ id: 'tmp', anchor: args.anchor, kind: args.kind || null, body: args.body, ...(claims.length ? { claims } : {}) }]);
    if (shapeErrors.length) {
      console.error(`Cannot add note:\n  ${shapeErrors.join('\n  ')}`);
      process.exit(1);
    }
    // Soft anchor check: warn if it's neither a known section nor a declared claim.
    const claimIds = new Set(ingestLedger(run).effective().map((c) => c.id));
    if (!notesLib.ANCHOR_SECTIONS.includes(args.anchor) && !claimIds.has(args.anchor)) {
      console.log(`  ⚠ anchor "${args.anchor}" is neither a known section (${notesLib.ANCHOR_SECTIONS.join(', ')}) nor a claim id — saving anyway; s7 will place it as best it can.`);
    }
    const note = notesLib.add(run, { anchor: args.anchor, kind: args.kind || null, body: args.body, claims });
    const factNote = claims.length ? ` + ${claims.length} fact claim(s): ${claims.map((c) => c.id).join(', ')}` : '';
    console.log(`Added ${note.id} @${note.anchor}${note.kind ? ' (' + note.kind + ')' : ''}${factNote}. Re-run /s7-synthesis to weave it into the body.`);
    return;
  }

  if (sub === 'remove') {
    if (!args.id) { console.error('Usage: note remove --id <id> [--run <run>]'); process.exit(1); }
    const removed = notesLib.remove(run, args.id);
    console.log(removed ? `Removed ${removed.id} @${removed.anchor}. Re-run /s7-synthesis.` : `No note with id "${args.id}".`);
    return;
  }

  console.error('note subcommands: list | add | remove');
  process.exit(1);
}

function cmdDemo() {
  const fixtures = require('./fixtures');
  const run = path.join(OUT, `demo-${Date.now()}`);
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'intake.json'), JSON.stringify(fixtures.intake, null, 2));
  for (const step of STEP_ORDER) {
    fs.writeFileSync(stepFile(run, step), JSON.stringify(fixtures[step], null, 2));
  }
  console.log(`Demo run created: ${path.relative(ROOT, run)}`);
  console.log('Now: node strategy/cli.js render');
}

// ---------- main ----------
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
({
  init: cmdInit,
  status: cmdStatus,
  claims: cmdClaims,
  confirm: cmdConfirm,
  render: cmdRender,
  demo: cmdDemo,
  'collect-plan': cmdCollectPlan,
  note: cmdNote,
}[cmd] || (() => {
  console.log('Commands: init | status | claims | confirm | render | collect-plan | note | demo');
}))(args);
