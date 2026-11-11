// Il questionario pubblico (preordini e manifestazioni di interesse): chi sei, quali funghi,
// quanti kg e ogni quanto, come ti contatto. Le stesse regole di interest_submit() nel database,
// per il modo demo e per avvisare prima di inviare. E la domanda che ne viene fuori, per l'admin.
import { num } from './format';

export type InterestKind = 'ristorante' | 'privato';
export type Frequency = 'settimanale' | 'quindicinale' | 'mensile' | 'occasionale';
export type InterestStatus = 'nuova' | 'contattata' | 'cliente' | 'archiviata';

export const FREQUENCIES: ReadonlyArray<{ id: Frequency; label: string; perWeek: number }> = [
  { id: 'settimanale', label: 'Ogni settimana', perWeek: 1 },
  { id: 'quindicinale', label: 'Ogni due settimane', perWeek: 0.5 },
  { id: 'mensile', label: 'Una volta al mese', perWeek: 12 / 52 },
  { id: 'occasionale', label: 'Ogni tanto, quando capita', perWeek: 0 },
];
export const STATUSES: ReadonlyArray<{ id: InterestStatus; label: string }> = [
  { id: 'nuova', label: 'Nuova' },
  { id: 'contattata', label: 'Contattata' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'archiviata', label: 'Archiviata' },
];
export const MAX_ITEMS = 3;

export type InterestOption = { id: string; commonName: string; scientificName: string; sellable: boolean };
/** one mushroom of the request: a variety of the list, or another one written by hand */
export type InterestItemInput = { variety: string | null; other: string | null; kg: number };
export type InterestInput = {
  kind: InterestKind;
  name: string;
  /** the restaurant or shop; only for kind 'ristorante' */
  business: string;
  town: string;
  email: string;
  phone: string;
  frequency: Frequency;
  note: string;
  /** has read the privacy notice: required */
  privacy: boolean;
  /** wants updates: optional, a separate consent */
  updates: boolean;
  items: InterestItemInput[];
};
export type InterestItem = { varietyId: string | null; label: string; kg: number };
export type Interest = {
  id: string;
  createdAt: number;
  kind: InterestKind;
  name: string;
  business: string | null;
  town: string;
  email: string;
  phone: string | null;
  frequency: Frequency;
  note: string | null;
  updatesAt: number | null;
  updatesStoppedAt: number | null;
  status: InterestStatus;
  adminNote: string | null;
  items: InterestItem[];
};

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PHONE_RE = /^\+?[0-9 ().-]{6,25}$/;

