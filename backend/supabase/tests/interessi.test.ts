// The public questionnaire in the database: anyone can send a request, nobody without the admin
// login can read one back, and every check holds whatever the browser sends.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, failure } from './db';

let db: TestDb;
let admin: string, viewer: string;
const A = () => ({ id: admin }), V = () => ({ id: viewer });
const lit = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

const base = {
  kind: 'ristorante', name: 'Maria Rossi', business: 'Trattoria da Maria', town: 'Polistena', email: 'maria@example.it',
  phone: '+39 333 123 4567', frequency: 'settimanale', note: 'Consegna il martedì', privacy: true, updates: true,
  items: [{ variety: 'cardoncello', kg: 2 }, { variety: 'hericium', kg: 0.5 }, { other: 'Porcini', kg: 1 }],
};
const submit = (o: Record<string, unknown>, as: 'anon' | { id: string } = 'anon') => db.value<string>(as, `select interest_submit(${lit(o)})::text`);

beforeAll(() => {
  db = TestDb.create();
  admin = db.createUser('lucia', 'Lucia De Mojà', 'admin');
  db.exec('super', `update profiles set role = 'admin' where id = '${admin}'`);
  viewer = db.createUser('socio', 'Un socio', 'viewer');
});
afterAll(() => db?.drop());

describe('the choices', () => {
  it('lists the catalogue first, then the species that still need the ASL', () => {
    const rows = db.rows<{ id: string; sellable: boolean }>('anon', 'select id, sellable from interest_options()');
    expect(rows.filter((r) => r.sellable).map((r) => r.id)).toEqual(['pleurotus-ostreatus', 'cardoncello', 'pioppino', 'shiitake', 'pleurotus-cornucopiae']);
    expect(rows.filter((r) => !r.sellable).map((r) => r.id)).toEqual(['pleurotus-djamor', 'pleurotus-citrinopileatus', 'hericium']);
    expect(rows.findIndex((r) => !r.sellable)).toBe(5);
  });
});

