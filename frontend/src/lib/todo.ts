// Le cose da fare fuori dai cicli delle colture: telefonate, email, documenti, bandi.
// Tre stati: da fare, in attesa di risposta (tocca a qualcun altro), fatte.
// Le stesse regole di todo_save() nel database, per il modo demo e per avvisare prima di salvare.
import type { DateStr } from './dates';

export type TodoStatus = 'da_fare' | 'in_attesa' | 'fatto';
export const TODO_STATUSES: ReadonlyArray<{ id: TodoStatus; label: string }> = [
  { id: 'da_fare', label: 'Da fare' },
  { id: 'in_attesa', label: 'In attesa di risposta' },
  { id: 'fatto', label: 'Fatte' },
];

export type TodoInput = {
  title: string;
  status: TodoStatus;
  /** with whom: an office, a supplier, a person */
  who: string;
  due: DateStr | '';
  waitingSince: DateStr | '';
  note: string;
  /** e.g. the email in Gmail */
  link: string;
};
export type Todo = {
  id: string;
  title: string;
  status: TodoStatus;
  who: string | null;
  due: DateStr | null;
  waitingSince: DateStr | null;
  note: string | null;
  link: string | null;
  doneAt: number | null;
  createdAt: number;
};

export const EMPTY_TODO: TodoInput = { title: '', status: 'da_fare', who: '', due: '', waitingSince: '', note: '', link: '' };
export const toInput = (t: Todo): TodoInput => ({
  title: t.title, status: t.status, who: t.who ?? '', due: t.due ?? '', waitingSince: t.waitingSince ?? '', note: t.note ?? '', link: t.link ?? '',
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The first problem of the input, or null if it can be saved. */
export function checkTodo(i: TodoInput): string | null {
  const title = i.title.trim();
  if (!title) return "Scrivi cosa c'è da fare.";
  if (title.length > 200) return 'Il titolo è troppo lungo (200 caratteri al massimo).';
  if (!TODO_STATUSES.some((s) => s.id === i.status)) return 'Stato non valido.';
  if (i.who.trim().length > 120) return 'Il nome di chi è troppo lungo.';
  if (i.note.trim().length > 2000) return 'La nota è troppo lunga (2000 caratteri al massimo).';
  const link = i.link.trim();
  if (link && (link.length > 500 || !/^https?:\/\//.test(link))) return 'Il link deve iniziare con http:// o https://.';
  if ((i.due && !DATE_RE.test(i.due)) || (i.waitingSince && !DATE_RE.test(i.waitingSince))) return 'Data non valida.';
  return null;
}

/** Days between two dates (b - a). */
export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

/** After this many days without an answer, a reminder is worth sending. */
export const NUDGE_AFTER_DAYS = 7;

/** The three lists, each in the order that helps: what is due first, who has been waiting longest, what was done last. */
export function todoGroups(list: Todo[]): Record<TodoStatus, Todo[]> {
  const byDue = (a: Todo, b: Todo) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt - b.createdAt;
  return {
    da_fare: list.filter((t) => t.status === 'da_fare').sort(byDue),
    in_attesa: list.filter((t) => t.status === 'in_attesa').sort((a, b) => (a.waitingSince ?? '9999').localeCompare(b.waitingSince ?? '9999') || a.createdAt - b.createdAt),
    fatto: list.filter((t) => t.status === 'fatto').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
  };
}
