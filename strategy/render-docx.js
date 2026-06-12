// strategy/render-docx.js — the document is a RENDER of state, never an edited artifact.
// Synthesis text references numbers as {{claim:id}} tokens; this renderer resolves them
// from the ledger, so a number and its status can never disagree between pages.

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, TabStopType, TabStopPosition, PageBreak,
} = require('docx');

const ACCENT = '1F4E5F';
const GREY = '555555';
const LIGHT = 'EAF1F4';
const W = 9360; // US Letter content width

const TOKEN = /\{\{claim:([a-zA-Z0-9_\-]+)\}\}/g;

function resolveTokens(text, ledger) {
  return String(text).replace(TOKEN, (_, id) => ledger.marker(id));
}

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const p = (t, opts = {}) =>
  new Paragraph({ children: [new TextRun(t)], spacing: { after: 160 }, ...opts });
const pb = () => new Paragraph({ children: [new PageBreak()] });

function bullet(t) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun(t)],
    spacing: { after: 80 },
  });
}

function cellText(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') {
    // e.g. tierMix {starter:40, pro:45, growth:15} → "starter 40 / pro 45 / growth 15"
    return Object.entries(v).map(([k, val]) => `${k} ${val}`).join(' / ');
  }
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  return String(v);
}

function cell(text, { w, fill, bold, align } = {}) {
  const b = { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' };
  return new TableCell({
    borders: { top: b, bottom: b, left: b, right: b },
    width: { size: w, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: cellText(text), size: 20, bold: !!bold })], alignment: align || AlignmentType.LEFT })],
  });
}

function table(headers, rows, widths) {
  const total = widths.reduce((a, c) => a + c, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ children: headers.map((h, i) => cell(h, { w: widths[i], fill: LIGHT, bold: true })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { w: widths[i] })) })),
    ],
  });
}

