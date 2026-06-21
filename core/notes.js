// core/notes.js — author-note overlay (V3.2).
//
// Notes are the author's VOICE layered on top of the strategy: context, rationale,
// caveats, risk flags — the "why I chose this" / "this is contested" commentary that
// used to live in a block at the top of the document because the pipeline had no place
// for it in the body. They live in notes.json (an overlay parallel to confirmations.json)
// so a re-run of /s7-synthesis never wipes them; s7 reads them and weaves each into the
// prose of its anchored section.
//
// A note is NOT a way to change a conclusion. Critique that changes a conclusion goes
// through /s6-review (or a step edit) into state. The routing decision is the author's,
// never inferred here.
//
// Shape: { id, anchor, kind, body }
//   anchor — a section slug (see ANCHOR_SECTIONS) OR a claim id (e.g. "r01"); s7 weaves
//            a claim-anchored note next to where that claim is discussed.
//   kind   — optional voice tag: context | rationale | risk | caveat
//   body   — the author's raw text; s7 may rephrase it when weaving.

const fs = require('fs');
const path = require('path');

const ANCHOR_SECTIONS = [
  'tldr', 'market', 'customer', 'north-star',
  'roadmap', 'monetization', 'what-needs-true',
];
const NOTE_KINDS = ['context', 'rationale', 'risk', 'caveat'];

function notesPath(runDir) {
  return path.join(runDir, 'notes.json');
}

function load(runDir) {
  const f = notesPath(runDir);
  if (!fs.existsSync(f)) return [];
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  return Array.isArray(data) ? data : [];
}

function save(runDir, notes) {
  // ensure_ascii OFF — author voice may be Cyrillic/PT and must stay readable
  fs.writeFileSync(notesPath(runDir), JSON.stringify(notes, null, 2) + '\n', 'utf8');
}

function nextId(notes) {
  let n = notes.length + 1;
  const taken = new Set(notes.map((x) => x.id));
  while (taken.has(`n${n}`)) n++;
  return `n${n}`;
}

// V3.3: parse a `--claim` spec "id | statement | value | unit | source | kind" into a
// claim object. A note can carry facts (the numbers its point rests on); they live in
// the author layer, not in a step's output. status is derived: a sourced benchmark is
// public, everything else is an estimate until confirmed.
function parseClaimSpec(spec) {
  const parts = spec.split('|').map((s) => s.trim());
  if (parts.length < 3) throw new Error(`--claim needs at least "id | statement | value": got "${spec}"`);
  const [id, statement, rawValue, unit = null, source = null, kind = null] = parts;
  // numeric if it cleanly parses as a number, else keep the string (ranges like "1200–1500")
  const num = Number(rawValue);
  const value = (rawValue !== '' && !Number.isNaN(num) && String(num) === rawValue) ? num : (rawValue || null);
  const status = (kind === 'benchmark' && source) ? 'public' : 'estimate';
  return { id, statement, value, unit: unit || null, source: source || 'author note', status, kind: kind || 'benchmark' };
}

function add(runDir, { anchor, kind = null, body, id = null, claims = [] }) {
  const notes = load(runDir);
  const note = { id: id || nextId(notes), anchor, kind, body };
  if (claims && claims.length) note.claims = claims;
  notes.push(note);
  save(runDir, notes);
  return note;
}

function remove(runDir, id) {
  const notes = load(runDir);
  const idx = notes.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  const [removed] = notes.splice(idx, 1);
  save(runDir, notes);
  return removed;
}

module.exports = { ANCHOR_SECTIONS, NOTE_KINDS, notesPath, load, save, add, remove, nextId, parseClaimSpec };
