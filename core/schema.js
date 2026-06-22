// core/schema.js — lightweight step-output validation. No deps.
// Encodes the lessons of the BotConversa review as hard schema rules:
//   P1-7: every initiative MUST have successMetric and owner — or be marked exploratory.
//   P0-6: scoring MUST expose its rubric (criteria, weights, per-criterion scores).
//   P0-4: monetization MUST include sensitivity rows and a break-even, and its verdict
//         must be 'conditional' unless the claims it depends on are confirmed.

function err(path, msg) {
  return `${path}: ${msg}`;
}

function req(obj, key, type, path, errors) {
  const v = obj?.[key];
  if (v === undefined || v === null) {
    errors.push(err(`${path}.${key}`, 'missing'));
    return undefined;
  }
  if (type === 'array' && !Array.isArray(v)) errors.push(err(`${path}.${key}`, 'must be array'));
  else if (type !== 'array' && typeof v !== type) errors.push(err(`${path}.${key}`, `must be ${type}`));
  return v;
}

function validateClaims(data, path, errors) {
  for (const [i, c] of (data.claims || []).entries()) {
    req(c, 'id', 'string', `${path}.claims[${i}]`, errors);
    const st = req(c, 'statement', 'string', `${path}.claims[${i}]`, errors);
    // THE VALUE CONTRACT (lesson of run botconversa-2026-06-112123):
    // inline {{claim:id}} tokens need an atomic value; a number buried inside a
    // sentence-length statement renders as "?" everywhere it is cited.
    if (st && st.length > 160)
      errors.push(err(`${path}.claims[${i}]`, `statement is ${st.length} chars — must be a short metric description (≤160), not a sentence carrying the number; put the number in "value"`));
    if (c.status === 'public' && (c.value === null || c.value === undefined || c.value === ''))
      errors.push(err(`${path}.claims[${i}]`, `status "public" requires a non-null atomic value — a verified source means a verified number; extract it from the statement into "value"`));
    // V3: collectionHint is OPTIONAL (back-compat with V1/V2 runs), but if present it
    // must be a short pointer to where the number lives, not a paragraph. A real metric
    // hint may carry a formula and a public cross-check anchor, so the cap is generous
    // but still bounded — it is a pointer, not prose.
    if (c.collectionHint !== undefined && c.collectionHint !== null) {
      if (typeof c.collectionHint !== 'string')
        errors.push(err(`${path}.claims[${i}].collectionHint`, 'must be a string'));
      else if (c.collectionHint.length > 220)
        errors.push(err(`${path}.claims[${i}].collectionHint`, `is ${c.collectionHint.length} chars — keep it a "where to find it" pointer (≤220), not prose`));
    }
    // V3.1: kind separates what the data-collection dialogue may ASK a client for.
    // OPTIONAL and back-compat; absence is treated as "benchmark" downstream (the safe
    // default — an untagged claim is never surfaced as a question to a client).
    //   metric         — an internal company number the agent should collect in dialogue
    //   recommendation — our proposal/target; confirmed by client agreement or our revision
    //   benchmark      — public/market/derived fact; confirmed by research, never asked of a client
    if (c.kind !== undefined && c.kind !== null && !['metric', 'recommendation', 'benchmark'].includes(c.kind))
      errors.push(err(`${path}.claims[${i}].kind`, `must be one of metric|recommendation|benchmark (got "${c.kind}")`));
  }
}

