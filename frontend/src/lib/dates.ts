// Calendar dates as "YYYY-MM-DD" strings. The farm works in whole days, so dates never carry a
// time or a time zone: arithmetic happens on UTC midnights and comes back as a string.

export type DateStr = string;
const DAY = 86_400_000;
const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDate(s: unknown): s is DateStr {
  if (typeof s !== 'string') return false;
  const m = RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const toMs = (s: DateStr) => { const m = RE.exec(s)!; return Date.UTC(+m[1], +m[2] - 1, +m[3]); };
const fromMs = (ms: number): DateStr => new Date(ms).toISOString().slice(0, 10);

export const addDays = (s: DateStr, n: number): DateStr => fromMs(toMs(s) + n * DAY);
export const daysBetween = (a: DateStr, b: DateStr): number => Math.round((toMs(b) - toMs(a)) / DAY);

/** Adds whole months, keeping the day where possible (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: DateStr, n: number): DateStr {
  const [y, m, d] = s.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fromMs(Date.UTC(ny, nm, Math.min(d, last)));
}

/** "YYYY-MM" of a date. */
export const monthOf = (s: DateStr) => s.slice(0, 7);
export const monthStart = (month: string): DateStr => month + '-01';
export const daysInMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const nextMonth = (month: string) => monthOf(addMonths(monthStart(month), 1));

/** Today in Italy, where the farm is (the browser may be elsewhere). */
export function todayInRome(now: number = Date.now()): DateStr {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MONTHS_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** "3 ago 2027" */
export function dateLabel(s: DateStr, withYear = true): string {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}
/** "agosto 2027" */
export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  return short ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : `${MONTHS_LONG[m - 1]} ${y}`;
}
/** "1 ago" from "08-01" */
export function monthDayLabel(md: string): string {
  const [m, d] = md.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** 0 = Monday … 6 = Sunday */
export const weekday = (s: DateStr) => (new Date(toMs(s)).getUTCDay() + 6) % 7;
