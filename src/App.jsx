import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import {
  Building2, MapPin, Calculator, TrendingUp, Brain, AlertTriangle,
  ChevronDown, Loader2, DollarSign, Percent, BarChart3, Shield,
  Train, ShoppingBag, Euro, FileDown, Eye, EyeOff, RotateCcw
} from 'lucide-react';
import { generatePdf } from './generatePdf';
import { fetchEcbRate, fetchConstructionCostIndex, fetchHousePriceIndex, fetchRentalPriceIndex, fetchOsmScores } from './liveDataApi';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Area, ReferenceLine, LabelList,
  Label as RLabel,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input as ShadInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select as ShadSelect, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─── MARKET DATABASE ───────────────────────────────────────────────────────────

const MARKET_DATA = {
  'Porta Nuova':   { sale: 9500,  rent: 30, transport: 9,  amenities: 8 },
  'Brera':         { sale: 10500, rent: 33, transport: 10, amenities: 9 },
  'Navigli':       { sale: 7500,  rent: 25, transport: 8,  amenities: 9 },
  'Isola':         { sale: 7000,  rent: 24, transport: 9,  amenities: 7 },
  'Città Studi':   { sale: 5800,  rent: 19, transport: 7,  amenities: 6 },
  'Lambrate':      { sale: 5200,  rent: 17, transport: 6,  amenities: 5 },
  'Loreto':        { sale: 6000,  rent: 21, transport: 8,  amenities: 7 },
  'Buenos Aires':  { sale: 7200,  rent: 24, transport: 9,  amenities: 8 },
  'Garibaldi':     { sale: 8800,  rent: 28, transport: 10, amenities: 9 },
  'Centrale':      { sale: 6000,  rent: 20, transport: 9,  amenities: 6 },
};

const BASE_CONSTRUCTION_COSTS = { Economy: 1500, 'Mid-Range': 2000, Luxury: 3000 };

function getAdjustedCosts(multiplier = 1.0) {
  const adjusted = {};
  for (const [tier, cost] of Object.entries(BASE_CONSTRUCTION_COSTS)) {
    adjusted[tier] = Math.round(cost * multiplier);
  }
  return adjusted;
}

const LAND_CONDITION_MULTIPLIERS = {
  Flat: 0, Sloped: 0.15, Demolition: 0.20, Contaminated: 0.35,
};

// ─── CALCULATION ENGINE ────────────────────────────────────────────────────────

function runCalculations(inputs, constructionCosts, marketData) {
  const {
    district, landArea, far, bcr, maxFloors, landCondition,
    landPrice, equityRatio, debtRatio, interestRate, loanTerm,
    projectType, qualityStandard, constructionDuration, exitStrategy, targetIrr,
    mepPct, facadePct,
    architectPct, engineersPct, permitsPct, legalPct, projectMgmtPct, marketingPct, insurancePct, contingencyPct,
    vacancyPct, opexPct, brokerFeePct, netAreaRatio,
    loanFeesPct, rentGrowth, exitCapRate: exitCapRatePct,
  } = inputs;

  const market = marketData[district];
  if (!market || !landArea || !far) return null;

  // A) Developable Area
  const footprint = landArea * bcr;
  const farGfa = landArea * far;
  const floorCappedGfa = footprint * maxFloors;
  const gfa = Math.min(farGfa, floorCappedGfa);
  const actualFloors = footprint > 0 ? gfa / footprint : 0;
  const netArea = gfa * (netAreaRatio / 100);
  const farIsBinding = farGfa <= floorCappedGfa;
  const maxFarFloors = footprint > 0 ? Math.ceil(farGfa / footprint) : maxFloors;

  // B) Costs
  const baseCostPerM2 = constructionCosts[qualityStandard] || 2000;
  const conditionMultiplier = LAND_CONDITION_MULTIPLIERS[landCondition] || 0;
  const baseConstruction = gfa * baseCostPerM2 * (1 + conditionMultiplier);
  const mep = baseConstruction * (mepPct / 100);
  const facadeLandscaping = baseConstruction * (facadePct / 100);
  const hardCosts = baseConstruction + mep + facadeLandscaping;

  const architect = hardCosts * (architectPct / 100);
  const engineers = hardCosts * (engineersPct / 100);
  const permits = hardCosts * (permitsPct / 100);
  const legalNotary = hardCosts * (legalPct / 100);
  const projectMgmt = hardCosts * (projectMgmtPct / 100);
  const marketing = exitStrategy === 'Sell' ? hardCosts * (marketingPct / 100) : 0;
  const insurance = hardCosts * (insurancePct / 100);
  const contingency = hardCosts * (contingencyPct / 100);
  const softCosts = architect + engineers + permits + legalNotary + projectMgmt + marketing + insurance + contingency;

  const utilities = 12500 + 6500 + 5000 + 2000; // 26k
  const geoSurvey = 10000;
  const sitePrep = landCondition === 'Demolition' ? footprint * 100 : 0;
  const landSiteCosts = landPrice + utilities + geoSurvey + sitePrep;

  const totalBeforeFinancing = hardCosts + softCosts + landSiteCosts;
  const loanAmount = totalBeforeFinancing * (debtRatio / 100);
  const constructionInterest = loanAmount * (interestRate / 100) * (constructionDuration / 12);
  const loanFees = loanAmount * (loanFeesPct / 100);
  const financingCosts = constructionInterest + loanFees;

  const totalProjectCost = totalBeforeFinancing + financingCosts;
  const equityInvested = totalProjectCost - loanAmount;

  // C) Revenue
  let revenue = {};
  if (exitStrategy === 'Sell') {
    const totalSales = netArea * market.sale;
    const brokerFee = totalSales * (brokerFeePct / 100);
    const netSales = totalSales - brokerFee;
    revenue = { totalSales, brokerFee, netSales };
  } else {
    const vacancyRate = vacancyPct / 100;
    const grossAnnualRent = netArea * market.rent * 12 * (1 - vacancyRate);
    const opex = grossAnnualRent * (opexPct / 100);
    const noi = grossAnnualRent - opex;
    revenue = { grossAnnualRent, opex, noi, vacancyRate };
  }

  // D) Financial Metrics
  let metrics = {};
  if (exitStrategy === 'Sell') {
    const grossProfit = revenue.netSales - totalProjectCost;
    const profitMargin = revenue.netSales > 0 ? (grossProfit / revenue.netSales) * 100 : 0;
    const roi = totalProjectCost > 0 ? (grossProfit / totalProjectCost) * 100 : 0;
    const roe = equityInvested > 0 ? (grossProfit / equityInvested) * 100 : 0;
    const salesPeriod = 6;
    const totalYears = Math.max(1, (constructionDuration + salesPeriod) / 12);
    const annualizedRoi = totalProjectCost > 0
      ? (Math.pow(1 + grossProfit / totalProjectCost, 1 / totalYears) - 1) * 100 : 0;
    const annualizedRoe = equityInvested > 0
      ? (Math.pow(1 + grossProfit / equityInvested, 1 / totalYears) - 1) * 100 : 0;
    const breakEvenPerM2 = netArea > 0 ? totalProjectCost / netArea : 0;

    metrics = { grossProfit, profitMargin, roi, roe, annualizedRoi, annualizedRoe, breakEvenPerM2 };
  } else {
    const capRate = totalProjectCost > 0 ? (revenue.noi / totalProjectCost) * 100 : 0;
    const cashOnCash = equityInvested > 0 ? (revenue.noi / equityInvested) * 100 : 0;

    // WACC
    const isCorporateEntity = true; // TODO: make user input later
    const taxRate = isCorporateEntity ? 0.24 : 0;
    const costOfEquity = targetIrr / 100;
    const costOfDebt = (interestRate / 100) * (1 - taxRate);
    const wacc = (equityRatio / 100) * costOfEquity + (debtRatio / 100) * costOfDebt;

    // DCF (10-year)
    // constructionYears offsets discounting: rents don't start until after construction completes
    const growthRate = rentGrowth / 100;
    const constructionYears = constructionDuration / 12;
    let dcfSum = 0;
    const cashFlows = [];
    for (let y = 1; y <= 10; y++) {
      // Year 1 = stabilised NOI (y-1 so growth starts from Year 2 onward)
      const cf = revenue.noi * Math.pow(1 + growthRate, y - 1);
      // Discount back through construction period + operating year
      const discounted = cf / Math.pow(1 + wacc, constructionYears + y);
      dcfSum += discounted;
      cashFlows.push({ year: y, cf: Math.round(cf), discounted: Math.round(discounted) });
    }
    // Terminal value (Exit Cap Rate — industry standard for real estate)
    // year10NOI = Year 11 NOI, the perpetuity starting point (Gordon Growth Model)
    const exitCapRate = exitCapRatePct / 100;
    const year10NOI = revenue.noi * Math.pow(1 + growthRate, 10);
    const terminalValue = year10NOI / exitCapRate;
    const discountedTerminal = terminalValue / Math.pow(1 + wacc, constructionYears + 10);
    const npv = dcfSum + discountedTerminal - totalProjectCost;
    const roe = equityInvested > 0 ? (npv / equityInvested) * 100 : 0;

    metrics = { capRate, cashOnCash, roe, wacc: wacc * 100, npv, dcfSum, discountedTerminal, cashFlows };
  }

  // Risk Score (0-10, lower = safer)
  let riskScore = 0;
  if (debtRatio > 70) riskScore += 3; else if (debtRatio > 50) riskScore += 2; else riskScore += 1;
  if (exitStrategy === 'Sell') {
    if (metrics.profitMargin < 10) riskScore += 3; else if (metrics.profitMargin < 20) riskScore += 2; else riskScore += 1;
  } else {
    if (metrics.capRate < 4) riskScore += 3; else if (metrics.capRate < 6) riskScore += 2; else riskScore += 1;
  }
  if (landCondition === 'Contaminated') riskScore += 3;
  else if (landCondition === 'Demolition') riskScore += 2;
  else if (landCondition === 'Sloped') riskScore += 1;
  riskScore = Math.min(10, riskScore);

  return {
    area: { gfa, footprint, actualFloors, netArea, farIsBinding, maxFarFloors },
    costs: {
      hardCosts, softCosts, landSiteCosts, financingCosts,
      totalProjectCost, equityInvested, loanAmount,
      breakdown: {
        baseConstruction, mep, facadeLandscaping,
        architect, engineers, permits, legalNotary, projectMgmt, marketing, insurance, contingency,
        landPrice, utilities, geoSurvey, sitePrep,
        constructionInterest, loanFees,
      },
    },
    revenue,
    metrics,
    riskScore,
    market,
  };
}