const validators = {
  '01-research': (d) => {
    const e = [];
    const comps = req(d, 'competitors', 'array', '01', e) || [];
    comps.forEach((c, i) => {
      req(c, 'name', 'string', `01.competitors[${i}]`, e);
      req(c, 'positioning', 'string', `01.competitors[${i}]`, e);
      if (c.pricing && !c.pricingVerifiedDate)
        e.push(err(`01.competitors[${i}]`, 'pricing present but pricingVerifiedDate missing — competitor prices must carry a verification date'));
    });
    req(d, 'vocSignals', 'array', '01', e);
    validateClaims(d, '01', e);
    return e;
  },

  '02-framework': (d) => {
    const e = [];
    const ns = req(d, 'northStar', 'object', '02', e);
    if (ns) {
      req(ns, 'name', 'string', '02.northStar', e);
      req(ns, 'definition', 'string', '02.northStar', e);
      req(ns, 'gamingRisks', 'array', '02.northStar', e); // how could this metric be gamed?
    }
    req(d, 'metricTree', 'object', '02', e);
    req(d, 'firstDashboard', 'array', '02', e);
    validateClaims(d, '02', e);
    return e;
  },

  '03-roadmap': (d) => {
    const e = [];
    const horizons = req(d, 'horizons', 'array', '03', e) || [];
    horizons.forEach((h, hi) => {
      req(h, 'name', 'string', `03.h[${hi}]`, e);
      req(h, 'objective', 'string', `03.h[${hi}]`, e);
      (h.initiatives || []).forEach((init, ii) => {
        const p = `03.h[${hi}].init[${ii}]`;
        req(init, 'name', 'string', p, e);
        req(init, 'problem', 'string', p, e);
        if (!init.exploratory) {
          if (!init.successMetric) e.push(err(p, 'successMetric required (or set exploratory: true)'));
          if (!init.owner) e.push(err(p, 'owner required — a roadmap without owners is a feature catalog'));
        }
      });
    });
    validateClaims(d, '03', e);
    return e;
  },

  '04-scoring': (d) => {
    const e = [];
    const rubric = req(d, 'rubric', 'object', '04', e);
    if (rubric) {
      const crits = req(rubric, 'criteria', 'array', '04.rubric', e) || [];
      crits.forEach((c, i) => {
        req(c, 'name', 'string', `04.rubric.criteria[${i}]`, e);
        req(c, 'weight', 'number', `04.rubric.criteria[${i}]`, e);
      });
    }
    const feats = req(d, 'features', 'array', '04', e) || [];
    feats.forEach((f, i) => {
      req(f, 'name', 'string', `04.features[${i}]`, e);
      const scores = req(f, 'scores', 'object', `04.features[${i}]`, e);
      if (scores && rubric?.criteria) {
        for (const c of rubric.criteria) {
          if (scores[c.name] === undefined)
            e.push(err(`04.features[${i}].scores`, `missing score for criterion "${c.name}" — naked totals are theater, every criterion must be scored`));
        }
      }
    });
    validateClaims(d, '04', e);
    return e;
  },

  '05-monetization': (d) => {
    const e = [];
    req(d, 'recommendedModel', 'string', '05', e);
    req(d, 'alternativesConsidered', 'array', '05', e); // pricing must be a choice, not a template fill
    req(d, 'sensitivityTable', 'array', '05', e);
    if (d.sensitivityTable && !d.breakEven)
      e.push(err('05', 'breakEven missing — sensitivity without a marked break-even hides the cannibalization question'));
    const verdict = req(d, 'verdict', 'string', '05', e);
    if (verdict && !['green', 'conditional', 'no'].includes(verdict))
      e.push(err('05.verdict', 'must be green | conditional | no'));
    if (verdict === 'green' && (d.dependsOnClaims || []).length > 0)
      e.push(err('05.verdict', 'cannot be "green" while dependsOnClaims is non-empty — a verdict cannot pass its own decision gate before the data exists'));
    // V4.1: when the model bills on an EARNED OUTCOME (outcome/hybrid), the billing unit is a
    // thing the vendor both measures and is paid on — so it owes an integrity policy. This is
    // the §7.7 discipline: a billed outcome must be externally/end-user verifiable, disputable,
    // reversible, rate-limited, and governed against the conflict of interest. It is a COUNTING
    // and GOVERNANCE ruleset, NOT new product scope — deeper verification is deferred to planned
    // integrations. Required only when billingBasis says outcome is billed; flat/usage skip it.
    if (d.billingBasis !== undefined && !['flat', 'usage', 'outcome', 'hybrid'].includes(d.billingBasis))
      e.push(err('05.billingBasis', 'must be flat | usage | outcome | hybrid'));
    if (['outcome', 'hybrid'].includes(d.billingBasis)) {
      const ip = req(d, 'integrityPolicy', 'object', '05', e);
      if (ip) {
        req(ip, 'verifiableEvent', 'string', '05.integrityPolicy', e); // what externally/end-user-confirmed signal counts a billable outcome (not platform-asserted)
        req(ip, 'disputePolicy', 'string', '05.integrityPolicy', e);   // client can dispute a charge; window + resolution
        req(ip, 'antiGaming', 'string', '05.integrityPolicy', e);      // reversal + rate-limit so a misconfigured flow can't inflate the bill
        req(ip, 'governance', 'string', '05.integrityPolicy', e);      // who may change the billing-unit definition; conflict-of-interest acknowledgment
      }
    }
    validateClaims(d, '05', e);
    return e;
  },

  '06-review': (d) => {
    const e = [];
    const p0 = req(d, 'p0', 'array', '06', e) || [];
    p0.forEach((iss, i) => {
      req(iss, 'issue', 'string', `06.p0[${i}]`, e);
      req(iss, 'resolution', 'string', `06.p0[${i}]`, e); // every P0 is either fixed or declared
      if (iss.resolution && !['fixed', 'declared'].includes(iss.status || ''))
        e.push(err(`06.p0[${i}]`, 'status must be "fixed" or "declared" — P0s do not get silently shipped'));
    });
    req(d, 'p1', 'array', '06', e);
    return e;
  },

  '07-synthesis': (d) => {
    const e = [];
    req(d, 'tldr', 'string', '07', e);
    const sections = req(d, 'sections', 'array', '07', e) || [];
    sections.forEach((s, i) => {
      req(s, 'title', 'string', `07.sections[${i}]`, e);
      req(s, 'paragraphs', 'array', `07.sections[${i}]`, e);
    });
    // Numbers discipline: synthesis text references claims as {{claim:id}} tokens,
    // resolved by the renderer from the ledger. Raw invented numbers are the enemy.
    // V3.2: wovenNotes (optional) records which author-note ids s7 incorporated, so
    // render can detect notes.json entries that haven't been woven yet (staleness).
    if (d.wovenNotes !== undefined && !Array.isArray(d.wovenNotes))
      e.push(err('07.wovenNotes', 'must be an array of note ids'));
    return e;
  },
};

