import { jsPDF } from 'jspdf';

// ─── COLOR PALETTE ───────────────────────────────────────────────────────────
const C = {
  accent:    '#0891b2',
  body:      '#0f172a',
  secondary: '#64748b',
  altRow:    '#f1f5f9',
  thBg:      '#0891b2',
  thText:    '#ffffff',
  positive:  '#059669',
  negative:  '#dc2626',
  white:     '#ffffff',
  lightBorder: '#cbd5e1',
};

// ─── NUMBER FORMATTING ──────────────────────────────────────────────────────
function fmtEur(v) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(Math.round(v));
  const s = abs.toLocaleString('de-DE');
  return (v < 0 ? '-' : '') + '€' + s;
}

function fmtNum(v, decimals = 0) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(v, decimals = 1) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

function setColor(pdf, hex) {
  const [r, g, b] = hexToRgb(hex);
  pdf.setTextColor(r, g, b);
}

function setFill(pdf, hex) {
  const [r, g, b] = hexToRgb(hex);
  pdf.setFillColor(r, g, b);
}

function setDraw(pdf, hex) {
  const [r, g, b] = hexToRgb(hex);
  pdf.setDrawColor(r, g, b);
}

// ─── PAGE CONTEXT ────────────────────────────────────────────────────────────
function createCtx(pdf, calcInputs) {
  return {
    pdf,
    calcInputs,
    y: 0,
    page: 1,
    marginLeft: 15,
    marginRight: 15,
    marginTop: 30,
    marginBottom: 20,
    pageW: 210,
    pageH: 297,
    get contentW() { return this.pageW - this.marginLeft - this.marginRight; },
    get usableBottom() { return this.pageH - this.marginBottom; },
  };
}

function ensureSpace(ctx, neededMm) {
  if (ctx.y + neededMm > ctx.usableBottom) {
    ctx.pdf.addPage();
    ctx.page++;
    ctx.y = ctx.marginTop;
    drawHeader(ctx);
    drawFooter(ctx);
  }
}

function newPage(ctx) {
  ctx.pdf.addPage();
  ctx.page++;
  ctx.y = ctx.marginTop;
  drawHeader(ctx);
  drawFooter(ctx);
}

// ─── HEADER & FOOTER ────────────────────────────────────────────────────────
function drawHeader(ctx) {
  const { pdf, calcInputs } = ctx;
  // Teal accent bar
  setFill(pdf, C.accent);
  pdf.rect(0, 0, ctx.pageW, 6, 'F');

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  setColor(pdf, C.accent);
  pdf.text('Investment Feasibility Report', ctx.marginLeft, 14);

  // District / date
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  setColor(pdf, C.secondary);
  const district = calcInputs?.district || '';
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  pdf.text(`${district}, Milano  |  ${dateStr}`, ctx.marginLeft, 19);

  // Thin line under header
  setDraw(pdf, C.lightBorder);
  pdf.setLineWidth(0.3);
  pdf.line(ctx.marginLeft, 22, ctx.pageW - ctx.marginRight, 22);
}

function drawFooter(ctx) {
  const { pdf } = ctx;
  const y = ctx.pageH - 10;
  setDraw(pdf, C.lightBorder);
  pdf.setLineWidth(0.2);
  pdf.line(ctx.marginLeft, y - 2, ctx.pageW - ctx.marginRight, y - 2);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  setColor(pdf, C.secondary);
  pdf.text(`Page ${ctx.page}`, ctx.marginLeft, y + 1);
  pdf.text('Confidential — For internal use only', ctx.pageW - ctx.marginRight, y + 1, { align: 'right' });
}

