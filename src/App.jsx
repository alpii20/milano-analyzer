import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import {
  Building2, MapPin, Calculator, TrendingUp, Brain, AlertTriangle,
  ChevronDown, Loader2, DollarSign, Percent, BarChart3, Shield,
  Train, ShoppingBag, Euro, FileDown
} from 'lucide-react';
import { generatePdf } from './generatePdf';
import { fetchEcbRate, fetchConstructionCostIndex, fetchHousePriceIndex, fetchRentalPriceIndex, fetchOsmScores } from './liveDataApi';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Area, ReferenceLine,
} from 'recharts';

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
    const growthRate = rentGrowth / 100;
    let dcfSum = 0;
    const cashFlows = [];
    for (let y = 1; y <= 10; y++) {
      const cf = revenue.noi * Math.pow(1 + growthRate, y);
      const discounted = cf / Math.pow(1 + wacc, y);
      dcfSum += discounted;
      cashFlows.push({ year: y, cf: Math.round(cf), discounted: Math.round(discounted) });
    }
    // Terminal value (Exit Cap Rate — industry standard for real estate)
    const exitCapRate = exitCapRatePct / 100;
    const year10NOI = revenue.noi * Math.pow(1 + growthRate, 10);
    const terminalValue = year10NOI / exitCapRate;
    const discountedTerminal = terminalValue / Math.pow(1 + wacc, 10);
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

// ─── UI COMPONENTS ─────────────────────────────────────────────────────────────

function InputSection({ icon: Icon, title, children }) {
  return (
    <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-5 mb-4">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-100 mb-4">
        <Icon className="w-5 h-5 text-cyan-400" />
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, span2 }) {
  return (
    <label className={`block ${span2 ? 'md:col-span-2' : ''}`}>
      <span className="text-sm font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, type = 'number', ...props }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
      className="mt-1 block w-full rounded-lg border border-[#475569] bg-[#0f172a] text-gray-200 px-3 py-2 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
      {...props}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <div className="relative mt-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full appearance-none rounded-lg border border-[#475569] bg-[#0f172a] text-gray-200 px-3 py-2 pr-8 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
      >
        {options.map((o) => (
          <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
            {typeof o === 'string' ? o : o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
    </div>
  );
}

function ScoreBar({ label, score, icon: Icon }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? 'bg-emerald-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
      <span className="text-sm text-slate-400 w-24 shrink-0">{label}</span>
      <div className="flex-1 bg-[#1e293b] rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-slate-300 w-8 text-right">{score}/10</span>
    </div>
  );
}

function SummaryCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'from-[#164e63] to-[#0e3a4a] border-cyan-800/50',
    green: 'from-[#14532d] to-[#0a3318] border-emerald-800/50',
    purple: 'from-[#3b1f6e] to-[#2a1550] border-violet-800/50',
    orange: 'from-[#7c2d12] to-[#5c1d0a] border-orange-900/50',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} rounded-xl p-5 text-white border`}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function RiskBadge({ score }) {
  let label, color;
  if (score <= 3) { label = 'Low Risk'; color = 'bg-emerald-900/50 text-emerald-400'; }
  else if (score <= 6) { label = 'Medium Risk'; color = 'bg-amber-900/50 text-amber-400'; }
  else { label = 'High Risk'; color = 'bg-red-900/50 text-red-400'; }

  return (
    <div className="flex items-center gap-3">
      <Shield className="w-5 h-5 text-slate-400" />
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium text-slate-300">Risk Score</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
        </div>
        <div className="w-full bg-[#0f172a] rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${
              score <= 3 ? 'bg-emerald-500' : score <= 6 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${score * 10}%` }}
          />
        </div>
        <p className="text-right text-xs text-slate-500 mt-0.5">{score} / 10</p>
      </div>
    </div>
  );
}

