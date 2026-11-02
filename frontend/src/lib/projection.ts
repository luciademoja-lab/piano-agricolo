// Projections: income, costs and balance month by month for three years, in three scenarios.
//   pessimistic: lowest income, highest costs, slowest start, longest cycle
//   base:        the midpoint of every range
//   optimistic:  highest income, lowest costs, fastest start, shortest cycle
// Every number comes from the catalogue (the schema, to be confirmed) or from the expenses entered.
// What is missing is listed, never filled with a guess.
import { cropById, type Catalog, type Crop, type Range } from './catalog';
import { addDays, addMonths, daysBetween, daysInMonth, monthOf, monthStart, nextMonth, type DateStr } from './dates';
import { HORIZON_MONTHS, scaleFactor, type Expense, type Planting } from './plan';

export const SCENARIOS = ['pess', 'base', 'opt'] as const;
export type Scenario = (typeof SCENARIOS)[number];
export const SCENARIO_LABEL: Record<Scenario, string> = { pess: 'Pessimista', base: 'Base', opt: 'Ottimista' };
export type Triple = Record<Scenario, number>;
const zero = (): Triple => ({ pess: 0, base: 0, opt: 0 });

/** low/high for income-like values (more is better) */
const pick = (r: Range, s: Scenario) => (s === 'pess' ? r.min : s === 'opt' ? r.max : (r.min + r.max) / 2);
/** for durations and costs (less is better) */
const pickInv = (r: Range, s: Scenario) => (s === 'pess' ? r.max : s === 'opt' ? r.min : (r.min + r.max) / 2);

export type MonthRow = { month: string; income: Triple; cost: Triple; net: Triple; cumulative: Triple };
export type Missing = { plantingId: string; crop: string; what: string };
export type Projection = { months: MonthRow[]; missing: Missing[] };

/** The first day income arrives, in a scenario. */
export function firstIncomeDate(crop: Crop, start: DateStr, s: Scenario): DateStr {
  return addDays(start, Math.round(pickInv(crop.firstIncomeDays, s)));
}

/** Income of one crop in one calendar month, already scaled to its size and to the share sold. */
export function incomeInMonth(crop: Crop, p: Planting, month: string, s: Scenario): number {
  const inc = crop.income;
  if (!inc) return 0;
  const factor = scaleFactor(crop, p) * (p.soldPct / 100);
  const d0 = firstIncomeDate(crop, p.start, s);
  if (inc.kind === 'yearly') {
    // one income a year, in the month of the first harvest and every twelve months after
    for (let k = 0; k < 40; k++) {
      const m = monthOf(addMonths(d0, 12 * k));
      if (m === month) return pick(inc, s) * factor;
      if (m > month) break;
    }
    return 0;
  }
  const perMonth = inc.kind === 'monthly' ? pick(inc, s) : pick(inc, s) * (30.4375 / pickInv(inc.cycleDays, s));
  const first = monthStart(month), dim = daysInMonth(month);
  if (monthOf(d0) > month) return 0;
  const activeDays = monthOf(d0) === month ? dim - daysBetween(first, d0) : dim;
  return perMonth * (activeDays / dim) * factor;
}

/** What one expense counts in a scenario: what was really paid, otherwise the planned range. */
export const expenseAmount = (e: Expense, s: Scenario) => (e.paid && e.actualAmount !== null ? e.actualAmount : pickInv({ min: e.amountMin, max: e.amountMax }, s));

/** What the schema does not say for a crop in the plan. */
export function missingFor(crop: Crop, p: Planting): Missing[] {
  const m = (what: string) => ({ plantingId: p.id, crop: crop.name, what });
  const out: Missing[] = [];
  if (!crop.income) out.push(m('ricavo'));
  if (!crop.recurringMonthly) out.push(m('costi ricorrenti'));
  if (!crop.budget) out.push(m('investimento iniziale'));
  if (!crop.hoursPerWeek) out.push(m('ore di lavoro'));
  if (!crop.ps) out.push(m('Produzione Standard'));
  return out;
}