describe('sending a request', () => {
  it('works without signing in and stores both consents with their time', () => {
    const id = submit(base);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const r = db.rows<Record<string, unknown>>('super', `select kind, business, email, status, privacy_at is not null as privacy, updates_at is not null as updates from interests where id = '${id}'`)[0];
    expect(r).toEqual({ kind: 'ristorante', business: 'Trattoria da Maria', email: 'maria@example.it', status: 'nuova', privacy: true, updates: true });
    expect(db.rows('super', `select position, variety_id, label, kg::float as kg from interest_items where interest_id = '${id}' order by position`)).toEqual([
      { position: 1, variety_id: 'cardoncello', label: 'Cardoncello', kg: 2 },
      { position: 2, variety_id: 'hericium', label: 'Criniera di leone', kg: 0.5 },
      { position: 3, variety_id: null, label: 'Porcini', kg: 1 },
    ]);
  });
  it('keeps the updates consent apart: no tick, no updates', () => {
    const id = submit({ ...base, kind: 'privato', business: '', email: 'Luca@Example.it ', updates: false, items: [{ variety: 'pioppino', kg: 0.5 }] });
    expect(db.rows('super', `select email, business, updates_at from interests where id = '${id}'`)).toEqual([{ email: 'luca@example.it', business: null, updates_at: null }]);
  });
  it('checks everything, whatever the browser sends', () => {
    const bad = (o: Record<string, unknown>) => failure(() => submit({ ...base, email: 'x@example.it', ...o }));
    expect(bad({ privacy: false })).toMatch(/ERR_INVALID: per inviare la richiesta devi aver letto l'informativa/);
    expect(bad({ privacy: 'true' })).toMatch(/informativa/);
    expect(bad({ kind: 'grossista' })).toMatch(/locale o sei un privato/);
    expect(bad({ business: ' ' })).toMatch(/nome del locale/);
    expect(bad({ name: '' })).toMatch(/scrivi il tuo nome/);
    expect(bad({ town: '' })).toMatch(/comune/);
    expect(bad({ email: 'maria@' })).toMatch(/controlla l'indirizzo email/);
    expect(bad({ phone: 'chiamami' })).toMatch(/numero di telefono/);
    expect(bad({ frequency: 'ogni giorno' })).toMatch(/ogni quanto/);
    expect(bad({ items: [] })).toMatch(/almeno un fungo/);
    expect(bad({ items: [{ variety: 'cardoncello', kg: 1 }, { variety: 'pioppino', kg: 1 }, { variety: 'shiitake', kg: 1 }, { other: 'Porcini', kg: 1 }] })).toMatch(/al massimo 3/);
    expect(bad({ items: [{ variety: 'tartufo', kg: 1 }] })).toMatch(/non è tra quelli che si possono scegliere/);
    expect(bad({ items: [{ other: '  ', kg: 1 }] })).toMatch(/quale altro fungo/);
    expect(bad({ items: [{ variety: 'cardoncello', kg: 1 }, { other: 'cardoncello', kg: 2 }] })).toMatch(/due volte lo stesso fungo/);
    expect(bad({ items: [{ variety: 'cardoncello', kg: 0 }] })).toMatch(/più di 0/);
    expect(bad({ items: [{ variety: 'cardoncello', kg: '2' }] })).toMatch(/quanti kg/);
    // nothing half-saved
    expect(db.value('super', "select count(*) from interests where email = 'x@example.it'")).toBe(0);
  });
  it('accepts at most three requests a day from the same email', () => {
    const o = { ...base, email: 'tre@example.it' };
    submit(o); submit({ ...o, email: 'TRE@example.it' }); submit(o);
    expect(failure(() => submit(o))).toMatch(/tre richieste/);
  });
  it('lets nobody write the tables directly', () => {
    expect(failure(() => db.exec('anon', "insert into interests (kind, name, town, email, frequency, privacy_at) values ('privato', 'x', 'y', 'z@z.it', 'mensile', now())"))).toMatch(/permission denied/);
    expect(failure(() => db.exec(A(), "update interests set status = 'cliente'"))).toMatch(/permission denied/);
  });
});

describe('who reads the requests', () => {
  it('nobody without a login', () => {
    expect(failure(() => db.rows('anon', 'select id from interests'))).toMatch(/permission denied/);
    expect(failure(() => db.rows('anon', 'select label from interest_items'))).toMatch(/permission denied/);
  });
  it('not the read-only login: they hold personal data', () => {
    expect(db.value(V(), 'select count(*) from interests')).toBe(0);
    expect(db.value(V(), 'select count(*) from interest_items')).toBe(0);
  });
  it('the admin, with every item', () => {
    expect(db.value(A(), 'select count(*) from interests')).toBe(5);
    expect(db.value(A(), "select count(*) from interest_items i join interests r on r.id = i.interest_id where r.email = 'maria@example.it'")).toBe(3);
  });
});

describe('the admin follows up', () => {
  const maria = () => db.value<string>('super', "select id::text from interests where email = 'maria@example.it'");
  it('sets where a request stands and a note; nobody else can', () => {
    db.exec(A(), `select interest_update('${maria()}', 'contattata', ' Sentita al telefono ')`);
    expect(db.rows('super', `select status, admin_note from interests where id = '${maria()}'`)).toEqual([{ status: 'contattata', admin_note: 'Sentita al telefono' }]);
    expect(failure(() => db.exec(A(), `select interest_update('${maria()}', 'pagata', null)`))).toMatch(/stato non valido/);
    expect(failure(() => db.exec(V(), `select interest_update('${maria()}', 'cliente', null)`))).toMatch(/ERR_FORBIDDEN/);
    expect(failure(() => db.exec('anon', `select interest_update('${maria()}', 'cliente', null)`))).toMatch(/permission denied/);
    expect(failure(() => db.exec(A(), "select interest_update('00000000-0000-0000-0000-000000000000', 'cliente', null)"))).toMatch(/ERR_NOT_FOUND/);
  });
  it('stops the updates for every request with the same email', () => {
    const one = db.value<string>('super', "select id::text from interests where email = 'tre@example.it' limit 1");
    db.exec(A(), `select interest_stop_updates('${one}')`);
    expect(db.value('super', "select count(*) from interests where email = 'tre@example.it' and updates_stopped_at is null")).toBe(0);
    expect(db.value('super', "select updates_stopped_at from interests where email = 'maria@example.it'")).toBeNull();
  });
  it('deletes all the data of one person, items included', () => {
    const one = db.value<string>('super', "select id::text from interests where email = 'tre@example.it' limit 1");
    expect(failure(() => db.exec(V(), `select interest_delete('${one}')`))).toMatch(/ERR_FORBIDDEN/);
    expect(db.value(A(), `select interest_delete('${one}')`)).toBe(3);
    expect(db.value('super', "select count(*) from interests where email = 'tre@example.it'")).toBe(0);
    expect(db.value('super', 'select count(*) from interest_items i left join interests r on r.id = i.interest_id where r.id is null')).toBe(0);
  });
});
