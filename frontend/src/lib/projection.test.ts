import { describe, it, expect } from 'vitest';
import { CATALOG, cropById } from './catalog';
import type { Expense, Planting } from './plan';
import { firstIncomeDate, incomeInMonth, project, standardOutput, totals, weeklyHours, yearTotals } from './projection';

const p = (x: Partial<Planting> & Pick<Planting, 'cropId' | 'm2' | 'start'>): Planting => ({ id: x.cropId, heads: null, soldPct: 100, note: '', createdAt: 0, ...x });
const crop = (id: string) => cropById(CATALOG, id)!;

describe('income of one crop in one month', () => {
  it('starts in the first-income month, pro rata, and is full afterwards (monthly crops)', () => {
    const orto = p({ cropId: 'orto-eterno', m2: 250, start: '2027-01-01' });
    // base: first income after (45+90)/2 = 67.5 → 68 days: 10 March
    expect(firstIncomeDate(crop('orto-eterno'), '2027-01-01', 'base')).toBe('2027-03-10');
    expect(incomeInMonth(crop('orto-eterno'), orto, '2027-02', 'base')).toBe(0);
    expect(incomeInMonth(crop('orto-eterno'), orto, '2027-03', 'base')).toBeCloseTo(800 * 22 / 31);
    expect(incomeInMonth(crop('orto-eterno'), orto, '2027-04', 'base')).toBe(800);
  });
  it('scales on the area and on the share sold', () => {
    const half = p({ cropId: 'orto-eterno', m2: 125, start: '2027-01-01', soldPct: 50 });
    expect(incomeInMonth(crop('orto-eterno'), half, '2027-04', 'base')).toBe(200);
  });
  it('scales the hen house on the hens, not the m²', () => {
    const hens = p({ cropId: 'pollaio', m2: 50, heads: 6, start: '2026-01-01' });
    expect(incomeInMonth(crop('pollaio'), hens, '2026-06', 'pess')).toBeCloseTo(500 * 6 / 20);
    expect(incomeInMonth(crop('pollaio'), hens, '2026-06', 'opt')).toBeCloseTo(700 * 6 / 20);
  });
  it('turns a per-cycle income into a monthly one (microgreens: 7 to 15 day cycles)', () => {
    const mg = p({ cropId: 'microgreens', m2: 1.5, start: '2026-01-01' });
    expect(incomeInMonth(crop('microgreens'), mg, '2026-06', 'pess')).toBeCloseTo(500 * 30.4375 / 15);
    expect(incomeInMonth(crop('microgreens'), mg, '2026-06', 'opt')).toBeCloseTo(1000 * 30.4375 / 7);
  });
  it('counts a yearly crop once a year, in the harvest month', () => {
    const saffron = p({ cropId: 'zafferano', m2: 100, start: '2027-08-01' });
    const months = ['2027-10', '2027-11', '2027-12', '2028-11'].map((m) => incomeInMonth(crop('zafferano'), saffron, m, 'base'));
    expect(months).toEqual([0, 5400, 0, 5400]);
  });
  it('counts zero for a crop whose income is missing', () => {
    expect(incomeInMonth(crop('olivo'), p({ cropId: 'olivo', m2: 1000, start: '2026-11-02' }), '2031-01', 'opt')).toBe(0);
  });
});

describe('the projection of the whole plan', () => {
  const plan = [p({ cropId: 'orto-eterno', m2: 250, start: '2026-11-02' }), p({ cropId: 'olivo', m2: 500, start: '2026-11-02' })];
  const expenses: Expense[] = [
    { id: 'e1', plantingId: 'orto-eterno', title: 'Investimento', date: '2026-11-02', amountMin: 400, amountMax: 800, kind: 'investment', paid: false, actualAmount: null, source: 'catalog' },
    { id: 'e2', plantingId: null, title: 'Rete', date: '2027-01-15', amountMin: 100, amountMax: 100, kind: 'other', paid: true, actualAmount: 130, source: 'manual' },
  ];
  const pr = project(plan, CATALOG, expenses, '2026-11');
  it('covers 36 months from the first one', () => {
    expect(pr.months).toHaveLength(36);
    expect(pr.months[0].month).toBe('2026-11');
    expect(pr.months[35].month).toBe('2029-10');
  });
  it('uses the highest planned cost in the pessimistic scenario, and the amount really paid once paid', () => {
    expect(pr.months[0].cost).toEqual({ pess: 800, base: 600, opt: 400 });
    expect(pr.months[2].cost).toEqual({ pess: 130, base: 130, opt: 130 });
  });
  it('keeps a running balance per scenario', () => {
    const t = totals(pr, 36);
    expect(pr.months[35].cumulative.base).toBeCloseTo(t.net.base);
    expect(t.net.pess).toBeLessThan(t.net.opt);
    expect(yearTotals(pr, 0).income.base + yearTotals(pr, 1).income.base + yearTotals(pr, 2).income.base).toBeCloseTo(t.income.base);
  });
  it('lists what is missing instead of guessing it', () => {
    expect(pr.missing.filter((m) => m.crop === 'Olivo da specialista').map((m) => m.what)).toEqual(['ricavo', 'costi ricorrenti', 'ore di lavoro', 'Produzione Standard']);
    expect(pr.missing.filter((m) => m.crop === 'Orto eterno (no-dig)').map((m) => m.what)).toEqual(['costi ricorrenti', 'Produzione Standard']);
  });
});

describe('hours and Produzione Standard', () => {
  it('adds up the weekly hours of the crops that have them, scaled to their size', () => {
    expect(weeklyHours([p({ cropId: 'orto-eterno', m2: 125, start: '2026-11-02' }), p({ cropId: 'olivo', m2: 500, start: '2026-11-02' })], CATALOG)).toEqual({ min: 3.5, max: 3.5 });
  });
  it('sums the known values and names the crops without one', () => {
    const r = standardOutput([p({ cropId: 'funghi', m2: 10, start: '2026-11-02' }), p({ cropId: 'pollaio', m2: 50, heads: 6, start: '2026-11-02' })], CATALOG);
    expect(r.known).toBeCloseTo(3807.6);
    expect(r.unknown).toEqual(['Pollaio da reddito']);
  });
});
