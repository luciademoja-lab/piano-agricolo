// The action plan: crops added to the plan, their tasks and their expenses, and the rules that
// decide whether a crop can be added. The same checks run in the database (plan_add) and in the
// in-memory repository; the tasks and expenses of a new crop are generated here, once, for both.
import { cropById, inWindow, scaleUnit, type Catalog, type Crop, type Space } from './catalog';
import { addDays, addMonths, isDate, type DateStr } from './dates';

export type Settings = {
  outdoorM2: number; indoorM2: number | null;
  /** last day to apply for the young-farmer grant (the day before turning 41); null until set */
  grantDeadline: DateStr | null;
};
export type Planting = {
  id: string; cropId: string; m2: number; heads: number | null; start: DateStr;
  /** share of the production expected to be sold, 0–100 */
  soldPct: number; note: string; createdAt: number;
};
export type PlantingInput = Omit<Planting, 'id' | 'createdAt'>;
export type FarmTask = {
  id: string; plantingId: string | null; title: string; due: DateStr; done: boolean; doneAt: number | null;
  /** cycle: generated from the crop's cycle · manual: added by hand */
  source: 'cycle' | 'manual';
};
export type ExpenseKind = 'investment' | 'recurring' | 'other';
export type Expense = {
  id: string; plantingId: string | null; title: string; date: DateStr;
  /** planned amount as a range: pessimistic uses max, optimistic min */
  amountMin: number; amountMax: number; kind: ExpenseKind;
  paid: boolean; actualAmount: number | null; source: 'catalog' | 'manual';
};
export type NewTask = Omit<FarmTask, 'id' | 'done' | 'doneAt'>;
export type NewExpense = Omit<Expense, 'id' | 'paid' | 'actualAmount'>;
export type Farm = { catalog: Catalog; settings: Settings; plantings: Planting[]; tasks: FarmTask[]; expenses: Expense[] };

export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = { investment: 'Investimento', recurring: 'Ricorrente', other: 'Altro' };
/** The plan looks three years ahead. */
export const HORIZON_MONTHS = 36;
const MAX_TASKS_PER_CROP = 1500;

/** m² taken in one space by the crops in the plan. */
export function usedSpace(plantings: Planting[], catalog: Catalog, space: Space): number {
  return plantings.reduce((sum, p) => sum + (cropById(catalog, p.cropId)?.space === space ? p.m2 : 0), 0);
}
export const spaceAvailable = (s: Settings, space: Space) => (space === 'outdoor' ? s.outdoorM2 : s.indoorM2);

export type Check = { errors: string[]; warnings: string[] };
const fmt = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);

/** Whether a crop can go into the plan: errors stop it, warnings are shown and let it through. */
export function checkPlanting(input: PlantingInput, farm: Pick<Farm, 'catalog' | 'settings' | 'plantings'>, today: DateStr): Check {
  const errors: string[] = [], warnings: string[] = [];
  const crop = cropById(farm.catalog, input.cropId);
  if (!crop) return { errors: ['Scegli una coltura dal catalogo.'], warnings };
  if (!(Number.isFinite(input.m2) && input.m2 > 0)) errors.push('Indica i m² da assegnare (più di 0).');
  if (crop.scale === 'capi' && !(Number.isInteger(input.heads) && (input.heads as number) > 0)) errors.push('Indica il numero di capi (almeno 1).');
  if (!(input.soldPct >= 0 && input.soldPct <= 100)) errors.push('La quota venduta va da 0 a 100%.');
  if (!isDate(input.start)) errors.push('Scegli la data di inizio.');
  else {
    if (!inWindow(crop.windows, input.start)) errors.push(`${crop.name} non si può avviare in questa data: è fuori dalla finestra di avvio.`);
    if (input.start < addMonths(today, -24) || input.start > addMonths(today, HORIZON_MONTHS)) errors.push('La data di inizio deve stare tra due anni fa e tre anni da oggi.');
  }
  const available = spaceAvailable(farm.settings, crop.space);
  if (available === null) errors.push('Indica prima quanto spazio interno hai a disposizione.');
  else if (Number.isFinite(input.m2) && input.m2 > 0) {
    const used = usedSpace(farm.plantings, farm.catalog, crop.space);
    if (used + input.m2 > available) {
      errors.push(`Spazio ${crop.space === 'indoor' ? 'interno' : 'esterno'} insufficiente: ne restano ${fmt(Math.max(0, available - used))} m² su ${fmt(available)}.`);
    }
  }
  if (!errors.length) {
    if (crop.minM2 !== null && input.m2 < crop.minM2) warnings.push(`Lo schema consiglia almeno ${fmt(crop.minM2)} m² per ${crop.name}.`);
    if (crop.m2PerHead && input.heads && input.m2 < input.heads * crop.m2PerHead) {
      warnings.push(`Con ${input.heads} capi lo schema consiglia almeno ${fmt(input.heads * crop.m2PerHead)} m².`);
    }
    if (!crop.income) warnings.push('Il ricavo di questa coltura è un dato mancante: nei prospetti conterà zero finché non lo verifichi.');
    if (input.start < today) warnings.push('La data è nel passato: i task del ciclo partono da oggi.');
  }
  return { errors, warnings };
}

