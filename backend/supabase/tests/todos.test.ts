// Le cose da fare: solo l'admin le vede e le cambia, e ogni stato si porta dietro la sua data.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, failure } from './db';

let db: TestDb;
let admin: string, viewer: string;
const A = () => ({ id: admin }), V = () => ({ id: viewer });
const lit = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const save = (o: Record<string, unknown>, id: string | null = null, as: 'anon' | { id: string } = A()) =>
  db.value<string>(as, `select todo_save(${id ? `'${id}'` : 'null'}, ${lit(o)})::text`);

beforeAll(() => {
  db = TestDb.create();
  admin = db.createUser('lucia', 'Lucia De Mojà', 'admin');
  db.exec('super', `update profiles set role = 'admin' where id = '${admin}'`);
  viewer = db.createUser('socio', 'Un socio', 'viewer');
});
afterAll(() => db?.drop());

describe('the to-do list', () => {
  it('lets the admin add one, and checks it', () => {
    const id = save({ title: ' Chiamare il CAA ', who: 'Coldiretti', due: '2026-11-17', note: 'per il bando', link: 'https://mail.google.com/x' });
    expect(db.rows('super', `select title, status, who, due::text, waiting_since, done_at from todos where id = '${id}'`))
      .toEqual([{ title: 'Chiamare il CAA', status: 'da_fare', who: 'Coldiretti', due: '2026-11-17', waiting_since: null, done_at: null }]);
    expect(failure(() => save({ title: ' ' }))).toMatch(/ERR_INVALID: scrivi cosa c'è da fare/);
    expect(failure(() => save({ title: 'x', status: 'forse' }))).toMatch(/stato non valido/);
    expect(failure(() => save({ title: 'x', due: '31/12/2026' }))).toMatch(/data non valida/);
    expect(failure(() => save({ title: 'x', link: 'mail.google.com' }))).toMatch(/http/);
  });
  it('dates the wait and the finish line', () => {
    const id = save({ title: 'Email al fornitore', status: 'in_attesa', waiting_since: '2026-11-03' });
    expect(db.value('super', `select waiting_since::text from todos where id = '${id}'`)).toBe('2026-11-03');
    const now = save({ title: 'Email al SIAN', status: 'in_attesa' });
    expect(db.value('super', `select waiting_since = current_date from todos where id = '${now}'`)).toBe(true);
    db.exec(A(), `select todo_set_status('${id}', 'fatto')`);
    expect(db.rows('super', `select status, waiting_since::text, done_at is not null as done from todos where id = '${id}'`))
      .toEqual([{ status: 'fatto', waiting_since: '2026-11-03', done: true }]);
    db.exec(A(), `select todo_set_status('${id}', 'da_fare')`);
    expect(db.value('super', `select done_at from todos where id = '${id}'`)).toBeNull();
    expect(failure(() => db.exec(A(), `select todo_set_status('${id}', 'boh')`))).toMatch(/stato non valido/);
  });
  it('edits and deletes, and says when one is gone', () => {
    const id = save({ title: 'Comodato del terreno' });
    save({ title: 'Comodato registrato del terreno', who: 'papà', status: 'da_fare' }, id);
    expect(db.value('super', `select title from todos where id = '${id}'`)).toBe('Comodato registrato del terreno');
    db.exec(A(), `select todo_delete('${id}')`);
    expect(failure(() => db.exec(A(), `select todo_delete('${id}')`))).toMatch(/ERR_NOT_FOUND/);
    expect(failure(() => save({ title: 'x' }, '00000000-0000-0000-0000-000000000000'))).toMatch(/ERR_NOT_FOUND/);
  });
  it('is the admin\'s only: the read-only login sees none, nobody signed out reads or writes', () => {
    expect(db.value(A(), 'select count(*) from todos')).toBeGreaterThan(0);
    expect(db.value(V(), 'select count(*) from todos')).toBe(0);
    expect(failure(() => save({ title: 'x' }, null, V()))).toMatch(/ERR_FORBIDDEN/);
    expect(failure(() => db.rows('anon', 'select id from todos'))).toMatch(/permission denied/);
    expect(failure(() => save({ title: 'x' }, null, 'anon'))).toMatch(/permission denied/);
    expect(failure(() => db.exec(A(), "insert into todos (title) values ('x')"))).toMatch(/permission denied/);
  });
});