// V3.2: validate the author-note overlay (notes.json). Anchor/body are required;
// kind is an optional voice tag. Anchor validity (a real section or claim) is checked
// at weave/render time with the run in hand, not here — schema stays context-free.
const NOTE_KINDS = ['context', 'rationale', 'risk', 'caveat'];
function validateNotes(notes) {
  const e = [];
  if (!Array.isArray(notes)) return ['notes.json: must be an array'];
  const seen = new Set();
  notes.forEach((n, i) => {
    const p = `notes[${i}]`;
    req(n, 'id', 'string', p, e);
    if (n.id && seen.has(n.id)) e.push(err(`${p}.id`, `duplicate id "${n.id}"`));
    if (n.id) seen.add(n.id);
    const a = req(n, 'anchor', 'string', p, e);
    if (a !== undefined && typeof a === 'string' && a.trim() === '')
      e.push(err(`${p}.anchor`, 'must be a non-empty section slug or claim id'));
    const b = req(n, 'body', 'string', p, e);
    if (b !== undefined && typeof b === 'string' && b.trim() === '')
      e.push(err(`${p}.body`, 'must be non-empty'));
    if (n.kind !== undefined && n.kind !== null && !NOTE_KINDS.includes(n.kind))
      e.push(err(`${p}.kind`, `must be one of ${NOTE_KINDS.join('|')} (got "${n.kind}")`));
    // V3.3: a note may carry facts (the numbers its point rests on). Validate them with
    // the same contract as step claims — they become real ledger claims at ingest.
    if (n.claims !== undefined) {
      if (!Array.isArray(n.claims)) e.push(err(`${p}.claims`, 'must be an array'));
      else validateClaims({ claims: n.claims }, p, e);
    }
  });
  return e;
}

// V4.0: corporate strategy overlay (00-corporate.json). The product strategy is
// subordinate to the company's goal; this is the prism every downstream step reads.
// It is an INPUT overlay (like intake.json), not a step in STEP_ORDER — it carries no
// claims and is not rendered as a section; it shapes s2–s7 by being read by them.
const CORPORATE_GOALS = ['profitability', 'market-share', 'new-markets', 'vertical-software-contour', 'exit', 'survival', 'other'];
function validateCorporate(data) {
  const e = [];
  if (!data || typeof data !== 'object') return ['00-corporate.json: must be an object'];
  const g = req(data, 'primaryGoal', 'string', '00', e);
  if (g !== undefined && typeof g === 'string' && !CORPORATE_GOALS.includes(g))
    e.push(err('00.primaryGoal', `unusual goal "${g}" — expected one of ${CORPORATE_GOALS.join('|')} (use "other" + rationale if genuinely different)`));
  req(data, 'rationale', 'string', '00', e); // why this goal — esp. if derived or "no stated strategy, agreed with founders"
  // optional shape, validated only if present
  if (data.priorities !== undefined && !Array.isArray(data.priorities)) e.push(err('00.priorities', 'must be an array (ordered)'));
  if (data.antiGoals !== undefined && !Array.isArray(data.antiGoals)) e.push(err('00.antiGoals', 'must be an array'));
  if (data.source !== undefined && !['intake', 'founder-dialogue', 'derived'].includes(data.source))
    e.push(err('00.source', 'must be intake|founder-dialogue|derived'));
  return e;
}



