import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { claims, validateNutrition, type Nutrients } from './nutrition';
import { SEED_VARIETIES } from './pricing';

const empty: Nutrients = { kcal: null, protein: null, fat: null, fiber: null, potassium: null, phosphorus: null, copper: null, selenium: null, niacin: null, riboflavin: null, pantothenic: null, folate: null, b6: null };
const of = (id: string) => SEED_VARIETIES.find((v) => v.id === id)!.nutrition!.per100g;

describe('what the catalogue may say (Reg. CE 1924/2006 and Reg. UE 432/2012)', () => {
  it('says only what the oyster mushroom values allow', () => {
    const c = claims(of('pleurotus-ostreatus'));
    expect(c.nutrition).toEqual([
      'Poche calorie', 'Pochi grassi', 'Fonte di fibre', 'Fonte di proteine',
      'Fonte di potassio', 'Fonte di fosforo', 'Fonte di rame',
      'Fonte di vitamina B3 (niacina)', 'Fonte di vitamina B2 (riboflavina)', 'Fonte di vitamina B5 (acido pantotenico)', 'Fonte di folato',
    ]);
    // selenium 2,6 µg is 5% and B6 0,11 mg is 8% of the reference: not enough
    expect(c.nrvPct).not.toHaveProperty('selenium');
    expect(c.nrvPct).not.toHaveProperty('b6');
    expect(c.nrvPct.niacin).toBe(31);
    expect(c.health).toContain('Il folato contribuisce alla normale funzione del sistema immunitario.');
    expect(c.health).toContain('Le proteine contribuiscono al mantenimento della massa muscolare.');
  });
  it('uses the thresholds exactly', () => {
    expect(claims({ ...empty, kcal: 40 }).nutrition).toEqual(['Poche calorie']);
    expect(claims({ ...empty, kcal: 41 }).nutrition).toEqual([]);
    // fibre: 3 g per 100 g, or 1,5 g per 100 kcal
    expect(claims({ ...empty, fiber: 3 }).nutrition).toEqual(['Fonte di fibre']);
    expect(claims({ ...empty, fiber: 1, kcal: 66 }).nutrition).toEqual(['Fonte di fibre']);
    expect(claims({ ...empty, fiber: 1, kcal: 70 }).nutrition).toEqual([]);
    // protein: at least 12% of the energy
    expect(claims({ ...empty, protein: 3, kcal: 100 }).nutrition).toEqual(['Fonte di proteine']);
    expect(claims({ ...empty, protein: 2.9, kcal: 100 }).nutrition).toEqual([]);
    // vitamins and minerals: 15% of the reference value in 100 g
    expect(claims({ ...empty, potassium: 300 }).nutrition).toEqual(['Fonte di potassio']);
    expect(claims({ ...empty, potassium: 299 }).nutrition).toEqual([]);
  });
  it('never turns a missing value into a claim', () => {
    expect(claims(empty)).toEqual({ nutrition: [], health: [], nrvPct: {} });
    expect(claims(of('cardoncello')).nutrition).not.toContain('Pochi grassi');
  });
  it('never makes medical claims', () => {
    for (const v of SEED_VARIETIES.filter((x) => x.nutrition)) {
      for (const h of claims(v.nutrition!.per100g).health) expect(h).not.toMatch(/difese|tumor|colesterolo|cura|previen|guarisc/i);
    }
  });
  it('wants a source and no negative values', () => {
    expect(validateNutrition({ per100g: { ...empty, kcal: -1 }, source: { text: 'x' } })).toEqual(['Valore nutrizionale non valido: kcal.']);
    expect(validateNutrition({ per100g: empty, source: { text: ' ' } })).toEqual(['I valori nutrizionali hanno bisogno di una fonte.']);
  });
  it('has values for the four varieties with data, none invented for the gialletto', () => {
    expect(SEED_VARIETIES.filter((v) => v.nutrition).map((v) => v.id)).toEqual(['pleurotus-ostreatus', 'cardoncello', 'pioppino', 'shiitake']);
  });
});

describe('the nutrition seed in the database', () => {
  it('is the same as the JSON (regenerate with npm run funghi:sql)', async () => {
    // @ts-expect-error plain JS module without types
    const gen = await import('../../../scripts/gen-funghi-sql.mjs');
    expect(readFileSync(gen.NUTRITION_SQL, 'utf8')).toBe(gen.nutritionSql(readFileSync(gen.NUTRITION_JSON, 'utf8')));
  });
});