export function project(plantings: Planting[], catalog: Catalog, expenses: Expense[], firstMonth: string, months = HORIZON_MONTHS): Projection {
  const rows: MonthRow[] = [];
  const cum = zero();
  let month = firstMonth;
  for (let i = 0; i < months; i++, month = nextMonth(month)) {
    const income = zero(), cost = zero();
    for (const p of plantings) {
      const crop = cropById(catalog, p.cropId);
      if (!crop) continue;
      for (const s of SCENARIOS) {
        income[s] += incomeInMonth(crop, p, month, s);
        if (crop.recurringMonthly && monthOf(p.start) <= month) cost[s] += pickInv(crop.recurringMonthly, s) * scaleFactor(crop, p);
      }
    }
    for (const e of expenses) if (monthOf(e.date) === month) for (const s of SCENARIOS) cost[s] += expenseAmount(e, s);
    const net = zero();
    for (const s of SCENARIOS) { net[s] = income[s] - cost[s]; cum[s] += net[s]; }
    rows.push({ month, income, cost, net, cumulative: { ...cum } });
  }
  const missing = plantings.flatMap((p) => { const c = cropById(catalog, p.cropId); return c ? missingFor(c, p) : []; });
  return { months: rows, missing };
}

/** Totals over the first n months (1, 3, 6, 12, 24, 36). */
export const HORIZONS = [1, 3, 6, 12, 24, 36] as const;
export function totals(pr: Projection, n: number): { income: Triple; cost: Triple; net: Triple } {
  const t = { income: zero(), cost: zero(), net: zero() };
  for (const r of pr.months.slice(0, n)) for (const s of SCENARIOS) { t.income[s] += r.income[s]; t.cost[s] += r.cost[s]; t.net[s] += r.net[s]; }
  return t;
}

/** Year k (0, 1, 2) of the projection. */
export const yearTotals = (pr: Projection, k: number) => {
  const t = { income: zero(), cost: zero(), net: zero() };
  for (const r of pr.months.slice(12 * k, 12 * k + 12)) for (const s of SCENARIOS) { t.income[s] += r.income[s]; t.cost[s] += r.cost[s]; t.net[s] += r.net[s]; }
  return t;
};

/** Weekly hours of the whole plan, scaled to each crop's size; crops without data are left out (and listed as missing). */
export function weeklyHours(plantings: Planting[], catalog: Catalog): Range {
  const r = { min: 0, max: 0 };
  for (const p of plantings) {
    const c = cropById(catalog, p.cropId);
    if (!c?.hoursPerWeek) continue;
    const f = scaleFactor(c, p);
    r.min += c.hoursPerWeek.min * f; r.max += c.hoursPerWeek.max * f;
  }
  return r;
}

/** Produzione Standard of the plan, from the crops whose value is known. */
export function standardOutput(plantings: Planting[], catalog: Catalog): { known: number; unknown: string[] } {
  let known = 0;
  const unknown: string[] = [];
  for (const p of plantings) {
    const c = cropById(catalog, p.cropId);
    if (!c) continue;
    if (!c.ps) { unknown.push(c.name); continue; }
    const qty = c.ps.unit === 'capo' ? p.heads ?? 0 : p.m2;
    known += (c.ps.value * qty) / c.ps.per;
  }
  return { known, unknown: [...new Set(unknown)] };
}

/** Thresholds that matter for the plan (see the Regolamenti page for the sources). */
export const THRESHOLDS = {
  /** young-farmer grant (SRE01 Calabria 2025): minimum Produzione Standard */
  psMin: 12000,
  /** VAT exemption for small farmers: yearly turnover */
  vatExemption: 7000,
  /** SRE01 Calabria 2025: minimum net income in the business plan */
  netIncomeMin: 13729.32,
  /** SRE01 Calabria 2025: yearly work hours (ordinary areas) */
  hoursMin: 1840,
};

export const euro = (n: number, digits = 0) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits, minimumFractionDigits: digits, useGrouping: 'always' } as Intl.NumberFormatOptions);
