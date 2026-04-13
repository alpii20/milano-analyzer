import { jsPDF } from 'jspdf';

// ─── COLOR PALETTE ───────────────────────────────────────────────────────────
const C = {
  navy:        '#1B3461',
  navyMid:     '#2D5BA4',
  orange:      '#E07039',
  orangeLight: '#F7C5A0',
  body:        '#1a2035',
  secondary:   '#64748b',
  altRow:      '#f4f5f8',
  thBg:        '#1B3461',
  thText:      '#ffffff',
  positive:    '#059669',
  negative:    '#dc2626',
  amber:       '#d97706',
  white:       '#ffffff',
  lightBorder: '#dde2ea',
  bgTint:      '#f8f9fc',
};

// ─── NUMBER FORMATTING ──────────────────────────────────────────────────────
function fmtEur(v) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(Math.round(v));
  const s = abs.toLocaleString('de-DE');
  return (v < 0 ? '-' : '') + '€' + s;
}

function fmtEurShort(v) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}€${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}€${(abs / 1e3).toFixed(0)}k`;
  return fmtEur(v);
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

  // Navy accent bar at top
  setFill(pdf, C.navy);
  pdf.rect(0, 0, ctx.pageW, 7, 'F');

  // Orange thin stripe under navy
  setFill(pdf, C.orange);
  pdf.rect(0, 7, ctx.pageW, 1.2, 'F');

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  setColor(pdf, C.navy);
  pdf.text('Investment Feasibility Report', ctx.marginLeft, 15);

  // District / date on the right
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  setColor(pdf, C.secondary);
  const district = calcInputs?.district || '';
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  pdf.text(`${district}, Milano  ·  ${dateStr}`, ctx.marginLeft, 20);

  // Thin separator
  setDraw(pdf, C.lightBorder);
  pdf.setLineWidth(0.25);
  pdf.line(ctx.marginLeft, 23, ctx.pageW - ctx.marginRight, 23);
}

function drawFooter(ctx) {
  const { pdf } = ctx;
  const y = ctx.pageH - 10;
  setDraw(pdf, C.lightBorder);
  pdf.setLineWidth(0.2);
  pdf.line(ctx.marginLeft, y - 2, ctx.pageW - ctx.marginRight, y - 2);

  // Orange dot accent
  setFill(pdf, C.orange);
  pdf.rect(ctx.marginLeft, y - 1.5, 3, 1.5, 'F');

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  setColor(pdf, C.secondary);
  pdf.text(`Page ${ctx.page}`, ctx.marginLeft + 5, y + 1);
  pdf.text('Confidential — For internal use only', ctx.pageW - ctx.marginRight, y + 1, { align: 'right' });
}

// ─── SECTION TITLE ──────────────────────────────────────────────────────────
function drawSectionTitle(ctx, title, sub) {
  ensureSpace(ctx, 14);
  const { pdf } = ctx;

  // Orange accent bar
  setFill(pdf, C.orange);
  pdf.rect(ctx.marginLeft, ctx.y - 1, 2.5, 6, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  setColor(pdf, C.navy);
  pdf.text(title, ctx.marginLeft + 6, ctx.y + 4);

  if (sub) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    setColor(pdf, C.secondary);
    pdf.text(sub, ctx.marginLeft + 6, ctx.y + 9);
    ctx.y += 3;
  }

  ctx.y += 5;
  setDraw(pdf, C.lightBorder);
  pdf.setLineWidth(0.3);
  pdf.line(ctx.marginLeft, ctx.y, ctx.pageW - ctx.marginRight, ctx.y);
  ctx.y += 5;
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

    // Card background
    setFill(pdf, C.altRow);
    pdf.rect(x + 0.5, y, cellW - 1, cellH - 1, 'F');

    // Top accent line
    setFill(pdf, C.navy);
    pdf.rect(x + 0.5, y, cellW - 1, 0.8, 'F');

    // Label
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    setColor(pdf, C.secondary);
    pdf.text(item.label, x + 2.5, y + 5);

    // Value
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    const valColor = item.color || C.body;
    setColor(pdf, valColor);
    pdf.text(String(item.value), x + 2.5, y + 11);
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
    if (sectionHeaders && sectionHeaders[rowIdx]) {
      ensureSpace(ctx, sectionH + rowH);
      setFill(pdf, '#e8ecf2');
      pdf.rect(ctx.marginLeft, ctx.y, ctx.contentW, sectionH, 'F');
      // Orange left tick
      setFill(pdf, C.orange);
      pdf.rect(ctx.marginLeft, ctx.y, 2, sectionH, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      setColor(pdf, C.navy);
      pdf.text(sectionHeaders[rowIdx], ctx.marginLeft + 4, ctx.y + 4.8);
      ctx.y += sectionH;
    }

    ensureSpace(ctx, rowH + 2);
    if (ctx.y <= ctx.marginTop + 1) {
      drawColumnHeaders();
    }

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
  ensureSpace(ctx, 20);

  const barW = 90;
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

  const pct = Math.min(score / 10, 1);
  let gaugeColor;
  if (score <= 3) gaugeColor = C.positive;
  else if (score <= 6) gaugeColor = C.amber;
  else gaugeColor = C.negative;

  setFill(pdf, gaugeColor);
  pdf.rect(x, ctx.y, barW * pct, barH, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  setColor(pdf, gaugeColor);
  const label = score <= 3 ? 'Low Risk' : score <= 6 ? 'Moderate Risk' : 'High Risk';
  pdf.text(`${fmtNum(score, 0)} / 10 — ${label}`, x + barW + 4, ctx.y + 5);

  ctx.y += barH + 6;
}

// ─── CAPITAL STRUCTURE BAR ──────────────────────────────────────────────────
function drawEquityDebtBar(ctx, equityRatio, debtRatio) {
  const { pdf } = ctx;
  ensureSpace(ctx, 22);

  const barW = ctx.contentW;
  const barH = 11;
  const x = ctx.marginLeft;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  setColor(pdf, C.body);
  pdf.text('Capital Structure', x, ctx.y);
  ctx.y += 4;

  // Equity — navy
  const eqW = barW * (equityRatio / 100);
  setFill(pdf, C.navy);
  pdf.rect(x, ctx.y, eqW, barH, 'F');

  // Debt — orange
  setFill(pdf, C.orange);
  pdf.rect(x + eqW, ctx.y, barW - eqW, barH, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  if (eqW > 25) {
    setColor(pdf, C.white);
    pdf.text(`Equity ${fmtPct(equityRatio, 0)}`, x + 3, ctx.y + 7.5);
  }
  if (barW - eqW > 25) {
    setColor(pdf, C.white);
    pdf.text(`Debt ${fmtPct(debtRatio, 0)}`, x + eqW + 3, ctx.y + 7.5);
  }

  ctx.y += barH + 6;
}

// ─── CHART: WATERFALL (SELL STRATEGY) ───────────────────────────────────────
function drawWaterfallChartPdf(ctx, results) {
  const { pdf } = ctx;
  ensureSpace(ctx, 90);

  const items = [
    { name: 'Revenue',    value:  results.revenue.totalSales,   color: C.navy },
    { name: 'Broker',     value: -results.revenue.brokerFee,    color: C.orange },
    { name: 'Hard',       value: -results.costs.hardCosts,      color: C.orange },
    { name: 'Soft',       value: -results.costs.softCosts,      color: '#EF9B60' },
    { name: 'Land',       value: -results.costs.landSiteCosts,  color: C.navyMid },
    { name: 'Finance',    value: -results.costs.financingCosts, color: '#5B8BCB' },
  ];
  const profit = results.metrics.grossProfit;
  const profitColor = profit >= 0 ? C.positive : C.negative;

  let running = 0;
  const bars = items.map((item) => {
    const prev = running;
    running += item.value;
    return { name: item.name, base: Math.min(prev, running), top: Math.max(prev, running), color: item.color, value: item.value };
  });
  bars.push({ name: 'Profit', base: Math.min(0, profit), top: Math.max(0, profit), color: profitColor, value: profit });

  const allValues = bars.flatMap((b) => [b.base, b.top]);
  const minV = Math.min(0, ...allValues);
  const maxV = Math.max(...allValues);
  // Add 8% headroom above the top value so labels inside tall bars stay clear
  const range = (maxV - minV) * 1.08 || 1;

  const chartX = ctx.marginLeft;
  const chartW = ctx.contentW;
  const chartH = 65;
  const barW = chartW / bars.length * 0.55;
  const barGap = chartW / bars.length;
  const zeroY = ctx.y + chartH * (1 - (0 - minV) / range);

  // Background
  setFill(pdf, C.bgTint);
  pdf.rect(chartX, ctx.y, chartW, chartH, 'F');

  // Zero line
  setDraw(pdf, C.lightBorder);
  pdf.setLineWidth(0.4);
  pdf.line(chartX, zeroY, chartX + chartW, zeroY);

  bars.forEach((bar, i) => {
    const bx = chartX + i * barGap + (barGap - barW) / 2;
    const by = ctx.y + chartH * (1 - (bar.top - minV) / range);
    const bh = chartH * (bar.top - bar.base) / range;

    setFill(pdf, bar.color);
    pdf.rect(bx, by, barW, Math.max(bh, 0.5), 'F');

    // Value label: positive bars → inside bar near top (avoids floating above chart);
    // negative (cost) bars → below the bar bottom, following the step-down.
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    setColor(pdf, bar.color);
    const label = fmtEurShort(bar.value);
    let labelY;
    if (bar.value >= 0) {
      // Place inside the bar, 4mm from top (always within the chart area)
      labelY = by + 4;
    } else {
      // Place below the bar's bottom edge — follows the waterfall step down
      labelY = by + Math.max(bh, 0.5) + 4;
    }
    pdf.text(label, bx + barW / 2, labelY, { align: 'center' });

    // Bar name below chart
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    setColor(pdf, C.secondary);
    pdf.text(bar.name, bx + barW / 2, ctx.y + chartH + 5, { align: 'center' });
  });

  ctx.y += chartH + 10;
}

// ─── CHART: COST COMPOSITION (STACKED HORIZONTAL BAR) ───────────────────────
function drawCostCompositionPdf(ctx, costs) {
  const { pdf } = ctx;
  ensureSpace(ctx, 30);

  const segments = [
    { label: 'Hard Costs',  value: costs.hardCosts,      color: C.navy },
    { label: 'Soft Costs',  value: costs.softCosts,      color: C.orange },
    { label: 'Land & Site', value: costs.landSiteCosts,  color: C.navyMid },
    { label: 'Financing',   value: costs.financingCosts, color: '#EF9B60' },
  ];
  const total = costs.totalProjectCost;
  const barH = 12;
  const barW = ctx.contentW;
  const x = ctx.marginLeft;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  setColor(pdf, C.body);
  pdf.text('Cost Composition', x, ctx.y);
  ctx.y += 4;

  // Stacked bar
  let offsetX = x;
  segments.forEach((seg) => {
    const segW = barW * (seg.value / total);
    setFill(pdf, seg.color);
    pdf.rect(offsetX, ctx.y, segW, barH, 'F');
    // Label inside if wide enough
    if (segW > 22) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6);
      setColor(pdf, C.white);
      pdf.text(`${((seg.value / total) * 100).toFixed(0)}%`, offsetX + segW / 2, ctx.y + 7.5, { align: 'center' });
    }
    offsetX += segW;
  });

  // Legend row
  ctx.y += barH + 4;
  let lx = x;
  segments.forEach((seg) => {
    setFill(pdf, seg.color);
    pdf.rect(lx, ctx.y, 3, 3, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    setColor(pdf, C.secondary);
    pdf.text(`${seg.label}: ${fmtEurShort(seg.value)}`, lx + 4.5, ctx.y + 2.8);
    lx += ctx.contentW / 4;
  });

  ctx.y += 8;
}

// ─── CHART: NOI PROJECTION BARS ─────────────────────────────────────────────
function drawNOIProjectionPdf(ctx, cashFlows, noi, rentGrowth) {
  const { pdf } = ctx;
  ensureSpace(ctx, 70);

  const chartX = ctx.marginLeft;
  const chartW = ctx.contentW;
  const chartH = 48;
  const barW = chartW / cashFlows.length * 0.55;
  const barGap = chartW / cashFlows.length;
  const maxNoi = Math.max(...cashFlows.map((cf) => cf.cf)) * 1.12;

  // Background
  setFill(pdf, C.bgTint);
  pdf.rect(chartX, ctx.y, chartW, chartH, 'F');

  // Bars
  cashFlows.forEach((cf, i) => {
    const bx = chartX + i * barGap + (barGap - barW) / 2;
    const bh = chartH * (cf.cf / maxNoi);
    const by = ctx.y + chartH - bh;

    setFill(pdf, C.navy);
    pdf.setFillColor(27, 52, 97, 0.75); // navy with opacity
    setFill(pdf, C.navy);
    pdf.rect(bx, by, barW, bh, 'F');

    // Year label
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    setColor(pdf, C.secondary);
    pdf.text(`Y${cf.year}`, bx + barW / 2, ctx.y + chartH + 4, { align: 'center' });
  });

  // Trend line (orange)
  const trendPoints = cashFlows.map((cf, i) => ({
    x: chartX + i * barGap + barGap / 2,
    y: ctx.y + chartH - chartH * (cf.cf / maxNoi),
  }));
  setDraw(pdf, C.orange);
  pdf.setLineWidth(1);
  for (let i = 1; i < trendPoints.length; i++) {
    pdf.line(trendPoints[i - 1].x, trendPoints[i - 1].y, trendPoints[i].x, trendPoints[i].y);
  }
  // Dots
  trendPoints.forEach((pt) => {
    setFill(pdf, C.orange);
    pdf.circle(pt.x, pt.y, 1, 'F');
  });

  ctx.y += chartH + 9;

  // Caption
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  setColor(pdf, C.secondary);
  pdf.text(`Base NOI: ${fmtEurShort(noi)}  ·  Annual rent growth: ${rentGrowth}%  ·  Orange line = growth trend`, chartX, ctx.y);
  ctx.y += 5;
}

// ─── CHART: DCF PRESENT VALUE BARS ──────────────────────────────────────────
function drawDCFBarsPdf(ctx, cashFlows, discountedTerminal, wacc) {
  const { pdf } = ctx;
  const allBars = [...cashFlows.map((cf) => ({ name: `Y${cf.year}`, v: cf.discounted })), { name: 'Term.', v: discountedTerminal }];
  ensureSpace(ctx, 65);

  const chartX = ctx.marginLeft;
  const chartW = ctx.contentW;
  const chartH = 44;
  const barW = chartW / allBars.length * 0.55;
  const barGap = chartW / allBars.length;
  const maxV = Math.max(...allBars.map((b) => b.v)) * 1.12;

  // Background
  setFill(pdf, C.bgTint);
  pdf.rect(chartX, ctx.y, chartW, chartH, 'F');

  allBars.forEach((bar, i) => {
    const bx = chartX + i * barGap + (barGap - barW) / 2;
    const bh = chartH * (bar.v / maxV);
    const by = ctx.y + chartH - bh;
    const isTerminal = i === allBars.length - 1;

    setFill(pdf, isTerminal ? C.navyMid : C.orange);
    pdf.rect(bx, by, barW, bh, 'F');

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.5);
    setColor(pdf, C.secondary);
    pdf.text(bar.name, bx + barW / 2, ctx.y + chartH + 4, { align: 'center' });
  });

  ctx.y += chartH + 9;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  setColor(pdf, C.secondary);
  pdf.text(`Orange = annual discounted CF  ·  Blue = terminal value  ·  WACC: ${fmtPct(wacc)}`, chartX, ctx.y);
  ctx.y += 5;
}

// ─── CHART: RETURN METRICS VS TARGET (SELL) ─────────────────────────────────
function drawReturnMetricsPdf(ctx, metrics, targetIrr) {
  const { pdf } = ctx;
  ensureSpace(ctx, 65);

  const items = [
    { name: 'ROI (Total)',   value: metrics.roi },
    { name: 'ROE (Total)',   value: metrics.roe },
    { name: 'Ann. ROI',      value: metrics.annualizedRoi },
    { name: 'Ann. ROE',      value: metrics.annualizedRoe },
  ];
  const maxVal = Math.max(...items.map((i) => i.value), targetIrr * 1.3) * 1.05;

  const chartX = ctx.marginLeft;
  const chartH = 48;
  const barW = ctx.contentW / items.length * 0.55;
  const barGap = ctx.contentW / items.length;

  // Background
  setFill(pdf, C.bgTint);
  pdf.rect(chartX, ctx.y, ctx.contentW, chartH, 'F');

  // Target IRR reference line
  const targetX_ratio = targetIrr / maxVal;
  const targetBarH = chartH * targetX_ratio;
  const targetY = ctx.y + chartH - targetBarH;
  setDraw(pdf, C.navy);
  pdf.setLineWidth(0.6);
  pdf.setLineDashPattern([2, 1], 0);
  pdf.line(chartX, targetY, chartX + ctx.contentW, targetY);
  pdf.setLineDashPattern([], 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6);
  setColor(pdf, C.navy);
  pdf.text(`Target ${fmtPct(targetIrr)}`, chartX + ctx.contentW - 2, targetY - 1.5, { align: 'right' });

  items.forEach((item, i) => {
    const bx = chartX + i * barGap + (barGap - barW) / 2;
    const bh = chartH * Math.max(item.value, 0) / maxVal;
    const by = ctx.y + chartH - bh;
    const barColor = item.value >= targetIrr ? C.positive : C.orange;

    setFill(pdf, barColor);
    pdf.rect(bx, by, barW, bh, 'F');

    // Value label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    setColor(pdf, barColor);
    pdf.text(fmtPct(item.value), bx + barW / 2, by - 1.5, { align: 'center' });

    // Name label
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    setColor(pdf, C.secondary);
    const nameLine1 = item.name.includes('(') ? item.name.split('(')[0].trim() : item.name;
    pdf.text(nameLine1, bx + barW / 2, ctx.y + chartH + 4, { align: 'center' });
  });

  ctx.y += chartH + 9;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  setColor(pdf, C.secondary);
  pdf.text(`Green bars = exceed target IRR  ·  Dashed line = target IRR (${fmtPct(targetIrr)})`, chartX, ctx.y);
  ctx.y += 5;
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
  const isSell = calcInputs.exitStrategy === 'Sell';

  // ──────────────────── PAGE 1: EXECUTIVE SUMMARY ────────────────────────────
  drawHeader(ctx);
  drawFooter(ctx);
  ctx.y = ctx.marginTop;

  // Title block
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  setColor(pdf, C.navy);
  pdf.text('Investment Feasibility Report', ctx.marginLeft, ctx.y + 3);
  ctx.y += 10;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  setColor(pdf, C.secondary);
  pdf.text(`${calcInputs.district}, Milano`, ctx.marginLeft, ctx.y + 2);
  ctx.y += 6;

  // Orange accent rule under title
  setFill(pdf, C.orange);
  pdf.rect(ctx.marginLeft, ctx.y, 30, 1.2, 'F');
  ctx.y += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  setColor(pdf, C.secondary);
  pdf.text(
    `${calcInputs.exitStrategy} Strategy  ·  ${calcInputs.projectType}  ·  ${calcInputs.qualityStandard} finish  ·  Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    ctx.marginLeft, ctx.y
  );
  ctx.y += 10;

  // Project Snapshot
  drawSectionTitle(ctx, 'Project Snapshot');
  drawKeyValueGrid(ctx, [
    { label: 'Project Type',    value: calcInputs.projectType },
    { label: 'Quality',         value: calcInputs.qualityStandard },
    { label: 'Exit Strategy',   value: calcInputs.exitStrategy },
    { label: 'Duration',        value: `${calcInputs.constructionDuration} months` },
    { label: 'Land Area',       value: `${fmtNum(calcInputs.landArea)} m²` },
    { label: 'Gross Floor Area',value: `${fmtNum(results.area.gfa)} m²` },
  ], 3);

  // Key Figures
  drawSectionTitle(ctx, 'Key Figures');
  const keyFigures = [{ label: 'Total Investment', value: fmtEur(results.costs.totalProjectCost) }];
  if (isSell) {
    keyFigures.push(
      { label: 'Net Revenue',    value: fmtEur(results.revenue.netSales) },
      { label: 'Gross Profit',   value: fmtEur(results.metrics.grossProfit), color: results.metrics.grossProfit >= 0 ? C.positive : C.negative },
      { label: 'ROI',            value: fmtPct(results.metrics.roi),          color: results.metrics.roi >= 0 ? C.positive : C.negative },
      { label: 'ROE',            value: fmtPct(results.metrics.roe),          color: results.metrics.roe >= 0 ? C.positive : C.negative },
      { label: 'Annualized ROI', value: fmtPct(results.metrics.annualizedRoi), color: results.metrics.annualizedRoi >= 0 ? C.positive : C.negative },
    );
  } else {
    keyFigures.push(
      { label: 'NOI',           value: fmtEur(results.revenue.noi) },
      { label: 'Cap Rate',      value: fmtPct(results.metrics.capRate),   color: results.metrics.capRate >= 5 ? C.positive : C.negative },
      { label: 'Cash-on-Cash',  value: fmtPct(results.metrics.cashOnCash), color: results.metrics.cashOnCash >= 0 ? C.positive : C.negative },
      { label: '10-yr NPV',     value: fmtEur(results.metrics.npv),       color: results.metrics.npv >= 0 ? C.positive : C.negative },
      { label: 'WACC',          value: fmtPct(results.metrics.wacc) },
    );
  }
  drawKeyValueGrid(ctx, keyFigures, 3);

  // Risk Score
  drawRiskGauge(ctx, results.riskScore);

  // Market Context
  drawSectionTitle(ctx, 'Market Context');
  drawKeyValueGrid(ctx, [
    { label: 'Sale Price (€/m²)',     value: fmtEur(results.market.sale) },
    { label: 'Rent (€/m²/month)',     value: fmtEur(results.market.rent) },
    { label: 'Transport Score',       value: `${results.market.transport} / 10` },
    { label: 'Amenities Score',       value: `${results.market.amenities} / 10` },
  ], 4);

  // ──────────────────── PAGE 2: DEVELOPMENT & COST BREAKDOWN ─────────────────
  newPage(ctx);

  drawSectionTitle(ctx, 'Development Summary');
  drawKeyValueGrid(ctx, [
    { label: 'Gross Floor Area',    value: `${fmtNum(results.area.gfa)} m²` },
    { label: 'Net Sellable Area',   value: `${fmtNum(results.area.netArea)} m²` },
    { label: 'Floors',              value: `${results.area.actualFloors}` },
    { label: 'Building Footprint',  value: `${fmtNum(results.area.footprint)} m²` },
  ], 4);

  if (results.area.farIsBinding) {
    ensureSpace(ctx, 10);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7.5);
    setColor(pdf, '#b45309');
    pdf.text(`FAR binding: max ${results.area.maxFarFloors} floors with FAR ${calcInputs.far}. Increasing max floors beyond this has no effect.`, ctx.marginLeft, ctx.y);
    ctx.y += 7;
  }

  // Cost Composition chart
  drawCostCompositionPdf(ctx, results.costs);

  // Cost Breakdown Table
  drawSectionTitle(ctx, 'Cost Breakdown');
  const { rows: costRows, sectionHeaders } = buildCostRows(results);
  drawTable(ctx, {
    columns: [
      { header: 'Item',      width: ctx.contentW * 0.55 },
      { header: 'Amount',    width: ctx.contentW * 0.28, align: 'right' },
      { header: '% of Total',width: ctx.contentW * 0.17, align: 'right' },
    ],
    rows: costRows,
    sectionHeaders,
  });

  // ──────────────────── PAGE 3: REVENUE & PROFITABILITY ──────────────────────
  newPage(ctx);

  if (isSell) {
    drawSectionTitle(ctx, 'Revenue — Sell Strategy');
    drawKeyValueGrid(ctx, [
      { label: 'Gross Sales',  value: fmtEur(results.revenue.totalSales) },
      { label: `Broker Fee (${calcInputs.brokerFeePct}%)`, value: fmtEur(results.revenue.brokerFee), color: C.negative },
      { label: 'Net Sales',    value: fmtEur(results.revenue.netSales) },
      { label: 'Gross Profit', value: fmtEur(results.metrics.grossProfit), color: results.metrics.grossProfit >= 0 ? C.positive : C.negative },
    ], 4);

    drawSectionTitle(ctx, 'Return Metrics vs Target IRR');
    drawReturnMetricsPdf(ctx, results.metrics, calcInputs.targetIrr);

    drawSectionTitle(ctx, 'Return Metrics Detail');
    drawKeyValueGrid(ctx, [
      { label: 'ROI (Total)',     value: fmtPct(results.metrics.roi),           color: results.metrics.roi >= 0 ? C.positive : C.negative },
      { label: 'ROE (Total)',     value: fmtPct(results.metrics.roe),           color: results.metrics.roe >= 0 ? C.positive : C.negative },
      { label: 'Annualized ROI',  value: fmtPct(results.metrics.annualizedRoi), color: results.metrics.annualizedRoi >= 0 ? C.positive : C.negative },
      { label: 'Annualized ROE',  value: fmtPct(results.metrics.annualizedRoe), color: results.metrics.annualizedRoe >= 0 ? C.positive : C.negative },
      { label: 'Profit Margin',   value: fmtPct(results.metrics.profitMargin),  color: results.metrics.profitMargin >= 0 ? C.positive : C.negative },
      { label: 'Break-Even (€/m²)',value: fmtEur(results.metrics.breakEvenPerM2) },
      { label: 'Market Price (€/m²)',value: fmtEur(results.market.sale) },
      { label: 'Margin vs Market',
        value: fmtPct(((results.market.sale - results.metrics.breakEvenPerM2) / results.market.sale) * 100),
        color: results.metrics.breakEvenPerM2 < results.market.sale ? C.positive : C.negative,
      },
    ], 4);

  } else {
    drawSectionTitle(ctx, 'Income — Rent Strategy');
    drawKeyValueGrid(ctx, [
      { label: 'Gross Annual Rent',  value: fmtEur(results.revenue.grossAnnualRent) },
      { label: `OpEx (${calcInputs.opexPct}%)`, value: fmtEur(results.revenue.opex), color: C.negative },
      { label: 'Net Operating Income', value: fmtEur(results.revenue.noi), color: C.positive },
      { label: 'Vacancy Rate',       value: fmtPct(results.revenue.vacancyRate * 100) },
    ], 4);

    drawSectionTitle(ctx, 'NOI Projection — 10 Years', `${calcInputs.rentGrowth}% annual rent growth`);
    drawNOIProjectionPdf(ctx, results.metrics.cashFlows, results.revenue.noi, calcInputs.rentGrowth);

    drawSectionTitle(ctx, 'Investment Metrics');
    drawKeyValueGrid(ctx, [
      { label: 'Cap Rate',     value: fmtPct(results.metrics.capRate) },
      { label: 'Cash-on-Cash',value: fmtPct(results.metrics.cashOnCash) },
      { label: 'WACC',         value: fmtPct(results.metrics.wacc) },
      { label: 'NPV (10yr)',   value: fmtEur(results.metrics.npv), color: results.metrics.npv >= 0 ? C.positive : C.negative },
    ], 4);

    if (results.metrics.cashFlows && results.metrics.cashFlows.length > 0) {
      drawSectionTitle(ctx, 'DCF Present Values', `WACC: ${fmtPct(results.metrics.wacc)}`);
      drawDCFBarsPdf(ctx, results.metrics.cashFlows, results.metrics.discountedTerminal, results.metrics.wacc);

      // DCF table
      const dcfRows = results.metrics.cashFlows.map(cf => [
        { text: `Year ${cf.year}` },
        { text: fmtEur(cf.cf) },
        { text: fmtEur(cf.discounted) },
      ]);
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
          { header: 'Period',        width: ctx.contentW * 0.35 },
          { header: 'Cash Flow',     width: ctx.contentW * 0.325, align: 'right' },
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
    { label: 'Equity Invested',     value: fmtEur(results.costs.equityInvested) },
    { label: 'Loan Amount',         value: fmtEur(results.costs.loanAmount) },
    { label: 'Equity Ratio',        value: fmtPct(calcInputs.equityRatio) },
    { label: 'Debt Ratio',          value: fmtPct(calcInputs.debtRatio) },
    { label: 'Interest Rate',       value: fmtPct(calcInputs.interestRate) },
    { label: 'Loan Term',           value: `${calcInputs.loanTerm} years` },
    { label: 'Total Financing Cost',value: fmtEur(results.costs.financingCosts) },
    { label: 'Total Project Cost',  value: fmtEur(results.costs.totalProjectCost) },
  ], 4);

  drawEquityDebtBar(ctx, calcInputs.equityRatio, calcInputs.debtRatio);

  drawSectionTitle(ctx, 'Assumptions & Disclaimers');
  const disclaimerLines = [
    'This report is generated for preliminary feasibility assessment purposes only.',
    'All calculations are based on current market data and user-provided inputs.',
    'Actual project outcomes may differ materially from these projections.',
    '',
    'Key assumptions:',
    `  Net-to-Gross ratio: ${calcInputs.netAreaRatio}%     Broker fee (sell): ${calcInputs.brokerFeePct}%     OpEx ratio (rent): ${calcInputs.opexPct}%`,
    `  Vacancy rate: ${calcInputs.vacancyPct}%     Construction costs adjusted for current Eurostat index`,
    `  Risk score is indicative and based on market, leverage, and project parameters.`,
    '',
    'This document does not constitute financial advice.',
    'Consult qualified professionals before making investment decisions.',
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
