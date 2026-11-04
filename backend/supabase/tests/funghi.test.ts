// The mushroom catalogue in the database: what anyone can see without signing in, what only the
// staff can read, and the checks the admin's changes go through whatever the app sends.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, failure } from './db';

let db: TestDb;
let admin: string, viewer: string;
const A = () => ({ id: admin }), V = () => ({ id: viewer });
const lit = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const dataOf = (id: string) => db.value<Record<string, unknown>>('super', `select data from varieties where id = '${id}'`);

beforeAll(() => {
  db = TestDb.create();
  admin = db.createUser('lucia', 'Lucia De Mojà', 'admin');
  db.exec('super', `update profiles set role = 'admin' where id = '${admin}'`);
  viewer = db.createUser('socio', 'Un socio', 'viewer');
});
afterAll(() => db?.drop());

describe('the public catalogue', () => {
  it('shows only the varieties on the official list, to anyone, without costs or sources', () => {
    const rows = db.rows<{ id: string; data: Record<string, unknown>; list_wholesale: number | null }>('anon', 'select * from catalog_public()');
    expect(rows.map((r) => r.id)).toEqual(['pleurotus-ostreatus', 'cardoncello', 'pioppino', 'shiitake', 'pleurotus-cornucopiae']);
    expect(Object.keys(rows[0].data).sort()).toEqual(['commonName', 'firstHarvestDays', 'incubationDays', 'kitchen', 'nutrition', 'otherNames', 'photo', 'scientificName', 'shipDays']);
    expect((rows[0].data.nutrition as { per100g: { kcal: number } }).per100g.kcal).toBe(33);
    expect(rows.find((r) => r.id === 'pleurotus-cornucopiae')!.data.nutrition).toBeNull();
    expect(Number(rows[0].list_wholesale)).toBe(3.9);
    expect(rows[1].list_wholesale).toBeNull();
  });
  it('does not let anyone without a login read the tables', () => {
    expect(failure(() => db.rows('anon', 'select id from varieties'))).toMatch(/permission denied/);
    expect(failure(() => db.rows('anon', 'select key from price_params'))).toMatch(/permission denied/);
  });
});

describe('the staff view', () => {
  it('lets the admin and the read-only login read everything', () => {
    expect(db.value(V(), 'select count(*) from varieties')).toBe(8);
    expect(db.value(V(), "select value::float from price_params where key = 'energy_eur_kwh'")).toBe(0.4343);
    expect(db.value(A(), "select source_date::text from price_params where key = 'energy_eur_kwh'")).toBe('2026-09-29');
  });
  it('shows nothing to a signed-in user without a staff profile', () => {
    db.exec('super', `update profiles set active = false where id = '${viewer}'`);
    expect(db.value(V(), 'select count(*) from varieties')).toBe(0);
    db.exec('super', `update profiles set active = true where id = '${viewer}'`);
  });
});

describe('changes', () => {
  it('only the admin can make them', () => {
    expect(failure(() => db.exec(V(), "select variety_publish('pioppino', 20, 30)"))).toMatch(/ERR_FORBIDDEN/);
    expect(failure(() => db.exec(V(), "select param_set('loss_pct', 5, 'misura mia', null, null)"))).toMatch(/ERR_FORBIDDEN/);
    expect(failure(() => db.exec('anon', "select variety_publish('pioppino', 20, 30)"))).toMatch(/permission denied/);
  });
  it('publishes the provisional list, which the public then sees', () => {
    db.exec(A(), "select variety_publish('pioppino', 21.2, 30.3)");
    const r = db.rows<{ list_wholesale: number; list_retail: number }>('anon', "select list_wholesale::float as list_wholesale, list_retail::float as list_retail from catalog_public() where id = 'pioppino'");
    expect(r).toEqual([{ list_wholesale: 21.2, list_retail: 30.3 }]);
    expect(failure(() => db.exec(A(), "select variety_publish('pioppino', 0, 30)"))).toMatch(/ERR_INVALID: i prezzi del listino devono essere più di 0/);
    expect(failure(() => db.exec(A(), "select variety_publish('nessuno', 1, 2)"))).toMatch(/ERR_NOT_FOUND/);
    db.exec(A(), "select variety_publish('pioppino', null, null)");
    expect(db.value('super', "select list_updated_at from varieties where id = 'pioppino'")).toBeNull();
  });
  it('changes a parameter only with a source', () => {
    expect(failure(() => db.exec(A(), "select param_set('loss_pct', 5, '  ', null, null)"))).toMatch(/ERR_INVALID: indica la fonte/);
    expect(failure(() => db.exec(A(), "select param_set('loss_pct', -1, 'x', null, null)"))).toMatch(/non può essere negativo/);
    expect(failure(() => db.exec(A(), "select param_set('nope', 1, 'x', null, null)"))).toMatch(/parametro sconosciuto/);
    expect(failure(() => db.exec(A(), "select param_set('loss_pct', 1, 'x', 'ftp://x', null)"))).toMatch(/http/);
    db.exec(A(), "select param_set('temp_01', 9.5, 'misura in cantina', null, '2026-12-01')");
    expect(db.rows(A(), "select value::float as v, source, source_date::text as d from price_params where key = 'temp_01'")).toEqual([{ v: 9.5, source: 'misura in cantina', d: '2026-12-01' }]);
  });
  it('saves a variety after checking it, and refuses unsellable species in the public catalogue', () => {
    const d = dataOf('hericium');
    expect(failure(() => db.exec(A(), `select variety_save('hericium', 8, true, ${lit(d)})`))).toMatch(/non può stare nel catalogo pubblico/);
    expect(failure(() => db.exec(A(), `select variety_save('hericium', 8, false, ${lit({ ...d, yieldPct: { min: 30, max: 120 } })})`))).toMatch(/la resa non può superare il 100%/);
    expect(failure(() => db.exec(A(), `select variety_save('hericium', 8, false, ${lit({ ...d, firstHarvestDays: { min: 30, max: 10 } })})`))).toMatch(/intervallo non valido/);
    expect(failure(() => db.exec(A(), `select variety_save('Hericium!', 8, false, ${lit(d)})`))).toMatch(/codice non valido/);
    db.exec(A(), `select variety_save('hericium', 8, false, ${lit({ ...d, yieldPct: { min: 15, max: 25 } })})`);
    expect(dataOf('hericium').yieldPct).toEqual({ min: 15, max: 25 });
    expect(db.value('super', "select updated_by::text from varieties where id = 'hericium'")).toBe(admin);
  });
  it('hides a variety from the public when the admin takes it out', () => {
    db.exec(A(), `select variety_save('pleurotus-cornucopiae', 5, false, ${lit(dataOf('pleurotus-cornucopiae'))})`);
    expect(db.rows<{ id: string }>('anon', 'select id from catalog_public()').map((r) => r.id)).not.toContain('pleurotus-cornucopiae');
  });
});