// ─── FORMATTING HELPERS ────────────────────────────────────────────────────────

const fmt = (n) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);
const fmtPct = (n) => n.toFixed(1) + '%';

// ─── DEMO ANALYSIS ─────────────────────────────────────────────────────────────

const DEMO_ANALYSIS = `**Investment Viability**
This Porta Nuova mid-range residential development demonstrates strong fundamentals with a projected gross profit margin supported by Milan's most liquid submarket. The €9,500/m² exit price anchors revenue projections conservatively relative to current transaction data, providing meaningful downside cushion against market softening.

**Key Strengths**
• Porta Nuova commands Milan's strongest transport connectivity (9/10) and consistent institutional demand, reducing vacancy risk during the construction-to-let transition period
• At 70% LTV with a 4.5% construction rate, the financing structure aligns with Italian development lending norms — interest coverage is adequate at projected NOI
• Mid-range specification targets the deepest segment of the owner-occupier market, limiting price discovery risk versus luxury or economy positioning

**Main Risks**
• A 6-month construction overrun increases financing costs by approximately €180,000, compressing margin to ~21.8% — build in a schedule contingency in lender negotiations
• Broker fees (3%) and marketing costs are calibrated to a seller's market; demand softening would require fee concessions not currently modelled
• The land price implies an effective land-to-GFA ratio that is acceptable but leaves limited buffer for construction cost inflation

**Recommendation: Proceed**
The project meets its target IRR with a meaningful buffer at base assumptions. Proceed to detailed design phase, but commission a sensitivity analysis on construction cost inflation (+15%) and sales price softening (−8%) before lender presentation.`;

// ─── UI COMPONENTS ─────────────────────────────────────────────────────────────

function InputSection({ icon: Icon, title, children }) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children, span2 }) {
  return (
    <div className={span2 ? 'md:col-span-2' : ''}>
      <Label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = 'number', ...props }) {
  return (
    <ShadInput
      type={type}
      value={value}
      onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
      className="mt-1 h-9"
      {...props}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <ShadSelect value={value} onValueChange={onChange}>
      <SelectTrigger className="mt-1 h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return <SelectItem key={v} value={v}>{l}</SelectItem>;
        })}
      </SelectContent>
    </ShadSelect>
  );
}

function ScoreBar({ label, score, icon: Icon }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? 'bg-emerald-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold w-8 text-right">{score}/10</span>
    </div>
  );
}

