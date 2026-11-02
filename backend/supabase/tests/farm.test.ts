// The action plan in the database: who may change it, and the rules plan_add enforces
// (start window, space, quantities) whatever the app sends.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, failure } from './db';

let db: TestDb;
let admin: string, viewer: string;
const A = () => ({ id: admin }), V = () => ({ id: viewer });
const today = () => db.value<string>('super', "select current_date::text");
const add = (crop: string, m2: number, start: string, extra = "null, 100, ''") =>
  db.value<string>(A(), `select plan_add('${crop}', ${m2}, ${extra.split(',')[0]}, '${start}'::date, ${extra.split(',')[1]}, ${extra.split(',').slice(2).join(',')})`);
/** a date inside the saffron window (1 Aug – 15 Sep) within the next year */
const saffronDay = () => db.value<string>('super', `select (make_date(extract(year from current_date)::int + case when current_date > make_date(extract(year from current_date)::int, 9, 15) then 1 else 0 end, 8, 20))::text`);

beforeAll(() => {
  db = TestDb.create();
  admin = db.createUser('lucia', 'Lucia De Mojà', 'admin');
  db.exec('super', `update profiles set role = 'admin' where id = '${admin}'`);
  viewer = db.createUser('socio', 'Un socio', 'viewer');
});
afterAll(() => db?.drop());

describe('the catalogue', () => {
  it('is loaded from catalog_v1.json, readable by everyone signed in', () => {
    expect(db.rows(V(), 'select id from crop_catalog order by position').map((r) => (r as { id: string }).id)).toEqual(
      ['microgreens', 'funghi', 'orto-eterno', 'pollaio', 'fiori-eduli-indoor', 'fiori-eduli-outdoor', 'zafferano', 'lombricoltura', 'elicicoltura', 'olivo']);
    expect(db.value(V(), "select data -> 'income' from crop_catalog where id = 'olivo'")).toBeNull();
  });
  it('cannot be read without signing in', () => {
    expect(failure(() => db.rows('anon', 'select id from crop_catalog'))).toMatch(/permission denied/);
  });
});

describe('settings', () => {
  it('start with 1.000 m² outside and the inside space not set', () => {
    expect(db.rows(V(), 'select outdoor_m2::float, indoor_m2 from farm_settings')).toEqual([{ outdoor_m2: 1000, indoor_m2: null }]);
  });
  it('can be changed only by the admin', () => {
    expect(failure(() => db.exec(V(), "select farm_set_settings(1000, 5, null)"))).toMatch(/ERR_FORBIDDEN: hai accesso in sola lettura/);
    db.exec(A(), "select farm_set_settings(1000, 6, '2029-08-04')");
    expect(db.value(V(), 'select indoor_m2::float from farm_settings')).toBe(6);
  });
});

