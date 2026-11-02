// The data layer the UI talks to. Two implementations:
//   supabaseRepo -> the real backend (Postgres functions + RLS, Auth, Realtime)
//   memoryRepo   -> same rules in memory, for demo mode and end-to-end tests
import type { DateStr } from '../lib/dates';
import type { ExpenseKind, Farm, PlantingInput, Settings } from '../lib/plan';
import type { ApplyResult, RuleChange, Rules } from '../lib/rules';

export type Role = 'admin' | 'viewer';
export type Profile = { id: string; username: string; fullName: string; role: Role; active: boolean };
export type People = { me: Profile | null; profiles: Record<string, Profile> };
export type NewLogin = { username: string; fullName: string; password: string; role: Role };
export type NewManualExpense = { title: string; date: DateStr; amountMin: number; amountMax: number; kind: ExpenseKind; plantingId: string | null };

export interface Repo {
  readonly mode: 'live' | 'demo';
  /** Signed-in user id, or null. */
  session(): Promise<string | null>;
  signIn(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: () => void): () => void;
  /** Calls back whenever someone changes the data. */
  subscribe(onChange: () => void): () => void;

  loadPeople(): Promise<People>;
  /** Catalogue, settings and the whole plan with its tasks and expenses. */
  loadFarm(): Promise<Farm>;

  /** admin: available space and grant deadline */
  setSettings(s: Settings): Promise<void>;
  /** admin: adds a crop to the plan with the tasks of its cycle and its initial investment; returns its id */
  addPlanting(p: PlantingInput): Promise<string>;
  deletePlanting(id: string): Promise<void>;
  setTaskDone(id: string, done: boolean): Promise<void>;
  addTask(title: string, due: DateStr, plantingId: string | null): Promise<string>;
  deleteTask(id: string): Promise<void>;
  addExpense(e: NewManualExpense): Promise<string>;
  /** paid with the real amount, or back to planned (actual null) */
  setExpensePaid(id: string, paid: boolean, actual: number | null): Promise<void>;
  deleteExpense(id: string): Promise<void>;

  createLogin(l: NewLogin): Promise<{ id: string; username: string }>;
  resetPassword(userId: string, password: string): Promise<void>;
  updateProfile(id: string, fullName: string, role: Role, active: boolean): Promise<void>;

  /** Regolamenti: everyone signed in reads them, viewers included */
  loadRules(): Promise<Rules>;
  /** admin: applies the changes all or nothing (the editor and "Aggiorna con Claude" both use it) */
  applyRuleChanges(changes: RuleChange[], via: 'editor' | 'claude'): Promise<ApplyResult>;
  /** admin: stores a photo, video or PDF; returns its path, used in the text as rules-file:<path> */
  uploadRuleFile(file: Blob, name: string): Promise<string>;
  /** short-lived links to show stored files, by path */
  ruleFileUrls(paths: string[]): Promise<Record<string, string>>;
}

export type ErrorCode = 'forbidden' | 'invalid' | 'not_found' | 'not_signed_in' | 'bad_login' | 'conflict' | 'network';

export class RepoError extends Error {
  /** the raw database message, kept for diagnosing problems */
  detail?: string;
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}

/** What to show when the data cannot be loaded: the database's own reason helps fix it. */
export function loadErrorText(e: unknown): string {
  const raw = e instanceof RepoError ? e.detail || e.message : e instanceof Error ? e.message : String(e);
  if (/column .* does not exist|relation .* does not exist|function .* does not exist|schema cache/i.test(raw)) {
    return `Al database manca l'ultimo aggiornamento (${raw}). Esegui "npx supabase --workdir backend db push --linked", poi ricarica la pagina.`;
  }
  return `Impossibile caricare i dati (${raw}). Controlla la connessione e ricarica la pagina.`;
}

const CODES: Record<string, ErrorCode> = {
  ERR_FORBIDDEN: 'forbidden', ERR_INVALID: 'invalid', ERR_NOT_FOUND: 'not_found', ERR_NOT_SIGNED_IN: 'not_signed_in',
};

/** Turns a Supabase Auth sign-in error into something the person can act on. */
export function signInError(message: string): RepoError {
  const m = (message || '').trim();
  if (/invalid login credentials/i.test(m)) return new RepoError('bad_login', 'Nome utente o password sbagliati.');
  if (/email not confirmed/i.test(m)) return new RepoError('bad_login', 'Questo login non è ancora confermato. In Supabase conferma l’utente (o ricrealo con "Auto Confirm User").');
  if (/api key/i.test(m)) return new RepoError('network', `Accesso non riuscito: ${m}. Controlla VITE_SUPABASE_ANON_KEY.`);
  if (/fetch|network/i.test(m)) return new RepoError('network', `Accesso non riuscito: ${m}. Controlla VITE_SUPABASE_URL e la connessione.`);
  return new RepoError('network', `Accesso non riuscito: ${m}`);
}

/** Turns a Postgres error message from our functions into a RepoError with a sentence ready to show. */
export function parseDbError(message: string): RepoError {
  const m = /(ERR_[A-Z_]+)(?::\s*(.*))?/.exec(message || '');
  if (!m) {
    const e = new RepoError('network', 'Impossibile salvare. Controlla la connessione e riprova.');
    e.detail = message;
    return e;
  }
  const code = CODES[m[1]] || 'invalid';
  const detail = (m[2] || '').trim();
  const text = detail ? detail.charAt(0).toUpperCase() + detail.slice(1) + (/[.!?]$/.test(detail) ? '' : '.') : code === 'not_signed_in' ? 'Entra di nuovo.' : 'Operazione non permessa.';
  const e = new RepoError(code, text);
  e.detail = message;
  return e;
}
