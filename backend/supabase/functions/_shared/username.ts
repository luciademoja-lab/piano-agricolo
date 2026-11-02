// Regole dei login condivise dall'app (browser) e dalla Edge Function admin-users (Deno).
// Si entra con un nome utente; Supabase Auth vuole un'email, quindi ogni nome utente diventa
// un indirizzo interno su LOGIN_DOMAIN. A quell'indirizzo non parte mai nessuna email
// (le conferme sono spente e i login li crea l'admin).

export const LOGIN_DOMAIN = 'login.piano-agricolo.app';

export function normalizeUsername(u: string): string {
  return (u || '').trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 3 || u.length > 32) return 'Il nome utente deve avere da 3 a 32 caratteri.';
  if (!/^[a-z0-9._-]+$/.test(u)) return 'Usa solo lettere, numeri, punti, trattini e trattini bassi.';
  if (!/^[a-z0-9]/.test(u)) return 'Inizia con una lettera o un numero.';
  return null;
}

export function validatePassword(p: string): string | null {
  if (!p || p.length < 10) return 'La password deve avere almeno 10 caratteri.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'La password deve contenere almeno una lettera e un numero.';
  return null;
}

export function usernameToEmail(u: string, domain: string = LOGIN_DOMAIN): string {
  return `${normalizeUsername(u)}@${domain}`;
}

/** What to send to Supabase Auth: the internal address for a username, or the email as typed. */
export function loginEmail(input: string): string {
  const v = (input || '').trim().toLowerCase();
  return v.includes('@') ? v : usernameToEmail(v);
}

export function emailToUsername(email: string, domain: string = LOGIN_DOMAIN): string | null {
  const suffix = '@' + domain;
  return email && email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length).toLowerCase() : null;
}

const LETTERS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

/** 12 characters, letters and digits, without 0/O/1/l/I. */
export function generatePassword(): string {
  const all = LETTERS + DIGITS;
  for (;;) {
    const bytes = new Uint32Array(12);
    crypto.getRandomValues(bytes);
    const p = Array.from(bytes, (b) => all[b % all.length]).join('');
    if (validatePassword(p) === null) return p;
  }
}
