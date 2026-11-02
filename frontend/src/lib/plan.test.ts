import { describe, it, expect } from 'vitest';
import { CATALOG, cropById } from './catalog';
import { checkPlanting, generateExpenses, generateTasks, usedSpace, type Planting, type PlantingInput } from './plan';

const TODAY = '2026-11-02';
const settings = { outdoorM2: 1000, indoorM2: 10, grantDeadline: null };
const planting = (p: Partial<Planting> & Pick<Planting, 'cropId' | 'm2'>): Planting => ({ id: p.cropId, heads: null, start: TODAY, soldPct: 100, note: '', createdAt: 0, ...p });
const input = (p: Partial<PlantingInput> & Pick<PlantingInput, 'cropId'>): PlantingInput => ({ m2: 2, heads: null, start: TODAY, soldPct: 100, note: '', ...p });
const farm = (plantings: Planting[] = []) => ({ catalog: CATALOG, settings, plantings });

describe('adding a crop to the plan', () => {
  it('accepts a crop inside its window and its space', () => {
    expect(checkPlanting(input({ cropId: 'microgreens' }), farm(), TODAY)).toEqual({ errors: [], warnings: [] });
  });
  it('refuses a start date outside the crop window', () => {
    const r = checkPlanting(input({ cropId: 'zafferano', m2: 100, start: '2027-03-01' }), farm(), TODAY);
    expect(r.errors).toEqual(['Zafferano non si può avviare in questa data: è fuori dalla finestra di avvio.']);
  });
  it('refuses more m² than are left in that space, counting the crops already in the plan', () => {
    const r = checkPlanting(input({ cropId: 'orto-eterno', m2: 800 }), farm([planting({ cropId: 'zafferano', m2: 250, start: '2027-08-01' })]), TODAY);
    expect(r.errors).toEqual(['Spazio esterno insufficiente: ne restano 750 m² su 1.000.']);
    expect(usedSpace([planting({ cropId: 'zafferano', m2: 250 }), planting({ cropId: 'microgreens', m2: 3 })], CATALOG, 'outdoor')).toBe(250);
  });
  it('counts indoor and outdoor space separately', () => {
    const full = farm([planting({ cropId: 'orto-eterno', m2: 1000 })]);
    expect(checkPlanting(input({ cropId: 'microgreens', m2: 2 }), full, TODAY).errors).toEqual([]);
  });
  it('asks for the indoor space before adding an indoor crop', () => {
    const r = checkPlanting(input({ cropId: 'funghi' }), { ...farm(), settings: { ...settings, indoorM2: null } }, TODAY);
    expect(r.errors).toEqual(['Indica prima quanto spazio interno hai a disposizione.']);
  });
  it('needs the number of hens for the hen house, and warns when they are too many for the space', () => {
    expect(checkPlanting(input({ cropId: 'pollaio', m2: 50 }), farm(), TODAY).errors).toEqual(['Indica il numero di capi (almeno 1).']);
    const r = checkPlanting(input({ cropId: 'pollaio', m2: 50, heads: 20 }), farm(), TODAY);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(['Con 20 capi lo schema consiglia almeno 60 m².']);
    expect(checkPlanting(input({ cropId: 'pollaio', m2: 50, heads: 6 }), farm(), TODAY).warnings).toEqual([]);
  });
  it('warns, without refusing, below the minimum area and when income is missing', () => {
    expect(checkPlanting(input({ cropId: 'olivo', m2: 500 }), farm(), TODAY).warnings).toEqual([
      'Lo schema consiglia almeno 10.000 m² per Olivo da specialista.',
      'Il ricavo di questa coltura è un dato mancante: nei prospetti conterà zero finché non lo verifichi.',
    ]);
  });
  it('refuses a missing crop, zero m² and a share sold over 100%', () => {
    expect(checkPlanting(input({ cropId: 'tartufi' }), farm(), TODAY).errors).toEqual(['Scegli una coltura dal catalogo.']);
    expect(checkPlanting(input({ cropId: 'microgreens', m2: 0, soldPct: 120 }), farm(), TODAY).errors).toEqual(['Indica i m² da assegnare (più di 0).', 'La quota venduta va da 0 a 100%.']);
  });
});

describe('the tasks of a crop cycle', () => {
  it('repeats each task until the end of the three-year horizon', () => {
    const tasks = generateTasks(cropById(CATALOG, 'microgreens')!, '2026-11-02', '2026-11-02');
    expect(tasks.slice(0, 3)).toEqual([
      { title: 'Semina vassoi microgreens', due: '2026-11-02', source: 'cycle' },
      { title: 'Raccolta e consegna vaschette microgreens', due: '2026-11-13', source: 'cycle' },
      { title: 'Semina vassoi microgreens', due: '2026-11-13', source: 'cycle' },
    ].sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.title.localeCompare(b.title))));
    expect(tasks.at(-1)!.due <= '2029-11-02').toBe(true);
    expect(tasks.length).toBeGreaterThan(190);
  });
  it('runs one-off tasks once and yearly tasks every year', () => {
    const tasks = generateTasks(cropById(CATALOG, 'zafferano')!, '2027-08-01', '2026-11-02');
    expect(tasks.filter((t) => t.title.startsWith('Preparare'))).toHaveLength(1);
    expect(tasks.filter((t) => t.title.startsWith('Raccolta fiori')).map((t) => t.due)).toEqual(['2027-10-20', '2028-10-19', '2029-10-19']);
  });
  it('skips the days already gone for a crop started in the past', () => {
    const tasks = generateTasks(cropById(CATALOG, 'pollaio')!, '2026-03-01', '2026-11-02');
    expect(tasks[0].due >= '2026-11-02').toBe(true);
  });
});

describe('the initial investment', () => {
  it('scales the schema budget to the size of the crop', () => {
    expect(generateExpenses(cropById(CATALOG, 'zafferano')!, { m2: 50, heads: null, start: '2027-08-01' })).toEqual([{
      title: 'Investimento iniziale — Zafferano', date: '2027-08-01', kind: 'investment', source: 'catalog', amountMin: 1500, amountMax: 2000,
    }]);
    expect(generateExpenses(cropById(CATALOG, 'pollaio')!, { m2: 50, heads: 6, start: TODAY })[0]).toMatchObject({ amountMin: 300, amountMax: 450 });
  });
});