// ─── SECTION TITLE ──────────────────────────────────────────────────────────
function drawSectionTitle(ctx, title) {
  ensureSpace(ctx, 12);
  const { pdf } = ctx;

  // Teal accent mark
  setFill(pdf, C.accent);
  pdf.rect(ctx.marginLeft, ctx.y - 3, 3, 5, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  setColor(pdf, C.body);
  pdf.text(title, ctx.marginLeft + 6, ctx.y + 1);

  // Underline
  ctx.y += 3;
  setDraw(pdf, C.accent);
  pdf.setLineWidth(0.4);
  pdf.line(ctx.marginLeft, ctx.y, ctx.pageW - ctx.marginRight, ctx.y);
  ctx.y += 6;
}

// ─── KEY-VALUE GRID ─────────────────────────────────────────────────────────
function drawKeyValueGrid(ctx, items, cols = 4) {
  const { pdf } = ctx;
  const cellW = ctx.contentW / cols;
  const cellH = 14;
  const rows = Math.ceil(items.length / cols);

  ensureSpace(ctx, rows * cellH + 2);

  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = ctx.marginLeft + col * cellW;
    const y = ctx.y + row * cellH;

    // Light box
    setFill(pdf, C.altRow);
    pdf.rect(x + 0.5, y, cellW - 1, cellH - 1, 'F');

    // Label
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    setColor(pdf, C.secondary);
    pdf.text(item.label, x + 2.5, y + 4.5);

    // Value
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    const valColor = item.color || C.body;
    setColor(pdf, valColor);
    pdf.text(String(item.value), x + 2.5, y + 10.5);
  });

  ctx.y += rows * cellH + 3;
}