function validate(stepName, data) {
  const v = validators[stepName];
  if (!v) return [`no validator for step ${stepName}`];
  return v(data);
}

const STEP_ORDER = [
  '01-research', '02-framework', '03-roadmap',
  '04-scoring', '05-monetization', '06-review', '07-synthesis',
];

// V3: how decision-bearing each step is. Used to rank the data-collection queue
// by IMPACT — a number a verdict depends on is worth collecting before a
// descriptive figure. This is a structural proxy for "does this change a
// conclusion", not a semantic judgement; the one hard signal of "gates the
// verdict" is 05-monetization.dependsOnClaims, scored on top of this.
const STEP_DECISION_WEIGHT = {
  '05-monetization': 5, // gates the monetization verdict
  '04-scoring': 4,      // gates feature ranking
  '03-roadmap': 3,      // gates initiative success metrics
  '02-framework': 2,    // North Star / targets
  '01-research': 1,     // descriptive context
  '06-review': 0,       // derivative — adds no collection priority
  '07-synthesis': 0,    // derivative
};

// ---- EVAL AGENT VALIDATORS ----
// Hard rule 8: confidence is set by CLI from N — validator enforces consistency.

const VALID_EXIT_STATES = new Set(['flow-selected', 'abandoned', 'error', 'max-turns-reached']);
const VALID_CONFIDENCE  = new Set(['smoke', 'statistical']);
const VALID_CATEGORIES  = new Set(['happy-path', 'edge-case', 'adversarial']);
const VALID_ROUTING     = new Set(['llm', 'rules-primary']);

