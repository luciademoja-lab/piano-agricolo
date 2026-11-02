import { describe, it, expect } from 'vitest';
import { CATALOG, cropById, inWindow, startRange, validateCrop, windowLabel, windowOptions } from './catalog';
import { addDays, addMonths, daysBetween, isDate, monthOf, nextMonth } from './dates';

describe('dates', () => {
  it('checks real calendar dates', () => {
    expect(isDate('2027-02-29')).toBe(false);
    expect(isDate('2028-02-29')).toBe(true);
    expect(isDate('2027-13-01')).toBe(false);
  });
  it('adds days and months without time zones', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2027-03-15', -14)).toBe('2026-01-15');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across the clock change
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(monthOf('2027-08-01')).toBe('2027-08');
  });
});

describe('the crop catalogue (from the PDF schema)', () => {
  it('has every crop of the schema, each one usable', () => {
    expect(CATALOG.map((c) => c.id)).toEqual(['microgreens', 'funghi', 'orto-eterno', 'pollaio', 'fiori-eduli-indoor', 'fiori-eduli-outdoor', 'zafferano', 'lombricoltura', 'elicicoltura', 'olivo']);
    for (const c of CATALOG) expect(validateCrop(c), c.id).toEqual([]);
  });
  it('keeps missing data as missing, never as zero', () => {
    expect(cropById(CATALOG, 'olivo')!.income).toBeNull();
    expect(cropById(CATALOG, 'fiori-eduli-indoor')!.income).toBeNull();
    expect(CATALOG.every((c) => c.recurringMonthly === null)).toBe(true);
    expect(cropById(CATALOG, 'elicicoltura')!.hoursPerWeek).toBeNull();
  });
  it('says where each number comes from', () => {
    for (const c of CATALOG) {
      expect(c.sources.data).toMatch(/Rendita Agricola/);
      expect(c.sources.tasks).toMatch(/da verificare/);
    }
  });
  it('scales the hen house on the number of hens', () => {
    const p = cropById(CATALOG, 'pollaio')!;
    expect(p.scale).toBe('capi');
    expect(p.refQty).toBe(20);
  });
});

describe('start windows', () => {
  const saffron = cropById(CATALOG, 'zafferano')!;
  const olive = cropById(CATALOG, 'olivo')!;
  it('accepts a date inside the window and refuses one outside', () => {
    expect(inWindow(saffron.windows, '2027-08-01')).toBe(true);
    expect(inWindow(saffron.windows, '2027-09-15')).toBe(true);
    expect(inWindow(saffron.windows, '2027-09-16')).toBe(false);
    expect(inWindow(saffron.windows, '2027-07-31')).toBe(false);
  });
  it('handles windows that cross the new year (October to March)', () => {
    expect(inWindow(olive.windows, '2026-11-20')).toBe(true);
    expect(inWindow(olive.windows, '2027-02-10')).toBe(true);
    expect(inWindow(olive.windows, '2027-06-10')).toBe(false);
  });
  it('accepts any day for crops grown all year', () => {
    expect(inWindow(cropById(CATALOG, 'microgreens')!.windows, '2027-01-01')).toBe(true);
    expect(windowLabel(cropById(CATALOG, 'microgreens')!.windows)).toBe("Tutto l'anno");
  });
  it('turns windows into real date ranges for the date picker', () => {
    const opts = windowOptions(saffron.windows, '2026-11-02', '2029-11-02');
    expect(opts.map((o) => [o.min, o.max])).toEqual([['2027-08-01', '2027-09-15'], ['2028-08-01', '2028-09-15'], ['2029-08-01', '2029-09-15']]);
    expect(opts[0].label).toBe('1 ago – 15 set 2027');
    const worms = windowOptions(cropById(CATALOG, 'lombricoltura')!.windows, '2026-11-02', '2027-12-31');
    expect(worms[0]).toEqual({ min: '2026-11-02', max: '2026-11-30', label: '1 set – 30 nov 2026' });
    const olives = windowOptions(olive.windows, '2026-11-02', '2027-12-31');
    expect(olives[0]).toMatchObject({ min: '2026-11-02', max: '2027-03-31', label: '1 ott – 31 mar 2026/27' });
  });
  it('offers start dates from two years ago (crops already running) to three years ahead', () => {
    expect(startRange('2026-11-02')).toEqual({ from: '2024-11-02', to: '2029-11-02' });
  });
});
