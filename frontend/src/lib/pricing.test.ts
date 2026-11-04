import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SEED_LIST, SEED_PARAMS, SEED_VARIETIES, daysToFirstHarvest, listUpToDate, monthEnergy, paramsByKey, priceVariety, season,
  toPublic, validateParam, validateVariety, verdict, type Variety,
} from './pricing';

const P = paramsByKey(SEED_PARAMS);
const V = (id: string): Variety => structuredClone(SEED_VARIETIES.find((v) => v.id === id)!);

describe('the seed data', () => {
  it('passes the same checks the database makes', () => {
    for (const v of SEED_VARIETIES) expect(validateVariety(v), v.id).toEqual([]);
    for (const p of SEED_PARAMS) expect(validateParam(p.key, p.value, p.source), p.key).toEqual([]);
  });
  it('puts only species on the official list in the public catalogue', () => {
    expect(SEED_VARIETIES.filter((v) => v.public).map((v) => v.id)).toEqual(['pleurotus-ostreatus', 'cardoncello', 'pioppino', 'shiitake', 'pleurotus-cornucopiae']);
    expect(SEED_VARIETIES.filter((v) => !v.public).every((v) => v.legal === 'non_in_elenco')).toBe(true);
  });
  it('can price every public variety, and names a source for each number used', () => {
    for (const v of SEED_VARIETIES.filter((x) => x.public)) {
      expect(priceVariety(v, P).ok, v.id).toBe(true);
      for (const k of ['legal', 'supply', 'yieldPct', 'firstHarvestDays', 'fruiting', 'marketWholesale']) expect(v.sources[k]?.text, `${v.id}.${k}`).toBeTruthy();
    }
  });
  it('starts the list with the bulk-substrate prices of the oyster mushroom only', () => {
    const r = priceVariety(V('pleurotus-ostreatus'), P);
    if (!r.ok) throw new Error('expected a price');
    expect(V('pleurotus-ostreatus').supply.mode).toBe('ingrosso');
    expect(SEED_LIST).toEqual({ 'pleurotus-ostreatus': { wholesale: r.cost.minWholesale, retail: r.cost.minRetail } });
    expect(SEED_VARIETIES[0]).not.toHaveProperty('list');
  });
  it('gives every parameter a source', () => {
    expect(SEED_PARAMS.every((p) => p.source.trim().length > 0)).toBe(true);
    expect(P.energy_eur_kwh.value).toBe(0.4343);
  });
});

describe('time from order to first harvest', () => {
  it('adds shipping, the incubation left and the wait for the first mushrooms', () => {
    expect(daysToFirstHarvest(V('pleurotus-ostreatus'))).toEqual({ min: 13, max: 21 });
    expect(daysToFirstHarvest(V('shiitake'))).toEqual({ min: 32, max: 95 });
  });
  it('is unknown when a piece is missing', () => {
    expect(daysToFirstHarvest(V('hericium'))).toBeNull();
  });
});

describe('energy of the fruiting room', () => {
  it('counts humidifier, light and fan every month', () => {
    // (30 W × 12 h + 10 W × 12 h + 15 W × 8 h) × 30 days = 18 kWh
    const e = monthEnergy(V('pleurotus-ostreatus'), P, 0);
    expect(e.need).toBe('ok');
    expect(e.kwh).toBeCloseTo(18, 6);
    expect(e.eur).toBeCloseTo(18 * 0.4343, 6);
  });
  it('adds the heater when the room is colder than the variety needs', () => {
    // shiitake from 13 °C, January 12,2 °C: 0,8 °C × 1,5 h = 1,2 h a day at 400 W = 14,4 kWh more
    const e = monthEnergy(V('shiitake'), P, 0);
    expect(e.need).toBe('heat');
    expect(e.kwh).toBeCloseTo(18 + 14.4, 6);
  });
  it('leaves out the months that would need cooling', () => {
    expect(monthEnergy(V('pleurotus-ostreatus'), P, 6).need).toBe('cool');
    expect(season(V('pleurotus-ostreatus'), P).map((e) => e.month)).toEqual([0, 1, 2, 3, 10, 11]);
    expect(season(V('pioppino'), P).map((e) => e.month)).toEqual([0, 1, 2, 3, 4, 5, 8, 9, 10, 11]);
  });
});