function SummaryCard({ label, value, sub, color = 'blue' }) {
  const tints = {
    blue:   'bg-primary/[0.05]',
    green:  'bg-emerald-500/[0.06]',
    purple: 'bg-violet-500/[0.06]',
    orange: 'bg-accent/[0.07]',
  };
  return (
    <div className={`${tints[color]} rounded-lg p-4`}>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function RiskBadge({ score }) {
  let label, badgeClass;
  if (score <= 3) {
    label = 'Low Risk';
    badgeClass = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  } else if (score <= 6) {
    label = 'Medium Risk';
    badgeClass = 'bg-amber-100 text-amber-800 border border-amber-200';
  } else {
    label = 'High Risk';
    badgeClass = 'bg-red-100 text-red-800 border border-red-200';
  }
  const barColor = score <= 3 ? 'bg-emerald-500' : score <= 6 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <Shield className="w-5 h-5 text-muted-foreground" />
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium">Risk Score</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>{label}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${barColor}`}
            style={{ width: `${score * 10}%` }}
          />
        </div>
        <p className="text-right text-xs text-muted-foreground mt-0.5">{score} / 10</p>
      </div>
    </div>
  );
}

function PctInput({ value, onChange, step = 0.5 }) {
  return (
    <ShadInput
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={0}
      step={step}
      className="w-16 h-7 text-xs text-right px-1.5"
    />
  );
}

function MetricCell({ label, value, sub, valueClass = 'text-foreground' }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function CostTable({ breakdown, totalProjectCost, inputs, onChangeInput }) {
  const sections = [
    {
      title: 'Hard Costs (% of base construction)',
      items: [
        { label: 'Base Construction', value: breakdown.baseConstruction },
        { label: 'MEP', value: breakdown.mep, pctKey: 'mepPct' },
        { label: 'Facade & Landscaping', value: breakdown.facadeLandscaping, pctKey: 'facadePct' },
      ],
    },
    {
      title: 'Soft Costs (% of hard costs)',
      items: [
        { label: 'Architect', value: breakdown.architect, pctKey: 'architectPct' },
        { label: 'Engineers', value: breakdown.engineers, pctKey: 'engineersPct' },
        { label: 'Building Permits', value: breakdown.permits, pctKey: 'permitsPct', step: 0.25 },
        { label: 'Legal / Notary', value: breakdown.legalNotary, pctKey: 'legalPct', step: 0.25 },
        { label: 'Project Management', value: breakdown.projectMgmt, pctKey: 'projectMgmtPct' },
        { label: 'Marketing', value: breakdown.marketing, pctKey: 'marketingPct', step: 0.25 },
        { label: 'Insurance', value: breakdown.insurance, pctKey: 'insurancePct', step: 0.25 },
        { label: 'Contingency', value: breakdown.contingency, pctKey: 'contingencyPct' },
      ].filter((item) => !item.pctKey || item.value > 0 || inputs[item.pctKey] > 0),
    },
    {
      title: 'Land & Site',
      items: [
        { label: 'Land Purchase', value: breakdown.landPrice },
        { label: 'Utilities', value: breakdown.utilities },
        { label: 'Geotechnical Survey', value: breakdown.geoSurvey },
        { label: 'Site Preparation', value: breakdown.sitePrep },
      ].filter((item) => item.value > 0),
    },
    {
      title: 'Financing',
      items: [
        { label: 'Construction Interest', value: breakdown.constructionInterest },
        { label: 'Loan Fees', value: breakdown.loanFees, pctKey: 'loanFeesPct', step: 0.25 },
      ],
    },
  ];

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Cost Item</TableHead>
            <TableHead className="text-center w-24 font-semibold">%</TableHead>
            <TableHead className="text-right font-semibold">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections.map((s) => (
            <Fragment key={s.title}>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={3} className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {s.title}
                </TableCell>
              </TableRow>
              {s.items.map((item) => (
                <TableRow key={item.label}>
                  <TableCell className="pl-8 text-muted-foreground">{item.label}</TableCell>
                  <TableCell className="text-center">
                    {item.pctKey ? (
                      <PctInput value={inputs[item.pctKey]} onChange={onChangeInput(item.pctKey)} step={item.step} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">€{fmt(item.value)}</TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
          <TableRow className="font-bold bg-primary/5 hover:bg-primary/5">
            <TableCell className="text-primary font-bold">Total Project Cost</TableCell>
            <TableCell />
            <TableCell className="text-right text-primary font-bold">€{fmt(totalProjectCost)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );
}

// ─── CHART COMPONENTS ────────────────────────────────────────────────────────

// Palette — navy + orange, derived from CSS tokens
const C = {
  navy:        '#1B3461',
  navyMid:     '#2D5BA4',
  navyLight:   '#5B8BCB',
  orange:      '#E07039',
  orangeMid:   '#EF9B60',
  orangeLight: '#F7C5A0',
  green:       '#059669',
  red:         '#dc2626',
  tick:        '#94a3b8',
  axis:        '#cbd5e1',
};

const CHART_COLORS = [C.navy, C.orange, C.navyMid, C.orangeMid, C.navyLight, C.orangeLight];

const euroTooltipFormatter = (value) => `€${fmt(Math.round(value))}`;

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--foreground)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--muted-foreground)', fontWeight: 600 },
  itemStyle: { color: 'var(--foreground)' },
};

// Shared chart section title
function ChartTitle({ children, sub }) {
  return (
    <div className="pb-3">
      <p className="font-heading text-xs font-bold uppercase tracking-widest text-accent">{children}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function DCFChart({ cashFlows, discountedTerminal, totalProjectCost, npv, wacc }) {
  const data = cashFlows.map((cf) => ({
    name: `Y${cf.year}`,
    nominal: cf.cf,
    discounted: cf.discounted,
    erosion: cf.cf - cf.discounted,
  }));
  data.push({ name: 'Terminal', nominal: null, discounted: discountedTerminal, erosion: null });

  let cumNpv = -totalProjectCost;
  const cumulativeData = [{ name: 'Invest', cumNpv: Math.round(cumNpv) }];
  cashFlows.forEach((cf) => {
    cumNpv += cf.discounted;
    cumulativeData.push({ name: `Y${cf.year}`, cumNpv: Math.round(cumNpv) });
  });
  cumNpv += discountedTerminal;
  cumulativeData.push({ name: 'Terminal', cumNpv: Math.round(cumNpv) });

  const operatingPV = cashFlows.reduce((sum, cf) => sum + cf.discounted, 0);
  const terminalPct = ((discountedTerminal / (operatingPV + discountedTerminal)) * 100).toFixed(0);
  const operatingPct = 100 - Number(terminalPct);

  return (
    <Card>
      <CardHeader className="pb-3">
        <ChartTitle sub={`10-year projection · WACC ${fmtPct(wacc)}`}>DCF Analysis</ChartTitle>
      </CardHeader>
      <CardContent className="space-y-8">

        {/* Chart 1: Present Value vs Time Value Erosion */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-3 uppercase tracking-wide">Present Value vs Time Value Erosion</p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data} margin={{ top: 16, right: 15, left: 15, bottom: 5 }}>
              <defs>
                <linearGradient id="nominalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.navy} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={C.navy} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.tick }} axisLine={{ stroke: C.axis }} tickLine={false} />
              <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: C.tick }} axisLine={false} tickLine={false} />
              <Tooltip formatter={euroTooltipFormatter} {...tooltipStyle} />
              <Area type="monotone" dataKey="nominal" name="Nominal CF" fill="url(#nominalGrad)" stroke={C.navyMid} strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
              <Bar dataKey="discounted" name="Present Value" stackId="cf" fill={C.orange} radius={[0, 0, 0, 0]} barSize={24} fillOpacity={0.9}>
                <LabelList dataKey="discounted" position="top" formatter={(v) => v >= 1e6 ? `€${(v/1e6).toFixed(1)}M` : `€${(v/1e3).toFixed(0)}k`} style={{ fontSize: 8, fill: C.tick }} />
              </Bar>
              <Bar dataKey="erosion" name="Time Value Erosion" stackId="cf" fill={C.navy} radius={[3, 3, 0, 0]} barSize={24} fillOpacity={0.22} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap items-center justify-center gap-5 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: C.orange }} /> Present Value</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block opacity-25" style={{ background: C.navy }} /> Time Value Erosion</span>
            <span className="flex items-center gap-1.5"><span className="w-6 h-0 inline-block border-t-2 border-dashed" style={{ borderColor: C.navyMid }} /> Nominal CF</span>
          </div>
        </div>

        {/* Chart 2: Cumulative NPV Journey */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-3 uppercase tracking-wide">Cumulative NPV Journey</p>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={cumulativeData} margin={{ top: 16, right: 50, left: 15, bottom: 5 }}>
              <defs>
                <linearGradient id="npvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.orange} stopOpacity={0.22} />
                  <stop offset="60%" stopColor={C.orange} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.tick }} axisLine={{ stroke: C.axis }} tickLine={false} />
              <YAxis tickFormatter={(v) => `€${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 11, fill: C.tick }} axisLine={false} tickLine={false} />
              <Tooltip formatter={euroTooltipFormatter} {...tooltipStyle} />
              <ReferenceLine y={0} stroke={C.tick} strokeDasharray="6 4" strokeWidth={1.5} label={{ value: 'Breakeven', position: 'right', fontSize: 10, fill: C.tick }} />
              <Area type="monotone" dataKey="cumNpv" name="Cumulative NPV" fill="url(#npvGrad)" stroke={C.navy} strokeWidth={2.5} dot={{ fill: C.orange, strokeWidth: 2, stroke: 'white', r: 4 }} activeDot={{ r: 6, fill: C.orange }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-5 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 inline-block" style={{ background: C.orange, borderRadius: '50%' }} /> Cumulative NPV</span>
            <span className="flex items-center gap-1.5"><span className="w-6 h-0 inline-block border-t-2 border-dashed" style={{ borderColor: C.tick }} /> Breakeven</span>
          </div>
        </div>

        {/* PV Composition */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Present Value Composition</p>
          <div className="h-4 rounded-sm overflow-hidden bg-muted flex">
            <div className="h-full transition-all duration-500" style={{ width: `${operatingPct}%`, background: C.orange }} />
            <div className="h-full transition-all duration-500" style={{ width: `${terminalPct}%`, background: C.navy }} />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 inline-block shrink-0" style={{ background: C.orange }} />
              Operating CF: {operatingPct}% (€{fmt(operatingPV)})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 inline-block shrink-0" style={{ background: C.navy }} />
              Terminal Value: {terminalPct}% (€{fmt(discountedTerminal)})
            </span>
          </div>
        </div>

        {/* NPV verdict */}
        <div className={`rounded-lg p-3 text-sm font-medium border ${npv >= 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          Net Present Value: <span className="font-bold">€{fmt(npv)}</span>
          {npv >= 0 ? ' — Project creates value above required return' : ' — Project does not meet required return threshold'}
        </div>

      </CardContent>
    </Card>
  );
}

function CostBreakdownChart({ costs }) {
  const data = [
    { name: 'Hard Costs',  value: costs.hardCosts,       color: C.navy },
    { name: 'Soft Costs',  value: costs.softCosts,       color: C.orange },
    { name: 'Land & Site', value: costs.landSiteCosts,   color: C.navyMid },
    { name: 'Financing',   value: costs.financingCosts,  color: C.orangeMid },
  ];
  const total = costs.totalProjectCost;
  const totalLabel = total >= 1e6 ? `€${(total / 1e6).toFixed(2)}M` : `€${fmt(total)}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <ChartTitle sub="Hard / Soft / Land / Financing split">Cost Structure</ChartTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ResponsiveContainer width="100%" height={220} className="md:max-w-[240px]">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={92}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
                <RLabel
                  content={({ viewBox }) => {
                    const { cx, cy } = viewBox;
                    return (
                      <g>
                        <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 13, fontWeight: 700, fill: C.navy }}>
                          {totalLabel}
                        </text>
                        <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 9, fill: C.tick }}>
                          total cost
                        </text>
                      </g>
                    );
                  }}
                />
              </Pie>
              <Tooltip formatter={euroTooltipFormatter} {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-3 w-full">
            {data.map((item) => (
              <div key={item.name}>
                <div className="flex items-center gap-3 mb-1">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-muted-foreground flex-1">{item.name}</span>
                  <span className="text-sm font-bold">€{fmt(item.value)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{((item.value / total) * 100).toFixed(1)}%</span>
                </div>
                <div className="ml-6 h-1.5 bg-muted overflow-hidden" style={{ borderRadius: 2 }}>
                  <div className="h-full" style={{ width: `${(item.value / total) * 100}%`, backgroundColor: item.color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfitWaterfallChart({ results }) {
  const items = [
    { name: 'Revenue',    value:  results.revenue.totalSales,        fill: C.navy },
    { name: 'Broker Fee', value: -results.revenue.brokerFee,         fill: C.orangeMid },
    { name: 'Hard Costs', value: -results.costs.hardCosts,           fill: C.orange },
    { name: 'Soft Costs', value: -results.costs.softCosts,           fill: C.orangeLight },
    { name: 'Land & Site',value: -results.costs.landSiteCosts,       fill: C.navyMid },
    { name: 'Financing',  value: -results.costs.financingCosts,      fill: C.navyLight },
  ];

  let running = 0;
  const data = items.map((item) => {
    const prev = running;
    running += item.value;
    const low = Math.min(prev, running);
    const high = Math.max(prev, running);
    return { name: item.name, base: low, delta: high - low, fill: item.fill, value: item.value };
  });
  const profit = results.metrics.grossProfit;
  data.push({
    name: 'Profit',
    base: Math.min(0, profit),
    delta: Math.abs(profit),
    fill: profit >= 0 ? C.green : C.red,
    value: profit,
  });

  // BUG FIX: support negative profit — domain must go below 0
  const minBase = Math.min(0, ...data.map((d) => d.base));
  const maxTop  = Math.max(...data.map((d) => d.base + d.delta));

  return (
    <Card>
      <CardHeader className="pb-3">
        <ChartTitle sub="Revenue → costs → gross profit">Profit Waterfall</ChartTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 28, right: 15, left: 15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.7} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.tick }} axisLine={{ stroke: C.axis }} tickLine={false} />
            <YAxis
              domain={[minBase < 0 ? minBase * 1.1 : 0, maxTop * 1.08]}
              tickFormatter={(v) => `€${(v / 1000000).toFixed(1)}M`}
              tick={{ fontSize: 11, fill: C.tick }}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine y={0} stroke={C.axis} strokeWidth={1.5} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                return (
                  <div className="border shadow-md rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    <p className="font-semibold text-foreground mb-0.5">{d.name}</p>
                    <p style={{ color: d.value >= 0 ? C.green : C.red }}>
                      {d.value >= 0 ? '+' : ''}€{fmt(d.value)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="delta" stackId="wf" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v) => {
                  const abs = Math.abs(v);
                  const label = abs >= 1e6 ? `€${(abs / 1e6).toFixed(1)}M` : `€${(abs / 1e3).toFixed(0)}k`;
                  return v >= 0 ? label : `-${label}`;
                }}
                style={{ fontSize: 9, fill: C.tick, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-muted-foreground justify-center">
          {items.map((item) => (
            <span key={item.name} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: item.fill }} />
              {item.name}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: C.green }} />
            Profit
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function SellReturnChart({ metrics, targetIrr }) {
  const items = [
    { name: 'ROI (Total)',       value: metrics.roi,           short: 'ROI' },
    { name: 'ROE (Total)',       value: metrics.roe,           short: 'ROE' },
    { name: 'Ann. ROI',          value: metrics.annualizedRoi, short: 'Ann.ROI' },
    { name: 'Ann. ROE',          value: metrics.annualizedRoe, short: 'Ann.ROE' },
  ];

  const data = items.map((item) => ({
    name: item.short,
    fullName: item.name,
    value: Math.round(item.value * 10) / 10,
    fill: item.value >= targetIrr ? C.green : C.orange,
  }));

  const maxVal = Math.max(...data.map((d) => d.value), targetIrr * 1.2);

  return (
    <Card>
      <CardHeader className="pb-3">
        <ChartTitle sub={`Target IRR: ${targetIrr}% · green bars exceed target`}>Return Metrics vs Target</ChartTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 55, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, maxVal * 1.05]}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              tick={{ fontSize: 10, fill: C.tick }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: C.tick }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div className="border shadow-md rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    <p className="font-semibold text-foreground mb-0.5">{d.fullName}</p>
                    <p style={{ color: d.fill }}>{d.value.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Target: {targetIrr}%</p>
                  </div>
                );
              }}
            />
            <ReferenceLine
              x={targetIrr}
              stroke={C.navy}
              strokeWidth={2}
              strokeDasharray="6 3"
              label={{ value: `Target ${targetIrr}%`, position: 'right', fontSize: 9, fill: C.navy, fontWeight: 600 }}
            />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={28} isAnimationActive={false}>
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} fillOpacity={0.85} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v) => `${v.toFixed(1)}%`}
                style={{ fontSize: 10, fill: C.tick, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: C.green }} /> Exceeds target IRR</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: C.orange }} /> Below target IRR</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-0 inline-block border-t-2 border-dashed" style={{ borderColor: C.navy }} /> Target IRR</span>
        </div>
      </CardContent>
    </Card>
  );
}

function NOIProjectionChart({ cashFlows, noi, rentGrowth }) {
  const data = cashFlows.map((cf) => ({
    name: `Y${cf.year}`,
    noi: cf.cf,
    trend: Math.round(noi * Math.pow(1 + rentGrowth / 100, cf.year - 1)),
  }));

  const maxNoi = Math.max(...data.map((d) => d.noi));

  return (
    <Card>
      <CardHeader className="pb-3">
        <ChartTitle sub={`Nominal NOI growth · ${rentGrowth}% annual rent escalation`}>NOI Projection — 10 Year</ChartTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 16, right: 15, left: 15, bottom: 5 }}>
            <defs>
              <linearGradient id="noiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.navy} stopOpacity={0.18} />
                <stop offset="100%" stopColor={C.navy} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.tick }} axisLine={{ stroke: C.axis }} tickLine={false} />
            <YAxis
              tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: C.tick }}
              axisLine={false}
              tickLine={false}
              domain={[0, maxNoi * 1.15]}
            />
            <Tooltip formatter={euroTooltipFormatter} {...tooltipStyle} />
            <Area type="monotone" dataKey="noi" name="Nominal NOI" fill="url(#noiGrad)" stroke="none" />
            <Bar dataKey="noi" name="Nominal NOI" fill={C.navy} fillOpacity={0.75} radius={[3, 3, 0, 0]} barSize={20} isAnimationActive={false}>
              <LabelList dataKey="noi" position="top" formatter={(v) => `€${(v / 1000).toFixed(0)}k`} style={{ fontSize: 8, fill: C.tick }} />
            </Bar>
            <Line type="monotone" dataKey="trend" name="Growth Trend" stroke={C.orange} strokeWidth={2} dot={{ fill: C.orange, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block opacity-75" style={{ background: C.navy }} /> Annual NOI</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-0 inline-block border-t-2" style={{ borderColor: C.orange }} /> Growth Trend</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AI ANALYSIS ───────────────────────────────────────────────────────────────

function AIAnalysisSection({ inputs, results }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const showDemoAnalysis = () => {
    setAnalysis(DEMO_ANALYSIS);
    setIsDemo(true);
    setError(null);
  };

  const generateAnalysis = async () => {
    if (!apiKey) { setError('Please enter your Anthropic API key.'); return; }
    setLoading(true);
    setError(null);
    setIsDemo(false);

    const prompt = `You are a senior real estate investment analyst specializing in the Italian market.

Analyze this property development project and provide your professional assessment:

PROJECT DETAILS:
- Location: ${inputs.district}, Milano
- Project Type: ${inputs.projectType} | Quality: ${inputs.qualityStandard}
- Exit Strategy: ${inputs.exitStrategy}
- Land Area: ${fmt(inputs.landArea)} m² | GFA: ${fmt(results.area.gfa)} m² | Net Area: ${fmt(results.area.netArea)} m²

FINANCIAL SUMMARY:
- Total Project Cost: €${fmt(results.costs.totalProjectCost)}
- Equity Invested: €${fmt(results.costs.equityInvested)} (${inputs.equityRatio}%)
- Loan Amount: €${fmt(results.costs.loanAmount)} at ${inputs.interestRate}%
${inputs.exitStrategy === 'Sell'
  ? `- Net Sales Revenue: €${fmt(results.revenue.netSales)}
- Gross Profit: €${fmt(results.metrics.grossProfit)}
- ROI: ${fmtPct(results.metrics.roi)} | ROE: ${fmtPct(results.metrics.roe)}
- Profit Margin (on Revenue): ${fmtPct(results.metrics.profitMargin)}
- Break-even: €${fmt(results.metrics.breakEvenPerM2)}/m²`
  : `- NOI: €${fmt(results.revenue.noi)}/year
- Cap Rate: ${fmtPct(results.metrics.capRate)} | Cash-on-Cash: ${fmtPct(results.metrics.cashOnCash)} | ROE: ${fmtPct(results.metrics.roe)}
- WACC: ${fmtPct(results.metrics.wacc)} | NPV: €${fmt(results.metrics.npv)}`}

LOCATION SCORES:
- Transport: ${results.market.transport}/10 | Amenities: ${results.market.amenities}/10
- Market Sale Price: €${fmt(results.market.sale)}/m² | Rent: €${results.market.rent}/m²/month

RISK SCORE: ${results.riskScore}/10
Land Condition: ${inputs.landCondition}

Please provide:
1. **Investment Viability** (2 sentences)
2. **Key Strengths** (2-3 bullet points)
3. **Main Risks** (2-3 bullet points)
4. **Recommendation** (Proceed / Reconsider / Reject — with brief reasoning)

Be specific to this project. Reference actual numbers.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      setAnalysis(data.content[0].text);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-primary">
          <Brain className="w-4 h-4 text-accent" />
          AI Investment Analysis
          <Badge className="ml-2 text-xs bg-primary text-primary-foreground border-primary">
            Powered by Claude
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <ShadInput
              type={showKey ? 'text' : 'password'}
              placeholder="Anthropic API Key (sk-ant-...)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button
            onClick={generateAnalysis}
            disabled={loading || !results || !apiKey}
            className="bg-accent hover:bg-accent/90 text-white shrink-0"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Analyzing...</> : 'Generate'}
          </Button>
          <Button
            variant="outline"
            onClick={showDemoAnalysis}
            disabled={loading}
            className="shrink-0"
          >
            View Demo
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            <AlertTriangle className="w-4 h-4 inline mr-1" /> {error}
          </div>
        )}

        {analysis && (
          <div className="rounded-lg p-5 text-sm text-foreground whitespace-pre-wrap leading-relaxed border border-primary/20 bg-card">
            {isDemo && (
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
                  Demo output — enter your API key above to analyze your own scenario
                </Badge>
              </div>
            )}
            {analysis}
          </div>
        )}

        {!analysis && !loading && (
          <p className="text-sm text-muted-foreground">
            Run a scenario first, then generate an AI analysis — or click{' '}
            <button onClick={showDemoAnalysis} className="underline underline-offset-2 hover:text-foreground transition-colors">
              View Demo
            </button>{' '}
            to see what the output looks like. (~€0.01 per live analysis)
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── LIVE DATA BADGE ─────────────────────────────────────────────────────────

function LiveBadge({ loading, error, text }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading...
      </span>
    );
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 mt-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
        Offline — using defaults
      </span>
    );
  }
  if (text) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 mt-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
        {text}
      </span>
    );
  }
  return null;
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────────

const DEFAULT_INPUTS = {
  district: 'Porta Nuova',
  landArea: 1000,
  far: 2.5,
  bcr: 0.5,
  maxFloors: 8,
  landCondition: 'Flat',
  landPrice: 2000000,
  equityRatio: 30,
  debtRatio: 70,
  interestRate: 4.5,
  loanTerm: 5,
  projectType: 'Residential',
  qualityStandard: 'Mid-Range',
  constructionDuration: 24,
  exitStrategy: 'Sell',
  targetIrr: 15,
  // Hard cost multipliers (% of base construction)
  mepPct: 17.5,
  facadePct: 10,
  // Soft cost multipliers (% of hard costs)
  architectPct: 10,
  engineersPct: 7.5,
  permitsPct: 1.5,
  legalPct: 1.5,
  projectMgmtPct: 4,
  marketingPct: 1.5,
  insurancePct: 0.75,
  contingencyPct: 7.5,
  // Revenue & operating
  vacancyPct: 8,
  opexPct: 25,
  brokerFeePct: 3,
  netAreaRatio: 85,
  // Financing
  loanFeesPct: 1.5,
  // DCF
  rentGrowth: 2,
  exitCapRate: 5,
};

export default function App() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [results, setResults] = useState(null);
  const [calcInputs, setCalcInputs] = useState(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [liveData, setLiveData] = useState({
    ecb: null, eurostat: null, hpiSale: null, hpiRent: null,
    loading: true,
    ecbError: false, eurostatError: false, hpiSaleError: false, hpiRentError: false,
  });
  const [osmScores, setOsmScores] = useState({});

  const constructionCosts = useMemo(
    () => getAdjustedCosts(liveData.eurostat?.multiplier ?? 1.0),
    [liveData.eurostat]
  );

  const adjustedMarketData = useMemo(() => {
    const saleMul = liveData.hpiSale?.multiplier ?? 1.0;
    const rentMul = liveData.hpiRent?.multiplier ?? 1.0;
    const adjusted = {};
    for (const [dist, data] of Object.entries(MARKET_DATA)) {
      adjusted[dist] = {
        sale: Math.round(data.sale * saleMul),
        rent: +(data.rent * rentMul).toFixed(1),
        transport: data.transport,
        amenities: data.amenities,
      };
    }
    return adjusted;
  }, [liveData.hpiSale, liveData.hpiRent]);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveData() {
      const [ecbResult, eurostatResult, hpiSaleResult, hpiRentResult] = await Promise.allSettled([
        fetchEcbRate(),
        fetchConstructionCostIndex(),
        fetchHousePriceIndex(),
        fetchRentalPriceIndex(),
      ]);

      if (cancelled) return;

      const ecb = ecbResult.status === 'fulfilled' ? ecbResult.value : null;
      const eurostat = eurostatResult.status === 'fulfilled' ? eurostatResult.value : null;
      const hpiSale = hpiSaleResult.status === 'fulfilled' ? hpiSaleResult.value : null;
      const hpiRent = hpiRentResult.status === 'fulfilled' ? hpiRentResult.value : null;

      if (ecb) {
        setInputs((prev) => prev.interestRate === 4.5 ? { ...prev, interestRate: ecb.rate } : prev);
      }

      setLiveData({
        ecb, eurostat, hpiSale, hpiRent,
        loading: false,
        ecbError: ecbResult.status === 'rejected',
        eurostatError: eurostatResult.status === 'rejected',
        hpiSaleError: hpiSaleResult.status === 'rejected',
        hpiRentError: hpiRentResult.status === 'rejected',
      });
    }

    loadLiveData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (osmScores[inputs.district]) return;
    let cancelled = false;
    fetchOsmScores(inputs.district)
      .then(scores => { if (!cancelled && scores) setOsmScores(prev => ({ ...prev, [inputs.district]: scores })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [inputs.district]);

  const set = (key) => (val) => {
    setInputs((prev) => {
      const next = { ...prev, [key]: val };
      if (key === 'equityRatio') next.debtRatio = 100 - val;
      if (key === 'debtRatio') next.equityRatio = 100 - val;
      if (key === 'exitStrategy') {
        next.targetIrr = val === 'Rent' ? 8 : 15;
      }
      if (key === 'projectType') {
        next.vacancyPct = val === 'Office' ? 10 : 8;
      }
      return next;
    });
  };

  const handleCalculate = () => {
    setResults(runCalculations(inputs, constructionCosts, adjustedMarketData));
    setCalcInputs({ ...inputs });
  };

  const handleExportPdf = useCallback(async () => {
    if (!results || pdfExporting) return;
    setPdfExporting(true);
    try {
      generatePdf(results, calcInputs);
    } finally {
      setPdfExporting(false);
    }
  }, [results, calcInputs, pdfExporting]);

  const market = adjustedMarketData[inputs.district];
  const currentOsm = osmScores[inputs.district];
  const displayTransport = currentOsm?.transport ?? market?.transport;
  const displayAmenities = currentOsm?.amenities ?? market?.amenities;

  return (
    <div className="min-h-screen bg-background">

      {/* ─── HERO HEADER ─── */}
      <header style={{ background: 'oklch(0.22 0.09 264)' }} className="text-white">
        <div className="max-w-7xl mx-auto px-6 py-10 md:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Left: big title */}
            <div>
              <h1 className="font-heading text-6xl md:text-8xl font-black tracking-tight leading-none text-white">
                MILANO
              </h1>
              <div className="h-1 my-4" style={{ background: 'oklch(0.62 0.18 45)', width: '3rem' }} />
              <p className="text-xl md:text-2xl font-light tracking-[0.2em] text-white/60 uppercase">
                Investment Analyser
              </p>
              <p className="text-xs text-white/35 mt-5 tracking-wider">
                Live ECB · Eurostat · OpenStreetMap
              </p>
            </div>
            {/* Right: description */}
            <div>
              <p className="text-xs uppercase tracking-widest font-semibold mb-5 text-accent">
                Real Estate Feasibility
              </p>
              <p className="text-2xl md:text-3xl font-light text-white/85 mb-5 leading-snug">
                From land cost to exit yield —<br />complete feasibility in seconds.
              </p>
              <p className="text-white/55 text-sm leading-relaxed mb-6 max-w-md">
                Input land parameters and financial assumptions across 10 Milan districts.
                Get instant ROI, NPV, risk scores, and AI investment reports backed by
                live ECB and Eurostat data.
              </p>
              <div className="flex flex-wrap gap-2">
                {['AI Analysis', '10 Districts', 'Live Data', 'PDF Export'].map(tag => (
                  <span key={tag} className="text-xs px-3 py-1 rounded-sm border border-white/15 text-white/55 font-medium tracking-wide">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── TOP-LEVEL NAVIGATION TABS ─── */}
      <Tabs defaultValue="who-am-i" className="w-full">

        {/* Sticky tab bar */}
        <div className="bg-white border-b shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6">
            <TabsList variant="line" className="nav-tab-strip bg-transparent h-auto p-0 gap-0 rounded-none w-auto">
              {[
                { value: 'scenario', label: 'Scenario' },
                { value: 'case-info', label: 'Case Info' },
                { value: 'how-to-use', label: 'How to Use' },
                { value: 'who-am-i', label: 'Who Am I' },
              ].map(({ value, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-none border-0 px-6 py-4 text-sm font-semibold text-muted-foreground data-[active]:text-foreground data-[active]:bg-transparent data-[active]:shadow-none hover:text-foreground transition-colors"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        {/* ─── WHO AM I TAB ─── */}
        <TabsContent value="who-am-i" className="mt-0">
          <div className="max-w-7xl mx-auto px-6 py-16">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Photo + quick facts */}
              <div className="flex flex-col items-center lg:items-start gap-5">
                <img
                  src="/photo.png"
                  alt="Alp Emre Celik"
                  className="w-44 h-44 rounded-xl object-cover border-2 border-accent/40"
                />
                <div className="text-center lg:text-left">
                  <h2 className="font-heading text-2xl font-bold text-foreground tracking-tight">Alp Emre Celik</h2>
                  <p className="text-sm font-medium mt-1 text-accent">
                    Asset &amp; Facility Management Professional
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Milan, Italy</p>
                </div>
                {/* Contact */}
                <div className="flex flex-col gap-1.5 text-sm w-full">
                  <a
                    href="mailto:alpemrecelik@gmail.com"
                    className="text-muted-foreground hover:text-accent transition-colors"
                  >
                    alpemrecelik@gmail.com
                  </a>
                  <a
                    href="https://linktr.ee/alpemrecelik"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-accent transition-colors"
                  >
                    linktr.ee/alpemrecelik
                  </a>
                </div>
                {/* Skills chips */}
                <div className="flex flex-wrap gap-2">
                  {['Facility Ops', 'Asset Mgmt', 'Make.com', 'n8n', 'BIM', 'AI Tools', 'Site Mgmt'].map(s => (
                    <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium border">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bio + experience */}
              <div className="lg:col-span-2 space-y-8">
                {/* Bio */}
                <div>
                  <h3 className="font-heading text-xs font-bold uppercase tracking-widest text-accent mb-3 pt-1">
                    About
                  </h3>
                  <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                    I&apos;m a facility and asset management professional with a background in architecture and a deep
                    interest in how technology can reshape the built environment. With 2+ years of hands-on experience
                    spanning makerspace operations, government-tendered construction projects, and international
                    large-scale events, I bring both strategic thinking and on-the-ground execution to every project.
                  </p>
                  <p className="text-muted-foreground leading-relaxed text-sm md:text-base mt-3">
                    Currently pursuing an MSc in Management of Built Environment at Politecnico di Milano, I&apos;m
                    combining my architectural foundation with modern operational frameworks. Outside the classroom,
                    I&apos;m actively building AI-powered automation workflows using Make.com, n8n, and Claude Code —
                    turning manual processes into intelligent systems that save time and reduce risk.
                  </p>
                  <p className="text-muted-foreground leading-relaxed text-sm md:text-base mt-3">
                    This tool is a direct product of that mindset: a real estate investment analyzer built entirely
                    with AI assistance, integrating live market data, financial modeling, and AI-driven reporting —
                    all in one place.
                  </p>
                </div>

                {/* Education */}
                <div>
                  <h3 className="font-heading text-xs font-bold uppercase tracking-widest text-accent mb-3 pt-1">
                    Education
                  </h3>
                  <div className="space-y-3">
                    {[
                      { school: 'Politecnico di Milano', degree: 'MSc Management of Built Environment', period: '2024 – 2026 (expected)', location: 'Milan, Italy' },
                      { school: 'Pamukkale University', degree: 'BSc Architecture', period: '2023', location: 'Denizli, Turkey' },
                    ].map(({ school, degree, period, location }) => (
                      <div key={school} className="p-4 rounded-lg bg-card border shadow-sm">
                        <div>
                          <p className="font-semibold text-foreground text-sm">{school}</p>
                          <p className="text-sm text-muted-foreground">{degree}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{period} · {location}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Experience highlights */}
                <div>
                  <h3 className="font-heading text-xs font-bold uppercase tracking-widest text-accent mb-3 pt-1">
                    Experience Highlights
                  </h3>
                  <div className="space-y-3">
                    {[
                      { role: 'Co-Founder & Facility Operations Manager', company: 'Design Atelier Pamukkale', period: 'Jun 2022 – Oct 2024', highlight: 'Launched a fully operational makerspace from zero, secured €5k government funding, and built a €500/month subscription revenue model.' },
                      { role: 'Site & Facility Operations Manager', company: 'Utku Architecture', period: 'Mar 2023 – Sep 2024', highlight: 'Managed 10 trade teams across government-tendered construction sites, achieving 100% resource availability with zero downtime incidents.' },
                      { role: 'Junior Site & Facility Manager', company: 'Walk With Amal International Project', period: 'Jun – Sep 2021', highlight: 'Coordinated on-site infrastructure for large-scale public events across multiple locations, collaborating with 500+ people and 10 project leads.' },
                    ].map(({ role, company, period, highlight }) => (
                      <div key={role} className="p-4 rounded-xl bg-card border shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-1 mb-1">
                          <p className="font-semibold text-foreground text-sm">{role}</p>
                          <span className="text-xs text-muted-foreground shrink-0">{period}</span>
                        </div>
                        <p className="text-xs font-medium mb-1.5 text-accent">{company}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{highlight}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Languages */}
                <div className="flex flex-wrap gap-3">
                  {[
                    { lang: 'Turkish', level: 'Native' },
                    { lang: 'English', level: 'Fluent' },
                    { lang: 'Italian', level: 'Intermediate' },
                  ].map(({ lang, level }) => (
                    <div key={lang} className="px-4 py-2 rounded-xl bg-card border shadow-sm text-sm">
                      <span className="font-semibold text-foreground">{lang}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{level}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─── HOW TO USE TAB ─── */}
        <TabsContent value="how-to-use" className="mt-0">
          <div className="max-w-7xl mx-auto px-6 py-16">
            <div className="mb-10">
              <h2 className="font-heading text-3xl font-bold text-foreground mb-2 tracking-tight">How to Use This Tool</h2>
              <p className="text-muted-foreground">Follow these four steps to analyze your Milan real estate investment.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  step: '01',
                  title: 'Configure Location & Land',
                  desc: 'Select one of 10 Milan districts (Brera, Navigli, Porta Nuova and more). Enter land area in m², Floor Area Ratio (FAR), Building Coverage Ratio (BCR), and max floors. Transport and amenity scores are fetched live from OpenStreetMap.',
                  icon: MapPin,
                },
                {
                  step: '02',
                  title: 'Set Financial Parameters',
                  desc: 'Enter the land purchase price, equity/debt split, and interest rate. The interest rate is auto-populated from the live ECB rate. Choose construction duration, project type (Residential, Office, Mixed-Use), and quality standard.',
                  icon: Euro,
                },
                {
                  step: '03',
                  title: 'Run the Analysis',
                  desc: 'Click "Calculate Analysis" to compute hard costs, soft costs, financing costs, revenue projections, ROI, ROE, Cap Rate, 10-year DCF with NPV, and a risk score — all in one click.',
                  icon: Calculator,
                },
                {
                  step: '04',
                  title: 'Export & Get AI Insights',
                  desc: 'Download a full PDF report with all metrics, charts, and cost breakdown. Enter your Anthropic API key to generate a professional AI investment analysis covering viability, strengths, risks, and a proceed/reject recommendation.',
                  icon: FileDown,
                },
              ].map(({ step, title, desc, icon: Icon }) => (
                <div key={step} className="flex items-start gap-5 p-6 rounded-lg border bg-card">
                  <div
                    className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 text-white font-heading font-bold text-base"
                    style={{ background: 'var(--primary)' }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-10 rounded-xl p-6 border border-border bg-card">
              <p className="text-sm font-semibold text-foreground mb-1">Ready to start?</p>
              <p className="text-sm text-muted-foreground">
                Switch to the <strong>Scenario</strong> tab to open the calculator. All fields have sensible defaults —
                press &ldquo;Calculate Analysis&rdquo; immediately to see a sample result.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ─── SCENARIO TAB (CALCULATOR) ─── */}
        <TabsContent value="scenario" className="mt-0">
          <main className="max-w-7xl mx-auto px-4 py-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ─── LEFT: INPUT FORM ─── */}
          <div className="lg:col-span-5">
            {/* Location */}
            <InputSection icon={MapPin} title="Location">
              <Field label="District" span2>
                <Select value={inputs.district} onChange={set('district')} options={Object.keys(MARKET_DATA)} />
              </Field>

              {market && (
                <div className="md:col-span-2 bg-muted/40 rounded-lg p-3 space-y-2 border">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">Market Data — {inputs.district}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Sale Price:</span>
                    <span className="font-medium">
                      {fmt(market.sale)}/m²
                      {liveData.hpiSale && <span className="text-emerald-600 text-xs ml-1">(HPI adj.)</span>}
                    </span>
                    <span className="text-muted-foreground">Rent:</span>
                    <span className="font-medium">
                      {market.rent}/m²/mo
                      {liveData.hpiRent && <span className="text-emerald-600 text-xs ml-1">(HPI adj.)</span>}
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1">
                      <div className="flex-1"><ScoreBar label="Transport" score={displayTransport} icon={Train} /></div>
                      {currentOsm && <span className="text-[9px] text-emerald-600 font-medium">OSM</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex-1"><ScoreBar label="Amenities" score={displayAmenities} icon={ShoppingBag} /></div>
                      {currentOsm && <span className="text-[9px] text-emerald-600 font-medium">OSM</span>}
                    </div>
                  </div>
                  {liveData.hpiSale && (
                    <p className="text-[10px] text-emerald-600 mt-1">
                      Sale prices {liveData.hpiSale.pctChange >= 0 ? '+' : ''}{liveData.hpiSale.pctChange}% since Q1 2025 ({liveData.hpiSale.latestPeriod})
                    </p>
                  )}
                  {liveData.hpiRent && (
                    <p className="text-[10px] text-emerald-600">
                      Rent prices {liveData.hpiRent.pctChange >= 0 ? '+' : ''}{liveData.hpiRent.pctChange}% since Q1 2025 ({liveData.hpiRent.latestPeriod})
                    </p>
                  )}
                </div>
              )}
            </InputSection>

            {/* Land */}
            <InputSection icon={Building2} title="Land Information">
              <Field label="Land Area (m²)">
                <Input value={inputs.landArea} onChange={set('landArea')} min={0} />
              </Field>
              <Field label="Floor Area Ratio (FAR)">
                <Input value={inputs.far} onChange={set('far')} min={0} step={0.1} />
              </Field>
              <Field label="Building Coverage Ratio (BCR)">
                <Input value={inputs.bcr} onChange={set('bcr')} min={0} max={1} step={0.05} />
              </Field>
              <Field label="Max Floors">
                <Input value={inputs.maxFloors} onChange={set('maxFloors')} min={1} />
              </Field>
              <Field label="Land Condition">
                <Select value={inputs.landCondition} onChange={set('landCondition')} options={Object.keys(LAND_CONDITION_MULTIPLIERS)} />
              </Field>
            </InputSection>

            {/* Financial */}
            <InputSection icon={Euro} title="Financial">
              <Field label="Land Purchase Price">
                <Input value={inputs.landPrice} onChange={set('landPrice')} min={0} />
              </Field>
              <Field label="Equity Ratio (%)">
                <Input value={inputs.equityRatio} onChange={set('equityRatio')} min={0} max={100} />
              </Field>
              <Field label="Debt Ratio (%)">
                <Input value={inputs.debtRatio} onChange={set('debtRatio')} min={0} max={100} />
              </Field>
              <Field label="Interest Rate (%)">
                <Input value={inputs.interestRate} onChange={set('interestRate')} min={0} step={0.1} />
              </Field>
              <Field label="Loan Term (years)">
                <Input value={inputs.loanTerm} onChange={set('loanTerm')} min={1} />
              </Field>
            </InputSection>

            {/* Project */}
            <InputSection icon={Calculator} title="Project Preferences">
              <Field label="Project Type">
                <Select value={inputs.projectType} onChange={set('projectType')} options={['Residential', 'Office', 'Mixed-Use']} />
              </Field>
              <Field label="Quality Standard">
                <Select value={inputs.qualityStandard} onChange={set('qualityStandard')} options={['Economy', 'Mid-Range', 'Luxury']} />
              </Field>
              <Field label="Construction Duration (months)">
                <Input value={inputs.constructionDuration} onChange={set('constructionDuration')} min={1} />
              </Field>
              <Field label="Exit Strategy">
                <Select value={inputs.exitStrategy} onChange={set('exitStrategy')} options={['Sell', 'Rent']} />
              </Field>
              <Field label="Target IRR (%)">
                <Input value={inputs.targetIrr} onChange={set('targetIrr')} min={0} step={0.5} />
              </Field>
            </InputSection>

            {/* Revenue & DCF Assumptions — Collapsible */}
            <Card className="mb-4">
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger className="w-full flex items-center justify-between px-6 py-4 text-left bg-transparent border-none cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Percent className="w-4 h-4 text-primary" />
                    Revenue & DCF Assumptions
                  </span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                      <Field label="Vacancy Rate (%)">
                        <Input value={inputs.vacancyPct} onChange={set('vacancyPct')} min={0} max={100} step={0.5} />
                      </Field>
                      <Field label="Operating Expenses (%)">
                        <Input value={inputs.opexPct} onChange={set('opexPct')} min={0} max={100} step={1} />
                      </Field>
                      <Field label="Broker Fee (%)">
                        <Input value={inputs.brokerFeePct} onChange={set('brokerFeePct')} min={0} step={0.5} />
                      </Field>
                      <Field label="Net Area Ratio (%)">
                        <Input value={inputs.netAreaRatio} onChange={set('netAreaRatio')} min={0} max={100} step={1} />
                      </Field>
                      <Field label="Rent Growth (%)">
                        <Input value={inputs.rentGrowth} onChange={set('rentGrowth')} min={0} step={0.5} />
                      </Field>
                      <Field label="Exit Cap Rate (%)">
                        <Input value={inputs.exitCapRate} onChange={set('exitCapRate')} min={0.5} step={0.25} />
                      </Field>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Calculate Button */}
            <div className="space-y-2">
              <Button onClick={handleCalculate} size="lg" className="w-full">
                <Calculator className="w-5 h-5 mr-2" />
                Calculate Analysis
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setInputs(DEFAULT_INPUTS); setResults(null); setCalcInputs(null); }}
                className="w-full text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Reset to defaults
              </Button>
            </div>
          </div>

          {/* ─── RIGHT: RESULTS ─── */}
          <div className="lg:col-span-7 space-y-6">
            {results ? (
              <>
                {/* Export PDF Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleExportPdf}
                    disabled={pdfExporting}
                    variant="outline"
                    size="sm"
                  >
                    {pdfExporting
                      ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating PDF...</>
                      : <><FileDown className="w-4 h-4 mr-2" />Export PDF</>}
                  </Button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SummaryCard
                    label="Total Investment"
                    value={`€${fmt(results.costs.totalProjectCost)}`}
                    sub={`Equity: €${fmt(results.costs.equityInvested)}`}
                    color="blue"
                  />
                  {calcInputs.exitStrategy === 'Sell' ? (
                    <>
                      <SummaryCard label="Net Revenue" value={`€${fmt(results.revenue.netSales)}`} sub={`${fmt(results.area.netArea)} m² net`} color="green" />
                      <SummaryCard label="ROI (Annualized)" value={fmtPct(results.metrics.annualizedRoi)} sub={`Total: ${fmtPct(results.metrics.roi)}`} color="purple" />
                      <SummaryCard label="ROE (Annualized)" value={fmtPct(results.metrics.annualizedRoe)} sub={`Total: ${fmtPct(results.metrics.roe)}`} color="orange" />
                    </>
                  ) : (
                    <>
                      <SummaryCard label="Annual NOI" value={`€${fmt(results.revenue.noi)}`} sub={`Cap Rate: ${fmtPct(results.metrics.capRate)}`} color="green" />
                      <SummaryCard label="WACC" value={fmtPct(results.metrics.wacc)} sub={`NPV: €${fmt(results.metrics.npv)}`} color="purple" />
                      <SummaryCard label="Cash-on-Cash" value={fmtPct(results.metrics.cashOnCash)} sub={`ROE: ${fmtPct(results.metrics.roe)}`} color="orange" />
                    </>
                  )}
                </div>

                {/* Development Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      Development Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">GFA</p>
                        <p className="text-xl font-bold mt-0.5">{fmt(results.area.gfa)} m²</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Net Area</p>
                        <p className="text-xl font-bold mt-0.5">{fmt(results.area.netArea)} m²</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Floors</p>
                        <p className="text-xl font-bold mt-0.5">{results.area.actualFloors.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Footprint</p>
                        <p className="text-xl font-bold mt-0.5">{fmt(results.area.footprint)} m²</p>
                      </div>
                    </div>
                    {results.area.farIsBinding && calcInputs.maxFloors > results.area.maxFarFloors && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <span>
                          FAR ({calcInputs.far}) limits GFA to {fmt(results.area.gfa)} m² — only {results.area.maxFarFloors} floors are usable with current BCR ({calcInputs.bcr}).
                          Increasing max floors beyond {results.area.maxFarFloors} has no effect. To build higher, increase FAR or reduce BCR.
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Profitability Metrics — Tabs */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      Profitability Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue={calcInputs.exitStrategy === 'Sell' ? 'sell' : 'rent'}>
                      <TabsList className="mb-4">
                        <TabsTrigger value="sell">Sale Exit</TabsTrigger>
                        <TabsTrigger value="rent">Rental Hold</TabsTrigger>
                      </TabsList>

                      <TabsContent value="sell">
                        {results.revenue.totalSales != null ? (
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <MetricCell label="Total Sales Revenue" value={`€${fmt(results.revenue.totalSales)}`} />
                            <MetricCell label={`Broker Fee (${calcInputs.brokerFeePct}%)`} value={`-€${fmt(results.revenue.brokerFee)}`} valueClass="text-red-600" />
                            <MetricCell label="Net Sales Revenue" value={`€${fmt(results.revenue.netSales)}`} valueClass="text-emerald-600" />
                            <MetricCell
                              label="Gross Profit"
                              value={`€${fmt(results.metrics.grossProfit)}`}
                              valueClass={results.metrics.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
                            />
                            <MetricCell
                              label="ROI (Annualized)"
                              value={fmtPct(results.metrics.annualizedRoi)}
                              sub={`Total: ${fmtPct(results.metrics.roi)}`}
                            />
                            <MetricCell
                              label="ROE (Annualized)"
                              value={fmtPct(results.metrics.annualizedRoe)}
                              sub={`Total: ${fmtPct(results.metrics.roe)}`}
                            />
                            <MetricCell label="Break-even Price" value={`€${fmt(results.metrics.breakEvenPerM2)}/m²`} />
                            <MetricCell label="Market Price" value={`€${fmt(results.market.sale)}/m²`} />
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Calculate with "Sell" exit strategy to see sale metrics.</p>
                        )}
                      </TabsContent>

                      <TabsContent value="rent">
                        {results.revenue.noi != null ? (
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <MetricCell label="Gross Annual Rent" value={`€${fmt(results.revenue.grossAnnualRent)}`} />
                            <MetricCell label={`Operating Expenses (${calcInputs.opexPct}%)`} value={`-€${fmt(results.revenue.opex)}`} valueClass="text-red-600" />
                            <MetricCell label="NOI" value={`€${fmt(results.revenue.noi)}`} valueClass="text-emerald-600" />
                            <MetricCell label="Vacancy Rate" value={`${(results.revenue.vacancyRate * 100).toFixed(0)}%`} />
                            <MetricCell label="Cap Rate" value={fmtPct(results.metrics.capRate)} />
                            <MetricCell label="Cash-on-Cash Return" value={fmtPct(results.metrics.cashOnCash)} />
                            <MetricCell
                              label="ROE (NPV-based)"
                              value={fmtPct(results.metrics.roe)}
                              valueClass={results.metrics.roe >= 0 ? 'text-emerald-600' : 'text-red-600'}
                            />
                            <MetricCell
                              label="10-Year NPV"
                              value={`€${fmt(results.metrics.npv)}`}
                              valueClass={results.metrics.npv >= 0 ? 'text-emerald-600' : 'text-red-600'}
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Calculate with "Rent" exit strategy to see rental metrics.</p>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Risk Score */}
                <Card>
                  <CardContent className="pt-5">
                    <RiskBadge score={results.riskScore} />
                  </CardContent>
                </Card>

                {/* Charts */}
                {calcInputs.exitStrategy === 'Sell' ? (
                  <>
                    <ProfitWaterfallChart key={results.metrics.grossProfit} results={results} />
                    <SellReturnChart
                      key={results.metrics.roi}
                      metrics={results.metrics}
                      targetIrr={calcInputs.targetIrr}
                    />
                  </>
                ) : (
                  <>
                    <NOIProjectionChart
                      key={JSON.stringify(results.metrics.cashFlows)}
                      cashFlows={results.metrics.cashFlows}
                      noi={results.revenue.noi}
                      rentGrowth={calcInputs.rentGrowth}
                    />
                    <DCFChart
                      key={results.metrics.npv}
                      cashFlows={results.metrics.cashFlows}
                      discountedTerminal={results.metrics.discountedTerminal}
                      totalProjectCost={results.costs.totalProjectCost}
                      npv={results.metrics.npv}
                      wacc={results.metrics.wacc}
                    />
                  </>
                )}

                <CostBreakdownChart key={results.costs.totalProjectCost} costs={results.costs} />

                {/* Cost Breakdown Table */}
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold mb-3">
                    <DollarSign className="w-4 h-4 text-primary" />
                    Cost Breakdown
                  </h3>
                  <CostTable breakdown={results.costs.breakdown} totalProjectCost={results.costs.totalProjectCost} inputs={inputs} onChangeInput={set} />
                </div>

                {/* AI Analysis */}
                <AIAnalysisSection inputs={calcInputs} results={results} />
              </>
            ) : (
              <Card className="p-12 text-center">
                <Calculator className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground">
                  Fill in the project details and press{' '}
                  <span className="font-semibold text-primary">"Calculate Analysis"</span>{' '}
                  to see your results.
                </p>
              </Card>
            )}
          </div>
            </div>
          </main>
        </TabsContent>

        {/* ─── CASE INFO TAB ─── */}
        <TabsContent value="case-info" className="mt-0">
          <div className="max-w-7xl mx-auto px-6 py-16">
            <div className="mb-10">
              <h2 className="font-heading text-3xl font-bold text-foreground mb-2 tracking-tight">Milan District Overview</h2>
              <p className="text-muted-foreground">
                Live-adjusted market data for all 10 supported districts.
                {liveData.hpiSale && (
                  <span className="text-emerald-600 ml-2 text-xs font-medium">
                    Sale prices adjusted via HPI · {liveData.hpiSale.latestPeriod}
                  </span>
                )}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Object.entries(adjustedMarketData).map(([district, data]) => (
                <Card key={district} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MapPin className="w-4 h-4 text-accent" />
                      {district}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Sale Price</p>
                        <p className="font-bold text-foreground">€{fmt(data.sale)}/m²</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Rent</p>
                        <p className="font-bold text-foreground">€{data.rent}/m²/mo</p>
                      </div>
                    </div>
                    <div className="space-y-2 pt-2 border-t">
                      <ScoreBar label="Transport" score={osmScores[district]?.transport ?? data.transport} icon={Train} />
                      <ScoreBar label="Amenities" score={osmScores[district]?.amenities ?? data.amenities} icon={ShoppingBag} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

      </Tabs>

      {/* ─── FOOTER ─── */}
      <footer className="text-white py-10" style={{ background: 'oklch(0.22 0.09 264)' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="h-px mb-8" style={{ background: 'oklch(0.62 0.18 45)', opacity: 0.5 }} />
          <div className="flex flex-col sm:flex-row items-center gap-6 justify-between">
            <div className="flex items-center gap-4">
              <img
                src="/photo.png"
                alt="Alp Emre Celik"
                className="w-16 h-16 rounded-full object-cover border-2 border-accent/50"
              />
              <div>
                <p className="font-bold text-lg text-white">Alp Emre Celik</p>
                <p className="text-white/60 text-sm">MSc Built Environment · Politecnico di Milano</p>
              </div>
            </div>
            <div className="flex flex-col items-center sm:items-end gap-2 text-sm">
              <a
                href="mailto:alpemrecelik@gmail.com"
                className="text-white/70 hover:text-white transition-colors"
              >
                alpemrecelik@gmail.com
              </a>
              <a
                href="https://linktr.ee/alpemrecelik"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors"
              >
                linktr.ee/alpemrecelik
              </a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
