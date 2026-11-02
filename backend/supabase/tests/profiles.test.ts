// Logins and roles: admin changes everything, viewer reads everything and changes nothing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, failure } from './db';

let db: TestDb;
let admin: string, viewer: string;

beforeAll(() => {
  db = TestDb.create();
  admin = db.createUser('lucia', 'Lucia De Mojà', 'admin');
  viewer = db.createUser('socio', 'Un socio', 'viewer');
});
afterAll(() => db?.drop());

describe('profiles', () => {
  it('are created from Auth users, with the role from the app metadata (viewer by default)', () => {
    expect(db.rows({ id: viewer }, 'select username, full_name, role from profiles order by username')).toEqual([
      { username: 'lucia', full_name: 'Lucia De Mojà', role: 'admin' },
      { username: 'socio', full_name: 'Un socio', role: 'viewer' },
    ]);
  });
  it('can be changed only by the admin, who cannot lock herself out', () => {
    expect(failure(() => db.exec({ id: viewer }, `select admin_update_profile('${viewer}', 'X', 'admin', true)`))).toMatch(/ERR_FORBIDDEN/);
    expect(failure(() => db.exec({ id: admin }, `select admin_update_profile('${admin}', 'Lucia', 'viewer', true)`))).toMatch(/non puoi togliere a te stessa/);
    db.exec({ id: admin }, `select admin_update_profile('${viewer}', 'Socio CAA', 'viewer', true)`);
    expect(db.value({ id: viewer }, `select full_name from profiles where id = '${viewer}'`)).toBe('Socio CAA');
  });
  it('stop working when deactivated', () => {
    db.exec({ id: admin }, `select admin_update_profile('${viewer}', 'Socio CAA', 'viewer', false)`);
    expect(failure(() => db.exec({ id: viewer }, "select task_add('x', current_date, null)"))).toMatch(/questo login non è attivo/);
  });
  it('get a new password only from the SQL editor', () => {
    expect(db.value('super', "select set_password('lucia', 'nuova-password-2026')")).toBe('Password aggiornata per lucia.');
    expect(failure(() => db.exec({ id: admin }, "select set_password('lucia', 'nuova-password-2026')"))).toMatch(/permission denied/);
  });
});

describe('rules (Regolamenti)', () => {
  const change = (title: string) => JSON.stringify([
    { op: 'upsert_section', id: 'fonti', title: 'Fonti e schede' },
    { op: 'upsert_rule', id: 'schema-pdf', section: 'fonti', title, status: 'to_confirm', source: 'Rendita Agricola' },
  ]);
  it('are read by everyone and changed only by the admin, with a history', () => {
    expect(failure(() => db.exec({ id: admin }, `select rules_apply('${change('x')}'::jsonb, 'nope')`))).toMatch(/origine della modifica sconosciuta/);
    db.exec('super', `update profiles set active = true where id = '${viewer}'`);
    expect(failure(() => db.exec({ id: viewer }, `select rules_apply('${change('x')}'::jsonb, 'editor')`))).toMatch(/solo l'admin può cambiare i regolamenti/);
    expect(db.value({ id: admin }, `select rules_apply('${change('Schema operativo coltivazioni')}'::jsonb, 'editor')`)).toEqual({ created: 2, changed: 0, deleted: 0 });
    expect(db.rows({ id: viewer }, 'select title, status from rules_entries')).toEqual([{ title: 'Schema operativo coltivazioni', status: 'to_confirm' }]);
    expect(db.value({ id: viewer }, 'select count(*)::int from rules_log')).toBe(2);
  });
});