/** How many units (m² or animals) the crop's numbers must be multiplied by. */
export function scaleFactor(crop: Crop, p: Pick<Planting, 'm2' | 'heads'>, refQty = crop.refQty): number {
  const qty = crop.scale === 'capi' ? p.heads ?? 0 : p.m2;
  return qty / refQty;
}
export const quantityLabel = (crop: Crop, p: Pick<Planting, 'm2' | 'heads'>) =>
  crop.scale === 'capi' ? `${p.heads} ${scaleUnit(crop)} su ${fmt(p.m2)} m²` : `${fmt(p.m2)} m²`;

/** The cycle's tasks from the start date to the end of the horizon, skipping days before `from`. */
export function generateTasks(crop: Crop, start: DateStr, from: DateStr): Array<Omit<NewTask, 'plantingId'>> {
  const end = addMonths(start > from ? start : from, HORIZON_MONTHS);
  const out: Array<Omit<NewTask, 'plantingId'>> = [];
  for (const t of crop.tasks) {
    for (let due = addDays(start, t.offsetDays); due <= end && out.length < MAX_TASKS_PER_CROP; due = addDays(due, t.everyDays ?? Infinity)) {
      if (due >= from) out.push({ title: t.title, due, source: 'cycle' });
      if (t.everyDays === null) break;
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.title.localeCompare(b.title)));
}

/** The initial investment from the catalogue, on the start date, scaled to the crop's size. */
export function generateExpenses(crop: Crop, p: Pick<Planting, 'm2' | 'heads' | 'start'>): Array<Omit<NewExpense, 'plantingId'>> {
  if (!crop.budget) return [];
  const f = scaleFactor(crop, p, crop.budget.refQty);
  const round = (n: number) => Math.round(n * 100) / 100;
  return [{
    title: `Investimento iniziale — ${crop.name}`, date: p.start, kind: 'investment', source: 'catalog',
    amountMin: round(crop.budget.min * f), amountMax: round(crop.budget.max * f),
  }];
}

/** A manual task or expense must have a title and a valid date. */
export function checkManualTask(title: string, due: string): string | null {
  if (!title.trim()) return 'Scrivi cosa c\'è da fare.';
  if (title.trim().length > 200) return 'Il titolo è troppo lungo (200 caratteri al massimo).';
  if (!isDate(due)) return 'Scegli una data.';
  return null;
}
export function checkManualExpense(title: string, date: string, min: number, max: number): string | null {
  if (!title.trim()) return 'Scrivi a cosa serve la spesa.';
  if (!isDate(date)) return 'Scegli una data.';
  if (!(Number.isFinite(min) && min >= 0 && Number.isFinite(max) && max >= min)) return 'L\'importo massimo non può essere minore del minimo.';
  return null;
}
