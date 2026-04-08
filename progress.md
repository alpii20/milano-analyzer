# Milano Analyzer — Progress Tracker

## Session: 2026-03-24
**Status:** WaterfallBars rendering fix — IN PROGRESS

### Problem
After migrating `WaterfallBars` from `<Customized>` to Recharts 3.x hooks (`useXAxisScale`, `useYAxisScale`), bars appear "half empty" or "ripped in half" — mispositioned and incorrectly sized.

### Root Cause
`bandWidth` was computed as `plotArea.width / data.length`, which ignores d3 band scale inner/outer padding. This made bars wider than their actual bands and shifted their centering off.

### Attempted Fix #1 (not fully working yet)
- Replaced `usePlotArea`-based bandwidth calculation with scale position options:
  - `bandWidth = xScale(name, {position:'end'}) - xScale(name, {position:'start'})` — real bandwidth from scale
  - `xScale(entry.name, {position:'middle'}) - barWidth/2` — centers bars correctly
  - Added null checks on all scale calls
- Removed unused `usePlotArea` import

### Current State
- Build succeeds (`npm run build` — no errors)
- Bars still not rendering correctly — awaiting screenshot from user to diagnose further
- The Recharts 3.x `ScaleFunction` position API may behave differently than expected

### Pending
- [ ] Fix WaterfallBars rendering (bars still mispositioned after first fix attempt)
- [ ] Verify tooltip still works after fix

---

## Session: 2026-03-20
**Status:** Formula corrections, dark theme, and chart redesign complete

### Phase 1 — Formula Corrections (all in `src/App.jsx`)

1. **Profit Margin** — Changed from `grossProfit / totalProjectCost` to `grossProfit / revenue.netSales` (margin on revenue, not cost)
2. **WACC Tax Shield** — Added `isCorporateEntity` flag + conditional `taxRate` (0.24 for corp, 0 otherwise) instead of hardcoded 0.24
3. **Cash-on-Cash + NPV-based ROE** — Renamed rental income-based return to `cashOnCash`, added new `roe = npv / equityInvested`. Both displayed in UI
4. **Annualized Returns** — Added 6-month `salesPeriod`, `totalYears = Math.max(1, (constructionDuration + salesPeriod) / 12)`

### Phase 2 — Dark Theme + Chart Redesign

1. **Full dark theme** — Backgrounds: `#0f172a` (page), `#1e293b` (cards), `#0b1120` (header/footer). Text: gray-100/slate-300/400/500. Accents: cyan-400 (icons/buttons), emerald-400 (positive), red-400 (negative), violet (AI section)
2. **DCF Chart redesign** — ComposedChart with Area+Bar for nominal/discounted CF, time-value-erosion bars, cumulative NPV journey starting from negative investment, PV composition bar (operating vs terminal), dark-themed tooltips
3. **All components updated** — SummaryCard, InputSection, Field, Input, Select, ScoreBar, RiskBadge, CostTable, CostBreakdownChart, ProfitWaterfallChart, AIAnalysisSection

### Pending / TODO

- [ ] `isCorporateEntity` is hardcoded `true` — make it a user input later
- [ ] Fix 5 from formula review (deferred — details TBD)
- [ ] Chunk size warning on build (636 kB) — consider code-splitting

---

## Session: 2026-03-19
**Status:** Charts, calculation fixes, and UX improvements applied

### Completed

- [x] Full React calculator with AI integration
- [x] Static market database (14 districts)
- [x] All financial formulas
- [x] Claude AI analysis feature
- [x] Updated init documentation
- [x] **MARKET_DATA updated to new construction prices** (verified from 2025-2026 sources)
- [x] **Recharts visualizations added:**
  - DCF bar chart (nominal vs discounted cash flows, 10-year + terminal)
  - Cumulative PV area chart with investment cost reference line
  - Profit waterfall chart (Sell mode)
  - Cost structure donut chart
- [x] **Max floors calculation fixed** — GFA now capped by min(FAR, floors x footprint)
- [x] **FAR binding constraint warning** shown when max floors exceeds FAR limit
- [x] **"Calculate" button added** — results only update on click, not reactively
- [x] **White screen crash fixed** — results panel now uses snapshotted inputs (calcInputs) so changing dropdowns doesn't break rendering
- [x] **ROI/ROE fixes:**
  - Equity calculation corrected: `equity = totalCost - loanAmount` (was `totalCost × equityRatio%`)
  - Annualized ROI/ROE added (CAGR over construction duration)
  - Both total and annualized returns displayed
- [x] **Chart re-render fix** — added keys to force Recharts remount on data change

### Backlog

- [ ] Vercel deployment
- [ ] PDF export
- [ ] District comparison mode (side-by-side)

### Notes

- Market data reflects new-build prices (50-100% premium over existing stock)
- Default Porta Nuova: break-even ~5,350/m² vs market 9,500/m² = healthy margin
- Annualized ROI ~31%, ROE ~75% with defaults (leveraged, 24-month project)
- Recharts added as dependency (~190kb gzipped in bundle)
- AI analysis still works (~€0.01/use via Anthropic API)

---

## Build Status

- `npm run build` succeeds
- Dev server running at localhost:5173