async function render(runDir, ledger) {
  const read = (s) => JSON.parse(fs.readFileSync(path.join(runDir, `${s}.json`), 'utf8'));
  const intake = JSON.parse(fs.readFileSync(path.join(runDir, 'intake.json'), 'utf8'));
  const research = read('01-research');
  const framework = read('02-framework');
  const roadmap = read('03-roadmap');
  const scoring = read('04-scoring');
  const monetization = read('05-monetization');
  const review = read('06-review');
  const synthesis = read('07-synthesis');
  const R = (t) => resolveTokens(t, ledger);

  const eff = ledger.effective();
  const counts = eff.reduce((a, c) => ((a[c.status] = (a[c.status] || 0) + 1), a), {});
  const children = [];

  // ----- title -----
  children.push(
    new Paragraph({ children: [new TextRun({ text: intake.product.toUpperCase(), bold: true, size: 44, color: ACCENT })], spacing: { after: 100 } }),
    new Paragraph({ children: [new TextRun({ text: 'Product Strategy & Roadmap', size: 30, color: GREY })], spacing: { after: 60 } }),
    new Paragraph({
      children: [new TextRun({ text: `${intake.author ? intake.author + ' · ' : ''}${new Date().toISOString().slice(0, 10)} · generated from state, v${intake.version}`, size: 20, color: GREY })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 6 } },
      spacing: { after: 200 },
    }),
    p(`Data status: ${counts.confirmed || 0} confirmed · ${counts.estimate || 0} estimates pending validation · ${counts.public || 0} public-source · ${counts.contradicted || 0} revised by internal data. Every number in this document carries its status inline; the full ledger is in Appendix C.`,
      { spacing: { after: 240 } })
  );

  // ----- TL;DR -----
  children.push(h1('TL;DR'));
  children.push(p(R(synthesis.tldr)));

  // ----- synthesis sections -----
  for (const s of synthesis.sections) {
    children.push(h1(s.title));
    for (const par of s.paragraphs) children.push(p(R(par)));
    for (const b of s.bullets || []) children.push(bullet(R(b)));
  }

  // ----- monetization verdict (rendered from step 5, not from prose) -----
  children.push(h1('Monetization — Verdict'));
  const verdictLabel = { green: 'GREEN LIGHT', conditional: 'CONDITIONAL — gated on data below', no: 'NOT RECOMMENDED' }[monetization.verdict];
  children.push(p(`Recommended model: ${monetization.recommendedModel}. Verdict: ${verdictLabel}.`));
  if ((monetization.dependsOnClaims || []).length) {
    children.push(p('This verdict is conditional on confirming:'));
    for (const id of monetization.dependsOnClaims) children.push(bullet(R(`{{claim:${id}}}`)));
  }
  if (monetization.alternativesConsidered?.length) {
    children.push(h2('Alternatives considered'));
    for (const a of monetization.alternativesConsidered)
      children.push(bullet(`${a.model}: ${a.whyNot}`));
  }
  if (monetization.sensitivityTable?.length) {
    children.push(h2('Sensitivity'));
    const keys = [...new Set(monetization.sensitivityTable.flatMap((r) => Object.keys(r)))];
    const rows = monetization.sensitivityTable.map((r) =>
      keys.map((k) => (typeof r[k] === 'string' ? R(r[k]) : r[k])));
    children.push(table(keys, rows, keys.map(() => Math.floor(W / keys.length))));
    children.push(p(`Break-even: ${R(monetization.breakEven)}`, { spacing: { before: 120 } }));
  }

  // ----- Appendix A: scoring rubric (P0-6: never ship naked totals) -----
  children.push(pb(), h1('Appendix A — Feature Scoring Rubric'));
  children.push(p('Per-criterion scores for every feature. Totals without a visible rubric are theater; this appendix is what makes the H3 prioritization auditable.'));
  const crits = scoring.rubric.criteria;
  const headers = ['Criterion (weight)', ...scoring.features.map((f) => f.name)];
  const rows = crits.map((c) => [
    `${c.name} (${c.weight})`,
    ...scoring.features.map((f) => String(f.scores[c.name] ?? '—')),
  ]);
  const totals = ['TOTAL', ...scoring.features.map((f) =>
    String(Math.round(crits.reduce((a, c) => a + (Number(f.scores[c.name]) || 0) * c.weight, 0) * 100) / 100))];
  rows.push(totals);
  const cw = [3000, ...scoring.features.map(() => Math.floor((W - 3000) / scoring.features.length))];
  children.push(table(headers, rows, cw));

  // ----- Appendix B: adversarial self-review -----
  children.push(pb(), h1('Appendix B — Adversarial Self-Review'));
  children.push(p('This document was attacked by a hostile-reviewer pass before rendering. Every P0 found was either fixed in the state or is declared below. A document that ships with its own critique is more trustworthy than a smooth one.'));
  if (review.p0.length) {
    children.push(h2('P0 — critical'));
    for (const iss of review.p0)
      children.push(bullet(`[${iss.status.toUpperCase()}] ${iss.issue} — ${iss.resolution}`));
  }
  if (review.p1?.length) {
    children.push(h2('P1 — known weaknesses (accepted for this version)'));
    for (const iss of review.p1) children.push(bullet(typeof iss === 'string' ? iss : `${iss.issue} — ${iss.note || ''}`));
  }

  // ----- Appendix C: claim ledger / data request -----
  children.push(pb(), h1('Appendix C — Claim Ledger & Data Request'));
  children.push(p('Every quantitative claim, its status, and where it is used. Unconfirmed rows are the prioritized data-collection plan for the next version.'));
  const lrows = eff.map((c) => [
    c.id,
    c.statement,
    `${c.confirmedValue ?? c.value ?? '?'}${c.unit || ''}`,
    c.status === 'contradicted' ? 'REVISED' : c.status.toUpperCase(),
    c.confirmedSource || c.source,
  ]);
  children.push(table(['ID', 'Claim', 'Value', 'Status', 'Source'], lrows, [1400, 3260, 1300, 1400, 2000]));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 30, bold: true, font: 'Arial', color: ACCENT },
          paragraph: { spacing: { before: 300, after: 180 }, outlineLevel: 0,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 2 } } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 25, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 220, after: 130 }, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: {
        default: new Header({ children: [new Paragraph({
          children: [
            new TextRun({ text: `${intake.product} — Product Strategy`, size: 16, color: GREY }),
            new TextRun({ text: `\t${new Date().toISOString().slice(0, 10)}`, size: 16, color: GREY }),
          ],
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', size: 16, color: GREY }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
            new TextRun({ text: ' of ', size: 16, color: GREY }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY }),
          ],
        })] }),
      },
      children,
    }],
  });

  const out = path.join(runDir, `${intake.product.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-strategy.docx`);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(out, buffer);
  toPdf(out, runDir);
  return out;
}

/** Convert DOCX → PDF via LibreOffice if available; degrade gracefully if not. */
function toPdf(docxPath, outDir) {
  const { execFileSync } = require('child_process');
  const candidates = [
    'soffice', // in PATH (Linux, or Mac with brew link)
    '/Applications/LibreOffice.app/Contents/MacOS/soffice', // macOS default install
    'libreoffice',
  ];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--headless', '--convert-to', 'pdf', '--outdir', outDir, docxPath], { stdio: 'pipe', timeout: 120000 });
      console.log(`PDF:      ${path.relative(path.resolve(__dirname, '..'), docxPath.replace(/\.docx$/, '.pdf'))}`);
      return true;
    } catch (_) { /* try next candidate */ }
  }
  console.log('PDF skipped — LibreOffice not found. Install on macOS: brew install --cask libreoffice');
  return false;
}

module.exports = { render };
