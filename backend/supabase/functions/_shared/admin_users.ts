// Core of the admin-users Edge Function, kept free of Deno and Supabase imports so
// it can be unit-tested. index.ts wires it to Supabase Auth.
import { normalizeUsername, usernameToEmail, validatePassword, validateUsername } from './username.ts';

export type NewUser = {
  email: string;
  password: string;
  user_metadata: { username: string; full_name: string };
  app_metadata: { role: 'admin' | 'viewer' };
};

export type AdminDeps = {
  callerIsAdmin: () => Promise<boolean>;
  createUser: (u: NewUser) => Promise<{ id: string }>;
  /** Supabase adds app metadata after the insert, so the profile trigger cannot see the role: it is written explicitly afterwards. */
  setRole: (userId: string, role: NewUser['app_metadata']['role']) => Promise<void>;
  setPassword: (userId: string, password: string) => Promise<void>;
};

export type Result = { status: number; body: Record<string, unknown> };

const bad = (error: string, status = 400): Result => ({ status, body: { error } });

export async function handleAdminUsers(input: Record<string, unknown>, deps: AdminDeps): Promise<Result> {
  const action = input && input.action;
  if (action !== 'create' && action !== 'reset_password') return bad('Azione sconosciuta.');
  if (!(await deps.callerIsAdmin())) return bad('Solo gli admin possono gestire i login.', 403);

  if (action === 'create') {
    const username = normalizeUsername(String(input.username ?? ''));
    const fullName = String(input.fullName ?? '').trim();
    const password = String(input.password ?? '');
    const role = input.role;
    const uErr = validateUsername(username);
    if (uErr) return bad(uErr);
    if (!fullName) return bad('Il nome completo è obbligatorio.');
    if (fullName.length > 80) return bad('Il nome completo è troppo lungo.');
    const pErr = validatePassword(password);
    if (pErr) return bad(pErr);
    if (role !== 'admin' && role !== 'viewer') return bad('Il ruolo deve essere admin o viewer.');
    try {
      const { id } = await deps.createUser({
        email: usernameToEmail(username), password,
        user_metadata: { username, full_name: fullName }, app_metadata: { role },
      });
      try {
        await deps.setRole(id, role);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return bad(`Il login ${username} è stato creato, ma non è stato possibile impostarne il ruolo: ${msg}. Impostalo da Persone o dall'editor SQL.`, 500);
      }
      return { status: 200, body: { id, username } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/already (been )?registered|already exists|duplicate/i.test(msg)) return bad('Questo nome utente è già in uso.', 409);
      return bad('Impossibile creare il login: ' + msg, 500);
    }
  }

  const userId = String(input.userId ?? '');
  const password = String(input.password ?? '');
  if (!userId) return bad('Manca userId.');
  const pErr = validatePassword(password);
  if (pErr) return bad(pErr);
  try {
    await deps.setPassword(userId, password);
    return { status: 200, body: { ok: true } };
  } catch (e) {
    return bad('Impossibile reimpostare la password: ' + (e instanceof Error ? e.message : String(e)), 500);
  }
}