describe('cost per kg and minimum prices', () => {
  it('follows the formula: (bale + shipping + energy) / kg sold + packaging', () => {
    const v = V('cardoncello');
    const r = priceVariety(v, P);
    if (!r.ok) throw new Error('expected a price');
    // 3 kg bale at 10,95 €, 12 € shipping for 4 bales
    const energyMonth = 18 * 0.4343; // no heating: November–April stay in 12–17 °C
    const cycleMonths = (0 + 17.5 + 15) / 30;
    const energy = (energyMonth + 1) * cycleMonths * (3 / 112);
    const kg = 3 * 0.20 * 0.9;
    const cost = (10.95 + 3 + energy) / kg + 0.3;
    expect(r.cost.costPerKg.expected).toBeCloseTo(cost, 6);
    expect(r.cost.minWholesale).toBeCloseTo(Math.ceil(cost * 1.4 * 10) / 10, 6);
    expect(r.cost.minRetail).toBeCloseTo(Math.ceil(cost * 2 * 10) / 10, 6);
    expect(r.cost.costPerKg.worst).toBeGreaterThan(r.cost.costPerKg.expected);
    expect(r.cost.costPerKg.best).toBeLessThan(r.cost.costPerKg.expected);
  });
  it('shows that retail bales are not worth it, and bulk substrate changes the picture', () => {
    const v = V('pleurotus-ostreatus');
    v.supply.mode = 'balla';
    const retail = priceVariety(v, P);
    expect(retail.ok && retail.verdict).toBe('non_conveniente');
    v.supply.mode = 'ingrosso';
    const bulk = priceVariety(v, P);
    if (!bulk.ok || !retail.ok) throw new Error('expected prices');
    expect(bulk.cost.costPerKg.expected).toBeLessThan(retail.cost.costPerKg.expected / 3);
    expect(bulk.cost.shippingEur).toBe(0);
  });
  it('responds to the margins set by the admin', () => {
    const p = paramsByKey(SEED_PARAMS.map((x) => (x.key === 'margin_wholesale_pct' ? { ...x, value: 0 } : x)));
    const r = priceVariety(V('pioppino'), p);
    if (!r.ok) throw new Error('expected a price');
    expect(r.cost.minWholesale).toBeCloseTo(Math.ceil(r.cost.costPerKg.expected * 10 - 1e-9) / 10, 6);
  });
  it('lists what is missing instead of pricing with zeros', () => {
    const r = priceVariety(V('hericium'), P);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missing.map((m) => m.field)).toEqual(['supply.baleKg', 'supply.shippingPerOrder', 'yieldPct', 'firstHarvestDays', 'fruitingDays', 'fruiting.t']);
  });
  it('needs at least one month without cooling', () => {
    const v = V('cardoncello');
    v.fruiting.t = { min: 30, max: 31 };
    const hot = paramsByKey(SEED_PARAMS.map((x) => (x.key.startsWith('temp_') ? { ...x, value: 35 } : x)));
    expect(priceVariety(v, hot).ok).toBe(false);
  });
});

describe('the verdict against the market', () => {
  it('compares the minimum wholesale price with the market range', () => {
    expect(verdict(4, { min: 5, max: 6 })).toBe('conveniente');
    expect(verdict(5.5, { min: 5, max: 6 })).toBe('al_limite');
    expect(verdict(6.1, { min: 5, max: 6 })).toBe('non_conveniente');
    expect(verdict(6.1, null)).toBe('senza_mercato');
  });
  it('tells when the published list no longer matches the calculation', () => {
    const r = priceVariety(V('pioppino'), P);
    if (!r.ok) throw new Error('expected a price');
    expect(listUpToDate({ wholesale: r.cost.minWholesale, retail: r.cost.minRetail, updatedAt: 1 }, r)).toBe(true);
    expect(listUpToDate({ wholesale: null, retail: null, updatedAt: null }, r)).toBe(false);
  });
});

describe('checks', () => {
  it('refuses a species off the official list in the public catalogue', () => {
    const v = V('hericium');
    v.public = true;
    expect(validateVariety(v)).toContain("Una specie che non è nell'elenco di quelle vendibili non può stare nel catalogo pubblico.");
  });
  it('refuses ranges upside down and yields over 100%', () => {
    const v = V('pioppino');
    v.yieldPct = { min: 30, max: 120 };
    v.fruiting.t = { min: 25, max: 12 };
    expect(validateVariety(v)).toEqual(['Temperatura di fruttificazione: il minimo è più alto del massimo.', 'Resa: non può superare il 100% del peso della balla.']);
  });
  it('wants a source for every parameter', () => {
    expect(validateParam('loss_pct', 10, ' ')).toEqual(['Indica la fonte (anche "ipotesi" o "misura mia").']);
    expect(validateParam('nope', 1, 'x')).toEqual(['Parametro sconosciuto.']);
    expect(validateParam('temp_01', -2, 'misura mia')).toEqual([]);
    expect(validateParam('loss_pct', -2, 'x')).toEqual(['Il valore non può essere negativo.']);
  });
  it('keeps costs, suppliers and sources out of the public view', () => {
    const pub = toPublic({ variety: V('cardoncello'), position: 1, list: { wholesale: 9, retail: 14, updatedAt: 1 } });
    expect(Object.keys(pub).sort()).toEqual(['commonName', 'firstHarvestDays', 'id', 'incubationDays', 'kitchen', 'list', 'nutrition', 'otherNames', 'photo', 'scientificName', 'shipDays']);
  });
});

describe('the seed in the database', () => {
  it('is the same as the JSON (regenerate with npm run funghi:sql)', async () => {
    // @ts-expect-error plain JS module without types
    const gen = await import('../../../scripts/gen-funghi-sql.mjs');
    expect(readFileSync(gen.FUNGHI_SQL, 'utf8')).toBe(gen.funghiSql(readFileSync(gen.FUNGHI_JSON, 'utf8')));
  });
});