const evalValidators = {
  // e1: intake.json (feature context + case set)
  e1: (d) => {
    const e = [];
    req(d, 'feature', 'string', 'e1', e);
    req(d, 'rubricFile', 'string', 'e1', e);
    req(d, 'maxTurnsPerCase', 'number', 'e1', e);
    req(d, 'userSimulatorModel', 'string', 'e1', e);

    const variants = req(d, 'variants', 'array', 'e1', e) || [];
    if (variants.length === 0) e.push(err('e1.variants', 'must have ≥1 variant'));
    variants.forEach((v, i) => {
      req(v, 'id',            'string', `e1.variants[${i}]`, e);
      req(v, 'model',         'string', `e1.variants[${i}]`, e);
      req(v, 'promptVariantId','string', `e1.variants[${i}]`, e);
    });

    const sc = req(d, 'successCriteria', 'array', 'e1', e) || [];
    if (sc.length === 0) e.push(err('e1.successCriteria', 'must have ≥1 entry'));

    const cases = d.cases?.cases;
    if (!Array.isArray(cases)) {
      e.push(err('e1.cases.cases', 'missing or not an array — run /e1-intake to generate cases'));
    } else if (cases.length === 0) {
      e.push(err('e1.cases.cases', 'empty — run /e1-intake to generate cases'));
    } else {
      const ids = new Set();
      cases.forEach((c, i) => {
        const p = `e1.cases[${i}]`;
        const id = req(c, 'id', 'string', p, e);
        if (id) { if (ids.has(id)) e.push(err(p, `duplicate id "${id}"`)); ids.add(id); }
        req(c, 'label', 'string', p, e);
        if (!VALID_CATEGORIES.has(c.category))
          e.push(err(`${p}.category`, 'must be happy-path | edge-case | adversarial'));
        const eb = req(c, 'expectedBehavior', 'string', p, e);
        if (eb && eb.length < 20)
          e.push(err(`${p}.expectedBehavior`, `too short (${eb.length} chars) — must be ≥20 chars`));
        if (c.category === 'adversarial' && !c.expectedNonBehavior)
          e.push(err(p, 'adversarial cases require expectedNonBehavior'));
        if (c.routing && !VALID_ROUTING.has(c.routing))
          e.push(err(`${p}.routing`, 'must be "llm" or "rules-primary"'));
        if (c.routing === 'rules-primary' && !c.expectedNonBehavior)
          e.push(err(p, 'rules-primary cases require expectedNonBehavior'));
      });
    }
    return e;
  },

  // e2: calibration.json (rubric + human labels + agreement)
  e2: (d) => {
    const e = [];
    const cases = req(d, 'calibrationCases', 'array', 'e2', e) || [];
    const n = cases.length;
    req(d, 'nCases', 'number', 'e2', e);
    if (d.nCases !== undefined && d.nCases !== n)
      e.push(err('e2.nCases', `nCases=${d.nCases} but calibrationCases has ${n} entries`));
    if (n < 5)
      e.push(err('e2.calibrationCases', `must have ≥5 cases (found ${n}) — 5 for smoke test, ≥10 for statistical`));

    // Hard rule 8: confidence is derived from N
    const conf = d.confidence;
    if (!VALID_CONFIDENCE.has(conf))
      e.push(err('e2.confidence', 'must be "smoke" or "statistical"'));
    if (conf === 'statistical' && n < 10)
      e.push(err('e2.confidence', `cannot be "statistical" when nCases=${n} — requires ≥10 (hard rule 8)`));
    if (conf === 'smoke' && n >= 10)
      e.push(err('e2.confidence', `should be "statistical" when nCases=${n} ≥ 10 (hard rule 8)`));

    // accept proxyLabels as rename of humanScores (cross-model calibration uses proxyLabels)
    if (!d.humanScores && !d.proxyLabels)
      e.push(err('e2.humanScores', 'missing (or proxyLabels — accepted alias for cross-model calibration)'));
    req(d, 'llmScores',   'object', 'e2', e);
    req(d, 'agreement',   'object', 'e2', e);
    const passed = req(d, 'calibrationPassed', 'boolean', 'e2', e);
    if (passed === false && (!d.failingCriteria || d.failingCriteria.length === 0))
      e.push(err('e2.failingCriteria', 'must list failing criteria when calibrationPassed is false'));
    return e;
  },

  // e3: transcripts/index.json (simulator output index)
  e3: (d) => {
    const e = [];
    req(d, 'runId', 'string', 'e3', e);
    const entries = req(d, 'entries', 'array', 'e3', e) || [];
    if (entries.length === 0) e.push(err('e3.entries', 'empty — no transcripts written yet'));
    entries.forEach((entry, i) => {
      const p = `e3.entries[${i}]`;
      req(entry, 'caseId',    'string', p, e);
      req(entry, 'variantId', 'string', p, e);
      req(entry, 'file',      'string', p, e);
      req(entry, 'sha256',    'string', p, e);
      req(entry, 'latencyMs', 'number', p, e);
      req(entry, 'costUSD',   'number', p, e);
      if (!VALID_EXIT_STATES.has(entry.exitState))
        e.push(err(`${p}.exitState`, 'must be flow-selected | abandoned | error | max-turns-reached'));
    });
    return e;
  },

  // e4: 04-report.json (judgments + frontier table)
  e4: (d) => {
    const e = [];
    req(d, 'runId',        'string', 'e4', e);
    req(d, 'feature',      'string', 'e4', e);
    req(d, 'calibrationRef','string','e4', e);

    const conf = d.calibrationConfidence;
    if (!VALID_CONFIDENCE.has(conf))
      e.push(err('e4.calibrationConfidence', 'must be "smoke" or "statistical"'));

    const judgments = req(d, 'judgments', 'array', 'e4', e) || [];
    if (judgments.length === 0) e.push(err('e4.judgments', 'empty — run /e4-judge'));
    judgments.forEach((j, i) => {
      const p = `e4.judgments[${i}]`;
      req(j, 'caseId',         'string', p, e);
      req(j, 'variantId',      'string', p, e);
      req(j, 'transcriptFile', 'string', p, e);
      req(j, 'transcriptHash', 'string', p, e);
      req(j, 'scores',         'object', p, e);
      const v = j.passFailVerdict;
      if (v && !['pass', 'fail', 'marginal'].includes(v))
        e.push(err(`${p}.passFailVerdict`, 'must be pass | fail | marginal'));
      if (v === 'fail' && !j.passFailRationale)
        e.push(err(p, 'passFailRationale required when verdict is fail'));
    });

    req(d, 'frontierTable', 'array', 'e4', e);
    const winner = req(d, 'winner', 'object', 'e4', e);
    if (winner) req(winner, 'quality', 'string', 'e4.winner', e);
    return e;
  },
};

function validateEval(stepKey, data) {
  const v = evalValidators[stepKey];
  if (!v) return [`no eval validator for step "${stepKey}"`];
  return v(data);
}

const EVAL_STEP_ORDER = ['e1', 'e2', 'e3', 'e4'];

module.exports = { validate, validateNotes, validateCorporate, STEP_ORDER, STEP_DECISION_WEIGHT, validateEval, EVAL_STEP_ORDER };