// ─── TABLE ──────────────────────────────────────────────────────────────────
function drawTable(ctx, { columns, rows, sectionHeaders }) {
  const { pdf } = ctx;
  const rowH = 6.5;
  const headerH = 7;
  const sectionH = 7;
  const colWidths = columns.map(c => c.width || (ctx.contentW / columns.length));

  function drawColumnHeaders() {
    setFill(pdf, C.thBg);
    pdf.rect(ctx.marginLeft, ctx.y, ctx.contentW, headerH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    setColor(pdf, C.thText);
    let x = ctx.marginLeft;
    columns.forEach((col, ci) => {
      const align = col.align || 'left';
      const tx = align === 'right' ? x + colWidths[ci] - 2 : x + 2;
      pdf.text(col.header, tx, ctx.y + 4.8, { align });
      x += colWidths[ci];
    });
    ctx.y += headerH;
  }

  drawColumnHeaders();

  let rowIdx = 0;
  rows.forEach(row => {
    // Check if this row starts a new section
    if (sectionHeaders && sectionHeaders[rowIdx]) {
      ensureSpace(ctx, sectionH + rowH);
      setFill(pdf, '#e2e8f0');
      pdf.rect(ctx.marginLeft, ctx.y, ctx.contentW, sectionH, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      setColor(pdf, C.body);
      pdf.text(sectionHeaders[rowIdx], ctx.marginLeft + 2, ctx.y + 4.8);
      ctx.y += sectionH;
    }

    ensureSpace(ctx, rowH + 2);
    // Re-draw column headers if we're at top of a new page
    if (ctx.y <= ctx.marginTop + 1) {
      drawColumnHeaders();
    }

    // Alternating row color
    if (rowIdx % 2 === 0) {
      setFill(pdf, C.altRow);
      pdf.rect(ctx.marginLeft, ctx.y, ctx.contentW, rowH, 'F');
    }

    pdf.setFontSize(7);
    let x = ctx.marginLeft;
    row.forEach((cell, ci) => {
      const col = columns[ci];
      const align = col.align || 'left';
      const isBold = cell.bold;
      pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
      const color = cell.color || C.body;
      setColor(pdf, color);
      const val = typeof cell === 'object' ? cell.text : String(cell);
      const tx = align === 'right' ? x + colWidths[ci] - 2 : x + 2;
      pdf.text(val, tx, ctx.y + 4.5, { align });
      x += colWidths[ci];
    });

    ctx.y += rowH;
    rowIdx++;
  });

  ctx.y += 3;
}

// ─── RISK GAUGE ─────────────────────────────────────────────────────────────
function drawRiskGauge(ctx, score) {
  const { pdf } = ctx;
  ensureSpace(ctx, 18);

  const barW = 80;
  const barH = 6;
  const x = ctx.marginLeft;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  setColor(pdf, C.body);
  pdf.text('Risk Score', x, ctx.y);
  ctx.y += 3;

  // Background track
  setFill(pdf, '#e2e8f0');
  pdf.rect(x, ctx.y, barW, barH, 'F');

  // Filled portion
  const pct = Math.min(score / 10, 1);
  let gaugeColor;
  if (score <= 3) gaugeColor = C.positive;
  else if (score <= 6) gaugeColor = '#f59e0b';
  else gaugeColor = C.negative;

  setFill(pdf, gaugeColor);
  pdf.rect(x, ctx.y, barW * pct, barH, 'F');

  // Label
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  setColor(pdf, gaugeColor);
  const label = score <= 3 ? 'Low Risk' : score <= 6 ? 'Moderate Risk' : 'High Risk';
  pdf.text(`${fmtNum(score, 1)} / 10 — ${label}`, x + barW + 4, ctx.y + 5);

  ctx.y += barH + 6;
}

// ─── EQUITY VS DEBT BAR ─────────────────────────────────────────────────────
function drawEquityDebtBar(ctx, equityRatio, debtRatio) {
  const { pdf } = ctx;
  ensureSpace(ctx, 20);

  const barW = ctx.contentW;
  const barH = 10;
  const x = ctx.marginLeft;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  setColor(pdf, C.body);
  pdf.text('Capital Structure', x, ctx.y);
  ctx.y += 4;

  // Equity portion
  const eqW = barW * (equityRatio / 100);
  setFill(pdf, C.accent);
  pdf.rect(x, ctx.y, eqW, barH, 'F');

  // Debt portion
  setFill(pdf, '#f59e0b');
  pdf.rect(x + eqW, ctx.y, barW - eqW, barH, 'F');

  // Labels inside bar
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  if (eqW > 25) {
    setColor(pdf, C.white);
    pdf.text(`Equity ${fmtPct(equityRatio, 0)}`, x + 3, ctx.y + 6.5);
  }
  if (barW - eqW > 25) {
    setColor(pdf, C.white);
    pdf.text(`Debt ${fmtPct(debtRatio, 0)}`, x + eqW + 3, ctx.y + 6.5);
  }

  ctx.y += barH + 6;
}

// ─── COST BREAKDOWN TABLE DATA ──────────────────────────────────────────────
function buildCostRows(results) {
  const b = results.costs.breakdown;
  const rows = [];
  const sectionHeaders = {};

  let idx = 0;
  sectionHeaders[idx] = 'Hard Costs';
  rows.push(mkCostRow('Base Construction', b.baseConstruction, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('MEP (Mechanical/Electrical/Plumbing)', b.mep, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Facade & Landscaping', b.facadeLandscaping, results.costs.totalProjectCost));
  idx++;

  sectionHeaders[idx] = 'Soft Costs';
  rows.push(mkCostRow('Architect', b.architect, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Engineers', b.engineers, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Permits & Fees', b.permits, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Legal & Notary', b.legalNotary, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Project Management', b.projectMgmt, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Marketing', b.marketing, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Insurance', b.insurance, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Contingency', b.contingency, results.costs.totalProjectCost));
  idx++;

  sectionHeaders[idx] = 'Land & Site';
  rows.push(mkCostRow('Land Purchase', b.landPrice, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Utilities Connection', b.utilities, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Geo Survey', b.geoSurvey, results.costs.totalProjectCost));
  idx++;
  if (b.sitePrep > 0) {
    rows.push(mkCostRow('Site Preparation', b.sitePrep, results.costs.totalProjectCost));
    idx++;
  }

  sectionHeaders[idx] = 'Financing';
  rows.push(mkCostRow('Construction Interest', b.constructionInterest, results.costs.totalProjectCost));
  idx++;
  rows.push(mkCostRow('Loan Fees', b.loanFees, results.costs.totalProjectCost));
  idx++;

  // Total row
  rows.push([
    { text: 'TOTAL PROJECT COST', bold: true },
    { text: fmtEur(results.costs.totalProjectCost), bold: true },
    { text: '100%', bold: true },
  ]);

  return { rows, sectionHeaders };
}

function mkCostRow(label, amount, total) {
  return [
    { text: label },
    { text: fmtEur(amount) },
    { text: total > 0 ? fmtPct((amount / total) * 100, 1) : '—' },
  ];
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export function generatePdf(results, calcInputs) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const ctx = createCtx(pdf, calcInputs);

  // ──────────────────── PAGE 1: EXECUTIVE SUMMARY ────────────────────────────
  drawHeader(ctx);
  drawFooter(ctx);
  ctx.y = ctx.marginTop;

  // Big title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  setColor(pdf, C.body);
  pdf.text('Investment Feasibility Report', ctx.marginLeft, ctx.y + 2);
  ctx.y += 8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  setColor(pdf, C.secondary);
  pdf.text(`${calcInputs.district}, Milano`, ctx.marginLeft, ctx.y + 2);
  ctx.y += 5;

  pdf.setFontSize(8);
  pdf.text(`${calcInputs.exitStrategy} Strategy  |  Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, ctx.marginLeft, ctx.y + 2);
  ctx.y += 10;

  // Project Snapshot
  drawSectionTitle(ctx, 'Project Snapshot');
  drawKeyValueGrid(ctx, [
    { label: 'Project Type', value: calcInputs.projectType },
    { label: 'Quality Standard', value: calcInputs.qualityStandard },
    { label: 'Exit Strategy', value: calcInputs.exitStrategy },
    { label: 'Duration', value: `${calcInputs.constructionDuration} months` },
    { label: 'Land Area', value: `${fmtNum(calcInputs.landArea)} m²` },
    { label: 'Gross Floor Area', value: `${fmtNum(results.area.gfa)} m²` },
  ], 3);

  // Key Figures
  drawSectionTitle(ctx, 'Key Figures');
  const isSell = calcInputs.exitStrategy === 'Sell';
  const keyFigures = [
    { label: 'Total Investment', value: fmtEur(results.costs.totalProjectCost) },
  ];
  if (isSell) {
    keyFigures.push(
      { label: 'Net Revenue', value: fmtEur(results.revenue.netSales) },
      { label: 'ROI', value: fmtPct(results.metrics.roi), color: results.metrics.roi >= 0 ? C.positive : C.negative },
      { label: 'ROE', value: fmtPct(results.metrics.roe), color: results.metrics.roe >= 0 ? C.positive : C.negative },
    );
  } else {
    keyFigures.push(
      { label: 'Net Operating Income', value: fmtEur(results.revenue.noi) },
      { label: 'Cap Rate', value: fmtPct(results.metrics.capRate), color: results.metrics.capRate >= 5 ? C.positive : C.negative },
      { label: 'Cash-on-Cash', value: fmtPct(results.metrics.cashOnCash), color: results.metrics.cashOnCash >= 0 ? C.positive : C.negative },
    );
  }
  drawKeyValueGrid(ctx, keyFigures, 4);

  // Risk Score
  drawRiskGauge(ctx, results.riskScore);

  // Market Context
  drawSectionTitle(ctx, 'Market Context');
  drawKeyValueGrid(ctx, [
    { label: 'Sale Price (€/m²)', value: fmtEur(results.market.sale) },
    { label: 'Rent (€/m²/month)', value: fmtEur(results.market.rent) },
    { label: 'Transport Score', value: `${results.market.transport} / 10` },
    { label: 'Amenities Score', value: `${results.market.amenities} / 10` },
  ], 4);

  // ──────────────────── PAGE 2: DEVELOPMENT & COST BREAKDOWN ─────────────────
  newPage(ctx);

  drawSectionTitle(ctx, 'Development Summary');
  drawKeyValueGrid(ctx, [
    { label: 'Gross Floor Area', value: `${fmtNum(results.area.gfa)} m²` },
    { label: 'Net Sellable Area', value: `${fmtNum(results.area.netArea)} m²` },
    { label: 'Floors', value: `${results.area.actualFloors}` },
    { label: 'Building Footprint', value: `${fmtNum(results.area.footprint)} m²` },
  ], 4);

  // FAR binding note
  if (results.area.farIsBinding) {
    ensureSpace(ctx, 10);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7.5);
    setColor(pdf, '#b45309');
    pdf.text(`⚠ FAR is binding: maximum ${results.area.maxFarFloors} floors allowed by Floor Area Ratio (${calcInputs.far}).`, ctx.marginLeft, ctx.y);
    ctx.y += 7;
  }

  // Cost Breakdown Table
  drawSectionTitle(ctx, 'Cost Breakdown');
  const { rows: costRows, sectionHeaders } = buildCostRows(results);
  drawTable(ctx, {
    columns: [
      { header: 'Item', width: ctx.contentW * 0.55 },
      { header: 'Amount', width: ctx.contentW * 0.28, align: 'right' },
      { header: '% of Total', width: ctx.contentW * 0.17, align: 'right' },
    ],
    rows: costRows,
    sectionHeaders,
  });

  // Cost summary grid
  drawKeyValueGrid(ctx, [
    { label: 'Hard Costs', value: fmtEur(results.costs.hardCosts) },
    { label: 'Soft Costs', value: fmtEur(results.costs.softCosts) },
    { label: 'Land & Site', value: fmtEur(results.costs.landSiteCosts) },
    { label: 'Financing', value: fmtEur(results.costs.financingCosts) },
  ], 4);

  // ──────────────────── PAGE 3: REVENUE & PROFITABILITY ──────────────────────
  newPage(ctx);

  if (isSell) {
    // ── SELL Strategy ──
    drawSectionTitle(ctx, 'Revenue — Sell Strategy');
    drawKeyValueGrid(ctx, [
      { label: 'Gross Sales', value: fmtEur(results.revenue.totalSales) },
      { label: 'Broker Fee (3%)', value: fmtEur(results.revenue.brokerFee), color: C.negative },
      { label: 'Net Sales', value: fmtEur(results.revenue.netSales) },
      { label: 'Gross Profit', value: fmtEur(results.metrics.grossProfit), color: results.metrics.grossProfit >= 0 ? C.positive : C.negative },
    ], 4);

    drawSectionTitle(ctx, 'Return Metrics');
    drawKeyValueGrid(ctx, [
      { label: 'ROI (Total)', value: fmtPct(results.metrics.roi), color: results.metrics.roi >= 0 ? C.positive : C.negative },
      { label: 'ROE (Total)', value: fmtPct(results.metrics.roe), color: results.metrics.roe >= 0 ? C.positive : C.negative },
      { label: 'Annualized ROI', value: fmtPct(results.metrics.annualizedRoi), color: results.metrics.annualizedRoi >= 0 ? C.positive : C.negative },
      { label: 'Annualized ROE', value: fmtPct(results.metrics.annualizedRoe), color: results.metrics.annualizedRoe >= 0 ? C.positive : C.negative },
      { label: 'Profit Margin', value: fmtPct(results.metrics.profitMargin), color: results.metrics.profitMargin >= 0 ? C.positive : C.negative },
      { label: 'Break-Even (€/m²)', value: fmtEur(results.metrics.breakEvenPerM2) },
      { label: 'Market Price (€/m²)', value: fmtEur(results.market.sale) },
      { label: 'Margin vs Market', value: fmtPct(((results.market.sale - results.metrics.breakEvenPerM2) / results.market.sale) * 100), color: results.metrics.breakEvenPerM2 < results.market.sale ? C.positive : C.negative },
    ], 4);

  } else {
    // ── RENT Strategy ──
    drawSectionTitle(ctx, 'Income — Rent Strategy');
    drawKeyValueGrid(ctx, [
      { label: 'Gross Annual Rent', value: fmtEur(results.revenue.grossAnnualRent) },
      { label: 'Operating Expenses', value: fmtEur(results.revenue.opex), color: C.negative },
      { label: 'Net Operating Income', value: fmtEur(results.revenue.noi), color: C.positive },
      { label: 'Vacancy Rate', value: fmtPct(results.revenue.vacancyRate * 100) },
    ], 4);

    drawSectionTitle(ctx, 'Investment Metrics');
    drawKeyValueGrid(ctx, [
      { label: 'Cap Rate', value: fmtPct(results.metrics.capRate) },
      { label: 'Cash-on-Cash', value: fmtPct(results.metrics.cashOnCash) },
      { label: 'WACC', value: fmtPct(results.metrics.wacc) },
      { label: 'NPV (10yr)', value: fmtEur(results.metrics.npv), color: results.metrics.npv >= 0 ? C.positive : C.negative },
    ], 4);

    // 10-year DCF table
    if (results.metrics.cashFlows && results.metrics.cashFlows.length > 0) {
      drawSectionTitle(ctx, '10-Year DCF Projection');
      const dcfRows = results.metrics.cashFlows.map(cf => [
        { text: `Year ${cf.year}` },
        { text: fmtEur(cf.cf) },
        { text: fmtEur(cf.discounted) },
      ]);
      // Add terminal value and NPV summary rows
      dcfRows.push([
        { text: 'Discounted Terminal Value', bold: true },
        { text: '—' },
        { text: fmtEur(results.metrics.discountedTerminal), bold: true },
      ]);
      dcfRows.push([
        { text: 'Net Present Value (NPV)', bold: true },
        { text: '—' },
        { text: fmtEur(results.metrics.npv), bold: true, color: results.metrics.npv >= 0 ? C.positive : C.negative },
      ]);

      drawTable(ctx, {
        columns: [
          { header: 'Period', width: ctx.contentW * 0.35 },
          { header: 'Cash Flow', width: ctx.contentW * 0.325, align: 'right' },
          { header: 'Discounted CF', width: ctx.contentW * 0.325, align: 'right' },
        ],
        rows: dcfRows,
      });
    }
  }

  // ──────────────────── PAGE 4: FINANCING & DISCLAIMERS ──────────────────────
  newPage(ctx);

  drawSectionTitle(ctx, 'Financing Structure');
  drawKeyValueGrid(ctx, [
    { label: 'Equity Invested', value: fmtEur(results.costs.equityInvested) },
    { label: 'Loan Amount', value: fmtEur(results.costs.loanAmount) },
    { label: 'Equity Ratio', value: fmtPct(calcInputs.equityRatio) },
    { label: 'Debt Ratio', value: fmtPct(calcInputs.debtRatio) },
    { label: 'Interest Rate', value: fmtPct(calcInputs.interestRate) },
    { label: 'Loan Term', value: `${calcInputs.loanTerm} years` },
    { label: 'Total Financing Cost', value: fmtEur(results.costs.financingCosts) },
    { label: 'Total Project Cost', value: fmtEur(results.costs.totalProjectCost) },
  ], 4);

  // Equity vs Debt bar
  drawEquityDebtBar(ctx, calcInputs.equityRatio, calcInputs.debtRatio);

  // Assumptions & Disclaimers
  drawSectionTitle(ctx, 'Assumptions & Disclaimers');
  const disclaimerLines = [
    'This report is generated for preliminary feasibility assessment purposes only.',
    'All calculations are based on current market data and user-provided inputs.',
    'Actual project outcomes may differ materially from these projections.',
    '',
    'Key assumptions:',
    `• Net-to-Gross ratio: ${calcInputs.netAreaRatio}%     • Broker fee (sell): ${calcInputs.brokerFeePct}%     • OpEx ratio (rent): ${calcInputs.opexPct}%`,
    `• Vacancy rate: ${calcInputs.vacancyPct}%     • Construction costs adjusted for current Eurostat index`,
    `• Risk score is indicative and based on market, leverage, and project parameters.`,
    '',
    'This document does not constitute financial advice. Consult qualified professionals before making investment decisions.',
  ];

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  setColor(pdf, C.secondary);
  disclaimerLines.forEach(line => {
    ensureSpace(ctx, 5);
    pdf.text(line, ctx.marginLeft, ctx.y);
    ctx.y += 4;
  });

  // ── SAVE ───────────────────────────────────────────────────────────────────
  const filename = `Milano_Analysis_${calcInputs.district.replace(/\s+/g, '_')}_${calcInputs.exitStrategy}.pdf`;
  pdf.save(filename);
}
