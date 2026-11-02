import { describe, it, expect } from 'vitest';
import { handleAdminUsers, type AdminDeps } from '../../../backend/supabase/functions/_shared/admin_users.ts';
import { LOGIN_DOMAIN } from '../../../backend/supabase/functions/_shared/username.ts';

function fakeDeps(over: Partial<AdminDeps> = {}) {
  const calls: unknown[] = [];
  const deps: AdminDeps = {
    callerIsAdmin: async () => true,
    createUser: async (u) => { calls.push(['create', u]); return { id: 'new-id' }; },
    setPassword: async (id, pw) => { calls.push(['password', id, pw]); },
    setRole: async (id, role) => { calls.push(['role', id, role]); },
    ...over,
  };
  return { deps, calls };
}

describe('admin-users function', () => {
  it('creates a login from username, full name, password and role', async () => {
    const { deps, calls } = fakeDeps();
    const res = await handleAdminUsers({ action: 'create', username: ' Regina ', fullName: 'Regina Nemeth', password: 'shifts2026ok', role: 'viewer' }, deps);
    expect(res).toEqual({ status: 200, body: { id: 'new-id', username: 'regina' } });
    expect(calls).toEqual([['create', {
      email: `regina@${LOGIN_DOMAIN}`, password: 'shifts2026ok',
      user_metadata: { username: 'regina', full_name: 'Regina Nemeth' }, app_metadata: { role: 'viewer' },
    }], ['role', 'new-id', 'viewer']]);
  });

  it('creates read-only viewers (Max, Adrien)', async () => {
    const { deps, calls } = fakeDeps();
    const res = await handleAdminUsers({ action: 'create', username: 'max', fullName: 'Max', password: 'shifts2026ok', role: 'viewer' }, deps);
    expect(res.status).toBe(200);
    expect((calls[0] as [string, { app_metadata: unknown }])[1].app_metadata).toEqual({ role: 'viewer' });
    // Supabase adds app metadata after the insert, so the role is written explicitly afterwards.
    expect(calls[1]).toEqual(['role', 'new-id', 'viewer']);
  });

  it('reports a failure to set the role instead of leaving a wrong role silently', async () => {
    const { deps } = fakeDeps({ setRole: async () => { throw new Error('db down'); } });
    const res = await handleAdminUsers({ action: 'create', username: 'max', fullName: 'Max', password: 'shifts2026ok', role: 'viewer' }, deps);
    expect(res).toEqual({ status: 500, body: { error: "Il login max è stato creato, ma non è stato possibile impostarne il ruolo: db down. Impostalo da Persone o dall'editor SQL." } });
  });

  it('only admins may call it', async () => {
    const { deps, calls } = fakeDeps({ callerIsAdmin: async () => false });
    const res = await handleAdminUsers({ action: 'create', username: 'regina', fullName: 'R', password: 'shifts2026ok', role: 'viewer' }, deps);
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('validates input before touching Auth', async () => {
    const { deps, calls } = fakeDeps();
    expect(await handleAdminUsers({ action: 'create', username: 'r', fullName: 'R', password: 'shifts2026ok', role: 'viewer' }, deps))
      .toEqual({ status: 400, body: { error: 'Il nome utente deve avere da 3 a 32 caratteri.' } });
    expect(await handleAdminUsers({ action: 'create', username: 'regina', fullName: 'R', password: 'short', role: 'viewer' }, deps))
      .toEqual({ status: 400, body: { error: 'La password deve avere almeno 10 caratteri.' } });
    expect(await handleAdminUsers({ action: 'create', username: 'regina', fullName: '  ', password: 'shifts2026ok', role: 'viewer' }, deps))
      .toEqual({ status: 400, body: { error: 'Il nome completo è obbligatorio.' } });
    expect(await handleAdminUsers({ action: 'create', username: 'regina', fullName: 'R', password: 'shifts2026ok', role: 'boss' }, deps))
      .toEqual({ status: 400, body: { error: 'Il ruolo deve essere admin o viewer.' } });
    expect(await handleAdminUsers({ action: 'explode' }, deps)).toEqual({ status: 400, body: { error: 'Azione sconosciuta.' } });
    expect(calls).toHaveLength(0);
  });

  it('reports a taken username clearly', async () => {
    const { deps } = fakeDeps({ createUser: async () => { throw new Error('A user with this email address has already been registered'); } });
    expect(await handleAdminUsers({ action: 'create', username: 'regina', fullName: 'R', password: 'shifts2026ok', role: 'viewer' }, deps))
      .toEqual({ status: 409, body: { error: 'Questo nome utente è già in uso.' } });
  });

  it('resets a password', async () => {
    const { deps, calls } = fakeDeps();
    expect(await handleAdminUsers({ action: 'reset_password', userId: 'u1', password: 'newpass2026' }, deps)).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([['password', 'u1', 'newpass2026']]);
  });
});