describe('adding a crop to the plan', () => {
  it('saves the crop with its tasks and its initial investment', () => {
    const id = db.value<string>(A(), `select plan_add('microgreens', 2, null, current_date, 80, 'prova',
      '[{"title":"Semina vassoi microgreens","due":"${today()}"},{"title":"Raccolta","due":"${today()}"}]',
      '[{"title":"Investimento iniziale — Microgreens","date":"${today()}","amountMin":266.67,"amountMax":666.67,"kind":"investment"}]')`);
    expect(db.rows(V(), `select crop_id, m2::float, sold_pct::float, note from plantings where id = '${id}'`)).toEqual([{ crop_id: 'microgreens', m2: 2, sold_pct: 80, note: 'prova' }]);
    expect(db.value(V(), `select count(*)::int from farm_tasks where planting_id = '${id}' and source = 'cycle' and not done`)).toBe(2);
    expect(db.rows(V(), `select amount_min::float, amount_max::float, source from expenses where planting_id = '${id}'`)).toEqual([{ amount_min: 266.67, amount_max: 666.67, source: 'catalog' }]);
  });
  it('refuses a start date outside the crop window', () => {
    expect(failure(() => db.exec(A(), "select plan_add('zafferano', 100, null, make_date(extract(year from current_date)::int + 1, 3, 1), 100, '')")))
      .toMatch(/Zafferano non si può avviare in questa data: è fuori dalla finestra di avvio/);
    expect(add('zafferano', 100, saffronDay())).toBeTruthy();
  });
  it('accepts windows that cross the new year', () => {
    expect(failure(() => db.exec(A(), "select plan_add('olivo', 50, null, make_date(extract(year from current_date)::int + 1, 6, 10), 100, '')"))).toMatch(/fuori dalla finestra/);
    expect(db.value(A(), "select plan_add('olivo', 50, null, make_date(extract(year from current_date)::int + 1, 1, 10), 100, '')")).toBeTruthy();
  });
  it('refuses more space than is left, inside and outside separately', () => {
    // outside: saffron 100 + olive 50 used out of 1000
    expect(failure(() => db.exec(A(), "select plan_add('orto-eterno', 900, null, current_date, 100, '')"))).toMatch(/spazio esterno insufficiente: ne restano 850 m² su 1\.000/);
    // inside: microgreens 2 used out of 6
    expect(failure(() => db.exec(A(), "select plan_add('funghi', 5, null, current_date, 100, '')"))).toMatch(/spazio interno insufficiente: ne restano 4 m² su 6/);
    expect(db.value(A(), "select plan_add('funghi', 4, null, current_date, 100, '')")).toBeTruthy();
  });
  it('will not shrink the space below what the plan already uses', () => {
    expect(failure(() => db.exec(A(), "select farm_set_settings(100, 6, null)"))).toMatch(/usano già 150 m² esterni/);
    expect(failure(() => db.exec(A(), "select farm_set_settings(1000, 3, null)"))).toMatch(/usano già 6 m² interni/);
  });
  it('needs the number of hens for the hen house', () => {
    expect(failure(() => db.exec(A(), "select plan_add('pollaio', 50, null, current_date, 100, '')"))).toMatch(/indica il numero di capi/);
    expect(db.value(A(), "select plan_add('pollaio', 50, 6, current_date, 100, '')")).toBeTruthy();
  });
  it('refuses an unknown crop, zero m² and a share sold over 100%', () => {
    expect(failure(() => db.exec(A(), "select plan_add('tartufi', 5, null, current_date, 100, '')"))).toMatch(/scegli una coltura dal catalogo/);
    expect(failure(() => db.exec(A(), "select plan_add('microgreens', 0, null, current_date, 100, '')"))).toMatch(/più di 0/);
    expect(failure(() => db.exec(A(), "select plan_add('microgreens', 1, null, current_date, 120, '')"))).toMatch(/da 0 a 100%/);
  });
  it('is admin only', () => {
    expect(failure(() => db.exec(V(), "select plan_add('microgreens', 1, null, current_date, 100, '')"))).toMatch(/ERR_FORBIDDEN/);
    expect(failure(() => db.exec(A(), "insert into plantings (crop_id, m2, start_date) values ('microgreens', 1, current_date)"))).toMatch(/permission denied/);
  });
});

describe('tasks and expenses', () => {
  it('ticks a task done and back', () => {
    const t = db.value<string>(A(), "select task_add('Comprare semi di ravanello', current_date, null)");
    db.exec(A(), `select task_set_done('${t}', true)`);
    expect(db.rows(V(), `select done, done_at is not null as stamped from farm_tasks where id = '${t}'`)).toEqual([{ done: true, stamped: true }]);
    db.exec(A(), `select task_set_done('${t}', false)`);
    expect(db.rows(V(), `select done, done_at from farm_tasks where id = '${t}'`)).toEqual([{ done: false, done_at: null }]);
    expect(failure(() => db.exec(V(), `select task_set_done('${t}', true)`))).toMatch(/ERR_FORBIDDEN/);
  });
  it('records what an expense really cost', () => {
    const e = db.value<string>(A(), "select expense_add('Rete per il pollaio', current_date, 80, 120, 'other', null)");
    expect(failure(() => db.exec(A(), `select expense_set_paid('${e}', true, null)`))).toMatch(/indica quanto hai pagato/);
    db.exec(A(), `select expense_set_paid('${e}', true, 95.5)`);
    expect(db.rows(V(), `select paid, actual_amount::float from expenses where id = '${e}'`)).toEqual([{ paid: true, actual_amount: 95.5 }]);
    expect(failure(() => db.exec(A(), "select expense_add('X', current_date, 100, 50, 'other', null)"))).toMatch(/massimo non può essere minore/);
  });
  it('removes a crop together with its tasks and expenses', () => {
    const id = db.value<string>(A(), `select plan_add('orto-eterno', 10, null, current_date, 100, '', '[{"title":"Semina","due":"${today()}"}]', '[{"title":"Inv","date":"${today()}","amountMin":1,"amountMax":2}]')`);
    db.exec(A(), `select plan_delete('${id}')`);
    expect(db.value(V(), `select count(*)::int from farm_tasks where planting_id = '${id}'`)).toBe(0);
    expect(db.value(V(), `select count(*)::int from expenses where planting_id = '${id}'`)).toBe(0);
    expect(failure(() => db.exec(A(), `select plan_delete('${id}')`))).toMatch(/non è più nel piano/);
  });
});
