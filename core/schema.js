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
    return e;
  },
};

function validate(stepName, data) {
  const v = validators[stepName];
  if (!v) return [`no validator for step ${stepName}`];
  return v(data);
}

const STEP_ORDER = [
  '01-research', '02-framework', '03-roadmap',
  '04-scoring', '05-monetization', '06-review', '07-synthesis',
];

module.exports = { validate, STEP_ORDER };