/** "1,5" or "1.5" -> 1.5; empty -> null; anything else -> NaN */
export function parseKg(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** 0,25 -> "250 g"; 1,5 -> "1,5 kg" */
export function qty(kg: number): string {
  return kg < 1 ? `${num(kg * 1000, 0)} g` : `${num(kg, 2)} kg`;
}

export type Step = 1 | 2 | 3 | 4;
export type Problem = { step: Step; message: string };

/** Every problem of the request, with the step of the form it belongs to. Empty = it can be sent. */
export function validateInterest(i: InterestInput, options: InterestOption[]): Problem[] {
  const out: Problem[] = [];
  const bad = (step: Step, message: string) => out.push({ step, message });
  if (i.kind !== 'ristorante' && i.kind !== 'privato') bad(1, 'Dimmi se hai un locale o sei un privato.');

  if (i.items.length === 0) bad(2, 'Scegli almeno un fungo.');
  if (i.items.length > MAX_ITEMS) bad(2, `Puoi scegliere al massimo ${MAX_ITEMS} funghi.`);
  const seen = new Set<string>();
  for (const it of i.items) {
    let label: string;
    if (it.variety) {
      const o = options.find((x) => x.id === it.variety);
      if (!o) { bad(2, 'Questo fungo non è tra quelli che si possono scegliere.'); continue; }
      label = o.commonName;
    } else {
      label = (it.other || '').trim();
      if (!label) { bad(2, 'Scrivi quale altro fungo ti interessa.'); continue; }
      if (label.length > 80) bad(2, 'Il nome dell’altro fungo è troppo lungo.');
    }
    if (seen.has(label.toLowerCase())) bad(2, 'Hai scelto due volte lo stesso fungo.');
    seen.add(label.toLowerCase());
    if (!Number.isFinite(it.kg)) bad(3, `Indica quanti kg vorresti di ${label}.`);
    else if (it.kg <= 0 || it.kg > 100) bad(3, `I kg a consegna di ${label} devono essere più di 0 e al massimo 100.`);
  }
  if (!FREQUENCIES.some((f) => f.id === i.frequency)) bad(3, 'Dimmi ogni quanto li vorresti.');

  const name = i.name.trim(), business = i.business.trim(), town = i.town.trim(), email = i.email.trim(), phone = i.phone.trim();
  if (!name) bad(4, 'Scrivi il tuo nome.');
  else if (name.length > 120) bad(4, 'Il nome è troppo lungo.');
  if (i.kind === 'ristorante' && !business) bad(4, 'Scrivi il nome del locale.');
  else if (business.length > 120) bad(4, 'Il nome del locale è troppo lungo.');
  if (!town) bad(4, 'Scrivi il comune dove vorresti la consegna.');
  else if (town.length > 80) bad(4, 'Il nome del comune è troppo lungo.');
  if (email.length > 200 || !EMAIL_RE.test(email)) bad(4, 'Controlla l’indirizzo email.');
  if (phone && !PHONE_RE.test(phone)) bad(4, 'Controlla il numero di telefono.');
  if (i.note.trim().length > 1000) bad(4, 'La nota è troppo lunga (al massimo 1000 caratteri).');
  if (i.privacy !== true) bad(4, 'Per inviare la richiesta devi aver letto l’informativa sulla privacy.');
  return out;
}

/** Newest first, one per person (same email): what each person wants now. */
export function latestPerEmail(list: Interest[]): Interest[] {
  const seen = new Set<string>();
  return [...list].sort((a, b) => b.createdAt - a.createdAt).filter((r) => {
    const k = r.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Whether this person, by their latest request, wants updates. */
export const wantsUpdates = (r: Interest) => r.updatesAt !== null && r.updatesStoppedAt === null;

/** The email addresses that agreed to receive updates and have not stopped. */
export function subscribers(list: Interest[]): string[] {
  return latestPerEmail(list).filter(wantsUpdates).map((r) => r.email);
}

export type Demand = {
  key: string;
  label: string;
  varietyId: string | null;
  /** how many people want it */
  people: number;
  ristoranti: number;
  privati: number;
  /** kg a week from those who want it regularly */
  kgPerWeek: number;
  /** kg per delivery from those who want it now and then */
  occasionalKg: number;
};

/** What people want, mushroom by mushroom: each person counted once (latest request), archived ones left out. */
export function demand(list: Interest[]): Demand[] {
  const by = new Map<string, Demand>();
  for (const r of latestPerEmail(list)) {
    if (r.status === 'archiviata') continue;
    const perWeek = FREQUENCIES.find((f) => f.id === r.frequency)?.perWeek ?? 0;
    for (const it of r.items) {
      const key = it.varietyId ?? `altro:${it.label.trim().toLowerCase()}`;
      const d = by.get(key) ?? { key, label: it.label, varietyId: it.varietyId, people: 0, ristoranti: 0, privati: 0, kgPerWeek: 0, occasionalKg: 0 };
      d.people += 1;
      if (r.kind === 'ristorante') d.ristoranti += 1; else d.privati += 1;
      if (r.frequency === 'occasionale') d.occasionalKg += it.kg;
      else d.kgPerWeek += it.kg * perWeek;
      by.set(key, d);
    }
  }
  return [...by.values()].sort((a, b) => b.kgPerWeek - a.kgPerWeek || b.people - a.people || a.label.localeCompare(b.label, 'it'));
}