function PctInput({ value, onChange, step = 0.5 }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={0}
      step={step}
      className="w-16 text-right rounded border border-[#475569] bg-[#0f172a] text-cyan-300 px-1.5 py-0.5 text-xs focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
    />
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
    <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#0f172a] border-b border-[#334155]">
            <th className="text-left px-5 py-3 font-semibold text-slate-300">Cost Item</th>
            <th className="text-center px-3 py-3 font-semibold text-slate-300 w-24">%</th>
            <th className="text-right px-5 py-3 font-semibold text-slate-300">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <Fragment key={s.title}>
              <tr className="bg-[#0f172a]/50">
                <td colSpan={3} className="px-5 py-2 font-semibold text-slate-500 text-xs uppercase tracking-wide">{s.title}</td>
              </tr>
              {s.items.map((item) => (
                <tr key={item.label} className="border-b border-[#1e293b]">
                  <td className="px-5 py-2 text-slate-400 pl-8">{item.label}</td>
                  <td className="px-3 py-2 text-center">
                    {item.pctKey ? (
                      <PctInput value={inputs[item.pctKey]} onChange={onChangeInput(item.pctKey)} step={item.step} />
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-right text-slate-200 font-medium">€{fmt(item.value)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr className="bg-cyan-950/40 font-bold">
            <td className="px-5 py-3 text-cyan-400">Total Project Cost</td>
            <td className="px-3 py-3" />
            <td className="px-5 py-3 text-right text-cyan-400">€{fmt(totalProjectCost)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── CHART COMPONENTS ────────────────────────────────────────────────────────

const CHART_COLORS = ['#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const euroTooltipFormatter = (value) => `€${fmt(Math.round(value))}`;

function DCFChart({ cashFlows, discountedTerminal, totalProjectCost, npv, wacc }) {
  // Data for the combo chart — bars for nominal/discounted + line for discount factor
  const data = cashFlows.map((cf) => ({
    name: `Y${cf.year}`,
    nominal: cf.cf,
    discounted: cf.discounted,
    erosion: cf.cf - cf.discounted,
  }));
  data.push({
    name: 'Terminal',
    nominal: null,
    discounted: discountedTerminal,
    erosion: null,
  });

  // Cumulative NPV data — starts negative (investment), climbs with each year's PV
  let cumNpv = -totalProjectCost;
  const cumulativeData = [{ name: 'Invest', cumNpv: Math.round(cumNpv) }];
  cashFlows.forEach((cf) => {
    cumNpv += cf.discounted;
    cumulativeData.push({ name: `Y${cf.year}`, cumNpv: Math.round(cumNpv) });
  });
  cumNpv += discountedTerminal;
  cumulativeData.push({ name: 'Terminal', cumNpv: Math.round(cumNpv) });

  // PV composition — operating vs terminal
  const operatingPV = cashFlows.reduce((sum, cf) => sum + cf.discounted, 0);
  const terminalPct = ((discountedTerminal / (operatingPV + discountedTerminal)) * 100).toFixed(0);
  const operatingPct = 100 - Number(terminalPct);

  const darkTooltipStyle = {
    contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' },
    labelStyle: { color: '#94a3b8' },
    itemStyle: { color: '#e2e8f0' },
  };

  return (
    <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-5 space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-100 mb-1">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          DCF Analysis
        </h3>
        <p className="text-xs text-slate-500">10-year projection &middot; WACC {fmtPct(wacc)}</p>
      </div>

      {/* Chart 1: Nominal vs Discounted — ComposedChart with erosion shading */}
      <div>
        <p className="text-sm font-medium text-slate-400 mb-3">Cash Flow: Nominal vs Present Value</p>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 10, right: 15, left: 15, bottom: 5 }}>
            <defs>
              <linearGradient id="nominalGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#475569' }} tickLine={false} />
            <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={euroTooltipFormatter} {...darkTooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            <Area type="monotone" dataKey="nominal" name="Nominal CF" fill="url(#nominalGrad)" stroke="#06b6d4" strokeWidth={2} dot={false} />
            <Bar dataKey="discounted" name="Present Value" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={28} fillOpacity={0.85} />
            <Bar dataKey="erosion" name="Time Value Erosion" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={28} fillOpacity={0.35} stackId="detail" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Cumulative NPV Journey — area that crosses zero */}
      <div>
        <p className="text-sm font-medium text-slate-400 mb-3">Cumulative NPV Journey</p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={cumulativeData} margin={{ top: 10, right: 15, left: 15, bottom: 5 }}>
            <defs>
              <linearGradient id="npvGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="40%" stopColor="#22c55e" stopOpacity={0.05} />
                <stop offset="60%" stopColor="#ef4444" stopOpacity={0.05} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#475569' }} tickLine={false} />
            <YAxis tickFormatter={(v) => `€${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={euroTooltipFormatter} {...darkTooltipStyle} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: 'Breakeven', position: 'right', fontSize: 11, fill: '#94a3b8' }} />
            <Area type="monotone" dataKey="cumNpv" name="Cumulative NPV" fill="url(#npvGrad)" stroke="#06b6d4" strokeWidth={2.5} dot={{ fill: '#06b6d4', strokeWidth: 0, r: 4 }} activeDot={{ r: 6, fill: '#06b6d4' }} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-cyan-500 inline-block" /> Cumulative NPV
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-0.5 inline-block" style={{ borderTop: '2px dashed #94a3b8' }} /> Breakeven line
          </span>
        </div>
      </div>

      {/* PV Composition bar */}
      <div>
        <p className="text-sm font-medium text-slate-400 mb-2">Present Value Composition</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-5 rounded-full overflow-hidden bg-[#0f172a] flex">
            <div className="h-full bg-cyan-500/70" style={{ width: `${operatingPct}%` }} />
            <div className="h-full bg-violet-500/70" style={{ width: `${terminalPct}%` }} />
          </div>
        </div>
        <div className="flex justify-between mt-1.5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" /> Operating CF: {operatingPct}% (€{fmt(operatingPV)})</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> Terminal Value: {terminalPct}% (€{fmt(discountedTerminal)})</span>
        </div>
      </div>

      {/* NPV callout */}
      <div className={`rounded-lg p-3 text-sm font-medium ${npv >= 0 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/30' : 'bg-red-950/40 text-red-400 border border-red-800/30'}`}>
        Net Present Value: <span className="font-bold">€{fmt(npv)}</span>
        {npv >= 0
          ? ' — Project creates value above required return'
          : ' — Project does not meet required return threshold'}
      </div>
    </div>
  );
}

function CostBreakdownChart({ costs }) {
  const data = [
    { name: 'Hard Costs', value: costs.hardCosts, color: '#06b6d4' },
    { name: 'Soft Costs', value: costs.softCosts, color: '#22c55e' },
    { name: 'Land & Site', value: costs.landSiteCosts, color: '#f59e0b' },
    { name: 'Financing', value: costs.financingCosts, color: '#ef4444' },
  ];
  const total = costs.totalProjectCost;

  return (
    <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-100 mb-4">
        <DollarSign className="w-5 h-5 text-cyan-400" />
        Cost Structure
      </h3>
      <div className="flex flex-col md:flex-row items-center gap-4">
        <ResponsiveContainer width="100%" height={220} className="md:max-w-[240px]">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={euroTooltipFormatter} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2 w-full">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-sm text-slate-400 flex-1">{item.name}</span>
              <span className="text-sm font-semibold text-slate-200">€{fmt(item.value)}</span>
              <span className="text-xs text-slate-500 w-12 text-right">{((item.value / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfitWaterfallChart({ results }) {
  const items = [
    { name: 'Revenue', value: results.revenue.totalSales, fill: '#22c55e' },
    { name: 'Broker Fee', value: -results.revenue.brokerFee, fill: '#f59e0b' },
    { name: 'Hard Costs', value: -results.costs.hardCosts, fill: '#ef4444' },
    { name: 'Soft Costs', value: -results.costs.softCosts, fill: '#f87171' },
    { name: 'Land & Site', value: -results.costs.landSiteCosts, fill: '#fb923c' },
    { name: 'Financing', value: -results.costs.financingCosts, fill: '#fbbf24' },
  ];

  // Build waterfall data using stacked-bar approach: invisible base + visible delta.
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
    fill: profit >= 0 ? '#22c55e' : '#ef4444',
    value: profit,
  });

  return (
    <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-100 mb-4">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        Profit Waterfall
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#475569' }} tickLine={false} />
          <YAxis
            domain={[0, (max) => max]}
            tickFormatter={(v) => `€${(v / 1000000).toFixed(1)}M`}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine y={0} stroke="#475569" strokeOpacity={0.9} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              if (!d) return null;
              return (
                <div className="bg-[#1e293b] border border-[#334155] shadow-md rounded-lg px-3 py-2 text-sm">
                  <p className="font-medium text-slate-300">{d.name}</p>
                  <p className={d.value >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {d.value >= 0 ? '+' : ''}€{fmt(d.value)}
                  </p>
                </div>
              );
            }}
          />
          {/* Invisible base bar to lift the visible bar to the correct position */}
          <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
          {/* Visible delta bar with per-item colors */}
          <Bar dataKey="delta" stackId="waterfall" isAnimationActive={false} radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── AI ANALYSIS ───────────────────────────────────────────────────────────────

function AIAnalysisSection({ inputs, results }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState('');

  const generateAnalysis = async () => {
    if (!apiKey) { setError('Please enter your Anthropic API key.'); return; }
    setLoading(true);
    setError(null);

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
          model: 'claude-sonnet-4-20250514',
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
    <div className="bg-gradient-to-br from-[#1e1b4b] to-[#0f172a] rounded-xl border border-violet-900/50 p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-violet-300 mb-4">
        <Brain className="w-5 h-5" />
        AI Investment Analysis
        <span className="text-xs bg-violet-900/50 text-violet-400 px-2 py-0.5 rounded-full ml-2">Powered by Claude</span>
      </h3>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="password"
          placeholder="Anthropic API Key (sk-ant-...)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="flex-1 rounded-lg border border-violet-800/50 bg-[#0f172a] text-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none placeholder-slate-600"
        />
        <button
          onClick={generateAnalysis}
          disabled={loading || !results}
          className="bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 disabled:text-violet-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border-none cursor-pointer"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : 'Generate Analysis'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/30 text-red-400 rounded-lg p-3 text-sm mb-4">
          <AlertTriangle className="w-4 h-4 inline mr-1" /> {error}
        </div>
      )}

      {analysis && (
        <div className="bg-[#0f172a]/70 rounded-lg p-5 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
          {analysis}
        </div>
      )}

      {!analysis && !loading && (
        <p className="text-sm text-violet-500/70 italic">
          Complete your project inputs, then click "Generate Analysis" for AI-powered investment insights. (~€0.01 per analysis)
        </p>
      )}
    </div>
  );
}

// ─── LIVE DATA BADGE ─────────────────────────────────────────────────────────

function LiveBadge({ loading, error, text }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 mt-1">
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
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500 mt-1">
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

  // Lazy OSM fetch per district
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
    <div className="min-h-screen bg-[#0f172a]">
      {/* Header */}
      <header className="bg-[#0b1120] border-b border-[#1e293b] shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-gray-100">
                <Building2 className="w-8 h-8 text-cyan-400" />
                Milano Investment Analyzer
              </h1>
              <p className="text-slate-500 text-sm mt-1">AI-Powered Real Estate Feasibility Analysis</p>
            </div>
            <span className="bg-violet-900/40 border border-violet-700/30 text-violet-400 text-xs px-3 py-1 rounded-full">
              AI-Powered
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ─── LEFT: INPUT FORM ─── */}
          <div className="lg:col-span-5">
            {/* Location */}
            <InputSection icon={MapPin} title="Location">
              <Field label="District" span2>
                <Select value={inputs.district} onChange={set('district')} options={Object.keys(MARKET_DATA)} />
              </Field>

              {market && (
                <div className="md:col-span-2 bg-[#0f172a] rounded-lg p-3 space-y-2 border border-[#334155]">
                  <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Market Data — {inputs.district}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Sale Price:</span>
                    <span className="font-medium text-slate-300">
                      {fmt(market.sale)}/m²
                      {liveData.hpiSale && <span className="text-emerald-500 text-xs ml-1">(HPI adj.)</span>}
                    </span>
                    <span className="text-slate-500">Rent:</span>
                    <span className="font-medium text-slate-300">
                      {market.rent}/m²/mo
                      {liveData.hpiRent && <span className="text-emerald-500 text-xs ml-1">(HPI adj.)</span>}
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1">
                      <div className="flex-1"><ScoreBar label="Transport" score={displayTransport} icon={Train} /></div>
                      {currentOsm && <span className="text-[9px] text-emerald-500 font-medium">OSM</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex-1"><ScoreBar label="Amenities" score={displayAmenities} icon={ShoppingBag} /></div>
                      {currentOsm && <span className="text-[9px] text-emerald-500 font-medium">OSM</span>}
                    </div>
                  </div>
                  {liveData.hpiSale && (
                    <p className="text-[10px] text-emerald-500 mt-1">
                      Sale prices {liveData.hpiSale.pctChange >= 0 ? '+' : ''}{liveData.hpiSale.pctChange}% since Q1 2025 ({liveData.hpiSale.latestPeriod})
                    </p>
                  )}
                  {liveData.hpiRent && (
                    <p className="text-[10px] text-emerald-500">
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

            {/* Revenue & DCF Assumptions */}
            <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] mb-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-5 text-left bg-transparent border-none cursor-pointer"
              >
                <span className="flex items-center gap-2 text-base font-semibold text-gray-100">
                  <Percent className="w-5 h-5 text-cyan-400" />
                  Revenue & DCF Assumptions
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
              {showAdvanced && (
                <div className="px-5 pb-5 space-y-3">
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
                </div>
              )}
            </div>

            {/* Calculate Button */}
            <button
              onClick={handleCalculate}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-3 px-6 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 border-none cursor-pointer text-base"
            >
              <Calculator className="w-5 h-5" />
              Calculate Analysis
            </button>
          </div>

          {/* ─── RIGHT: RESULTS ─── */}
          <div className="lg:col-span-7 space-y-6">
            {results ? (
              <>
                {/* Export PDF Button */}
                <div className="flex justify-end">
                  <button
                    onClick={handleExportPdf}
                    disabled={pdfExporting}
                    className="bg-[#1e293b] hover:bg-[#334155] disabled:opacity-50 text-slate-300 hover:text-cyan-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-[#334155] cursor-pointer"
                  >
                    {pdfExporting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...</>
                      : <><FileDown className="w-4 h-4" /> Export PDF</>}
                  </button>
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

                {/* Area Summary */}
                <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-5">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-100 mb-3">
                    <BarChart3 className="w-5 h-5 text-cyan-400" />
                    Development Summary
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">GFA</p>
                      <p className="text-xl font-bold text-gray-100">{fmt(results.area.gfa)} m²</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Net Area</p>
                      <p className="text-xl font-bold text-gray-100">{fmt(results.area.netArea)} m²</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Floors</p>
                      <p className="text-xl font-bold text-gray-100">{results.area.actualFloors.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Footprint</p>
                      <p className="text-xl font-bold text-gray-100">{fmt(results.area.footprint)} m²</p>
                    </div>
                  </div>
                  {results.area.farIsBinding && calcInputs.maxFloors > results.area.maxFarFloors && (
                    <div className="mt-3 bg-amber-950/30 border border-amber-800/30 rounded-lg px-3 py-2 text-xs text-amber-400 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        FAR ({calcInputs.far}) limits GFA to {fmt(results.area.gfa)} m² — only {results.area.maxFarFloors} floors are usable with current BCR ({calcInputs.bcr}).
                        Increasing max floors beyond {results.area.maxFarFloors} has no effect. To build higher, increase FAR or reduce BCR.
                      </span>
                    </div>
                  )}
                </div>

                {/* Profitability Metrics */}
                <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-5">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-100 mb-3">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    {calcInputs.exitStrategy === 'Sell' ? 'Sale Profitability' : 'Rental Profitability'}
                  </h3>
                  {calcInputs.exitStrategy === 'Sell' ? (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Total Sales Revenue</p>
                        <p className="text-lg font-bold text-slate-200">€{fmt(results.revenue.totalSales)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Broker Fee ({calcInputs.brokerFeePct}%)</p>
                        <p className="text-lg font-bold text-red-400">-€{fmt(results.revenue.brokerFee)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Net Sales Revenue</p>
                        <p className="text-lg font-bold text-emerald-400">€{fmt(results.revenue.netSales)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Gross Profit</p>
                        <p className={`text-lg font-bold ${results.metrics.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          €{fmt(results.metrics.grossProfit)}
                        </p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">ROI (Annualized)</p>
                        <p className="text-lg font-bold text-slate-200">{fmtPct(results.metrics.annualizedRoi)}</p>
                        <p className="text-xs text-slate-600">Total: {fmtPct(results.metrics.roi)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">ROE (Annualized)</p>
                        <p className="text-lg font-bold text-slate-200">{fmtPct(results.metrics.annualizedRoe)}</p>
                        <p className="text-xs text-slate-600">Total: {fmtPct(results.metrics.roe)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Break-even Price</p>
                        <p className="text-lg font-bold text-slate-200">€{fmt(results.metrics.breakEvenPerM2)}/m²</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Market Price</p>
                        <p className="text-lg font-bold text-slate-200">€{fmt(results.market.sale)}/m²</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Gross Annual Rent</p>
                        <p className="text-lg font-bold text-slate-200">€{fmt(results.revenue.grossAnnualRent)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Operating Expenses ({calcInputs.opexPct}%)</p>
                        <p className="text-lg font-bold text-red-400">-€{fmt(results.revenue.opex)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">NOI</p>
                        <p className="text-lg font-bold text-emerald-400">€{fmt(results.revenue.noi)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Vacancy Rate</p>
                        <p className="text-lg font-bold text-slate-200">{(results.revenue.vacancyRate * 100).toFixed(0)}%</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Cap Rate</p>
                        <p className="text-lg font-bold text-slate-200">{fmtPct(results.metrics.capRate)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">Cash-on-Cash Return</p>
                        <p className="text-lg font-bold text-slate-200">{fmtPct(results.metrics.cashOnCash)}</p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">ROE (NPV-based)</p>
                        <p className={`text-lg font-bold ${results.metrics.roe >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fmtPct(results.metrics.roe)}
                        </p>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-slate-500">10-Year NPV</p>
                        <p className={`text-lg font-bold ${results.metrics.npv >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          €{fmt(results.metrics.npv)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Risk Score */}
                <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-5">
                  <RiskBadge score={results.riskScore} />
                </div>

                {/* Charts */}
                {calcInputs.exitStrategy === 'Sell' ? (
                  <ProfitWaterfallChart key={results.metrics.grossProfit} results={results} />
                ) : (
                  <DCFChart
                    key={JSON.stringify(results.metrics.cashFlows)}
                    cashFlows={results.metrics.cashFlows}
                    discountedTerminal={results.metrics.discountedTerminal}
                    totalProjectCost={results.costs.totalProjectCost}
                    npv={results.metrics.npv}
                    wacc={results.metrics.wacc}
                  />
                )}

                <CostBreakdownChart key={results.costs.totalProjectCost} costs={results.costs} />

                {/* Cost Breakdown Table */}
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-100 mb-3">
                    <DollarSign className="w-5 h-5 text-cyan-400" />
                    Cost Breakdown
                  </h3>
                  <CostTable breakdown={results.costs.breakdown} totalProjectCost={results.costs.totalProjectCost} inputs={inputs} onChangeInput={set} />
                </div>

                {/* AI Analysis */}
                <AIAnalysisSection inputs={inputs} results={results} />
              </>
            ) : (
              <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-12 text-center text-slate-500">
                <Calculator className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Fill in the project details and press <span className="font-semibold text-cyan-400">"Calculate Analysis"</span> to see your results.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0b1120] border-t border-[#1e293b] mt-12 py-6 text-center text-sm text-slate-600">
        <p>Milano Investment Analyzer &copy; 2026 &middot; Built by Alp &middot; Data sources: OMI, Immobiliare.it</p>
      </footer>
    </div>
  );
}
