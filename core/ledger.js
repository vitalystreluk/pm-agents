// core/ledger.js — Claim Ledger, the shared spine of all three agents.
// Principle: AI conclusions without traceability to data are opinions.
//
// Design:
//   - Steps DECLARE claims inside their output JSON (claims: [...]).
//   - claims.json is REGENERATED from step files on every ingest — never hand-edited.
//   - confirmations.json is a persistent overlay written by `confirm` (V2 internal data).
//   - Effective state = claims ⊕ confirmations. The DOCX is rendered from this, never edited.
// This makes "page 1 says no data / page 11 says confirmed" impossible by construction.

const fs = require('fs');
const path = require('path');

const STATUSES = ['estimate', 'public', 'confirmed', 'contradicted'];

class Ledger {
  constructor(runDir) {
    this.runDir = runDir;
    this.claims = [];        // regenerated from steps
    this.confirmations = {}; // id -> {value, source, date}
    this._loadConfirmations();
  }

  _loadConfirmations() {
    const f = path.join(this.runDir, 'confirmations.json');
    if (fs.existsSync(f)) this.confirmations = JSON.parse(fs.readFileSync(f, 'utf8'));
  }

  /** Rebuild claims from all step output files. Idempotent. */
  ingest(stepFiles) {
    this.claims = [];
    const seen = new Map();
    for (const file of stepFiles) {
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const stepName = path.basename(file, '.json');
      for (const c of data.claims || []) {
        if (!c.id || !c.statement) continue;
        if (seen.has(c.id)) {
          // same claim referenced by another step → merge usedIn
          const prev = seen.get(c.id);
          prev.usedIn = [...new Set([...prev.usedIn, ...(c.usedIn || []), stepName])];
          // keep the first non-empty collectionHint we saw
          if (!prev.collectionHint && c.collectionHint) prev.collectionHint = c.collectionHint;
          // a more specific kind (metric/recommendation) wins over an absent/benchmark default
          if (c.kind && (!prev.kind || prev.kind === 'benchmark')) prev.kind = c.kind;
        } else {
          const claim = {
            id: c.id,
            statement: c.statement,
            value: c.value ?? null,
            unit: c.unit ?? null,
            source: c.source || 'estimate',
            status: c.status === 'public' ? 'public' : 'estimate',
            usedIn: [...new Set([...(c.usedIn || []), stepName])],
            collectionHint: c.collectionHint ?? null, // V3: where this number is usually found
            kind: c.kind ?? null, // V3.1: metric|recommendation|benchmark (null → treated as benchmark)
          };
          seen.set(c.id, claim);
          this.claims.push(claim);
        }
      }
    }
    fs.writeFileSync(path.join(this.runDir, 'claims.json'), JSON.stringify(this.claims, null, 2));
    return this.claims;
  }

  loadClaims() {
    const f = path.join(this.runDir, 'claims.json');
    if (fs.existsSync(f)) this.claims = JSON.parse(fs.readFileSync(f, 'utf8'));
    return this.claims;
  }

  /** Effective view: confirmations overlaid on declared claims. */
  effective() {
    return this.claims.map((c) => {
      const conf = this.confirmations[c.id];
      if (!conf) return { ...c };
      const contradicted = c.value !== null && String(c.value) !== String(conf.value);
      return {
        ...c,
        status: contradicted ? 'contradicted' : 'confirmed',
        confirmedValue: conf.value,
        confirmedSource: conf.source,
        confirmedDate: conf.date,
      };
    });
  }

  get(id) {
    return this.effective().find((c) => c.id === id) || null;
  }

  /**
   * V2 entry point. Records confirmation, returns delta report:
   * { claim, contradicted, affectedSteps } — caller re-runs affected steps + synthesis, then re-renders.
   */
  confirm(id, { value, source, date }) {
    this.loadClaims();
    const base = this.claims.find((c) => c.id === id);
    if (!base) {
      const ids = this.claims.map((c) => c.id).join(', ') || '(none — run ingest first)';
      throw new Error(`Unknown claim id "${id}". Known ids: ${ids}`);
    }
    this.confirmations[id] = {
      value,
      source: source || 'internal data',
      date: date || new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(
      path.join(this.runDir, 'confirmations.json'),
      JSON.stringify(this.confirmations, null, 2)
    );
    const eff = this.get(id);
    return {
      claim: eff,
      contradicted: eff.status === 'contradicted',
      affectedSteps: eff.usedIn,
    };
  }

  /** Unit join: "600"+"BRL/month" → "600 BRL/month", but "55"+"%" → "55%". */
  _vu(v, u) {
    if (!u) return `${v}`;
    return /^[%\u00B0\/]/.test(u) ? `${v}${u}` : `${v} ${u}`;
  }

  /** Inline marker rendered inside document text. */
  marker(id) {
    const c = this.get(id);
    if (!c) return `[UNKNOWN CLAIM: ${id}]`;
    const u = c.unit || '';
    const hasVal = c.value !== null && c.value !== undefined && c.value !== '';
    if (c.status === 'confirmed')
      return `${this._vu(c.confirmedValue, u)} [confirmed — ${c.confirmedSource}, ${c.confirmedDate}]`;
    if (c.status === 'contradicted')
      return `${this._vu(c.confirmedValue, u)} [REVISED from estimate ${hasVal ? this._vu(c.value, u) : '?'} — ${c.confirmedSource}; re-check dependent conclusions]`;
    if (c.status === 'public')
      return hasVal
        ? `${this._vu(c.value, u)} [source: ${c.source} — re-verify before external use]`
        : `[→ Validate value: ${c.statement} | source: ${c.source}]`;
    return hasVal
      ? `${this._vu(c.value, u)} [→ Validate: ${c.statement}]`
      : `[→ Validate: ${c.statement}]`;
  }

  unconfirmed() {
    return this.effective().filter((c) => c.status === 'estimate' || c.status === 'public');
  }
}

module.exports = { Ledger, STATUSES };
