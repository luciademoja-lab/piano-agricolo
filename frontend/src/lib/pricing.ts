// Catalogo funghi: dati per varietà, parametri dei prezzi, costo per kg e prezzi minimi.
// Tutto il calcolo vive qui (testato) e lo usano sia la demo sia la versione collegata al database.
//
// costo per kg = (balla + quota di spedizione + energia e acqua del locale per la durata del ciclo) / kg venduti
//                + imballaggio al kg
// kg venduti   = peso della balla × resa attesa (media tra minima e massima) × (1 − scarto)
// prezzo minimo all'ingrosso = costo × (1 + margine all'ingrosso); al dettaglio = costo × (1 + margine al dettaglio)
//
// Un dato mancante resta null e il calcolo lo dice: non diventa mai zero.
import seed from '../../../backend/supabase/seed/funghi_v1.json';
import type { DateStr } from './dates';

export type Range = { min: number; max: number };
export type Source = { text: string; url?: string; date?: DateStr };
export type Legal = 'ammesso' | 'non_in_elenco';
export type SupplyMode = 'balla' | 'ingrosso';

export type Variety = {
  id: string;
  public: boolean;
  commonName: string;
  scientificName: string;
  otherNames: string;
  kitchen: string;
  photo: { url: string; page: string; credit: string } | null;
  legal: Legal;
  legalNote: string;
  supply: {
    mode: SupplyMode;
    supplier: string;
    supplierUrl: string | null;
    baleKg: number | null;
    balePrice: number | null;
    shippingPerOrder: number | null;
    balesPerOrder: number;
    /** substrato all'ingrosso, trasporto compreso, €/kg di substrato umido */
    bulkEurPerKg: number | null;
    bulkSupplier: string;
  };
  /** giorni dall'ordine alla consegna della balla */
  shipDays: Range | null;
  /** giorni di incubazione ancora da fare dopo l'arrivo (0 per le balle vendute incubate) */
  incubationDays: Range | null;
  /** giorni dall'inizio della fruttificazione alla prima raccolta */
  firstHarvestDays: Range | null;
  /** giorni di produzione dalla prima raccolta alla fine della balla */
  fruitingDays: Range | null;
  flushes: number | null;
  /** resa sull'intero ciclo, in % del peso umido della balla */
  yieldPct: Range | null;
  incubation: { t: Range | null; rh: Range | null };
  fruiting: { t: Range | null; rh: Range | null };
  market: { wholesale: Range | null; retail: Range | null };
  sources: Record<string, Source>;
  notes: string;
};

export type Param = {
  key: string;
  group: string;
  label: string;
  unit: string;
  value: number;
  source: string;
  url?: string | null;
  date?: DateStr | null;
  position?: number;
};
export type Params = Record<string, Param>;

/** Il prezzo pubblicato nel listino provvisorio (null = non ancora deciso). */
export type ListPrice = { wholesale: number | null; retail: number | null; updatedAt: number | null };
export type VarietyRow = { variety: Variety; position: number; list: ListPrice };

/** Quello che vede chi non è entrato: niente costi, fornitori, margini o fonti. */
export type PublicVariety = Pick<Variety, 'id' | 'commonName' | 'scientificName' | 'otherNames' | 'kitchen' | 'photo' | 'shipDays' | 'incubationDays' | 'firstHarvestDays'> & { list: ListPrice };

type SeedParam = Omit<Param, 'position'>;
type SeedVariety = Variety & { list?: { wholesale: number | null; retail: number | null } };
const SEED = seed as unknown as { params: SeedParam[]; varieties: SeedVariety[] };
export const SEED_PARAMS: Param[] = SEED.params.map((p, i) => ({ url: null, date: null, ...p, position: i + 1 }));
export const SEED_VARIETIES: Variety[] = SEED.varieties.map(({ list: _list, ...v }) => v);
/** the list prices the first version starts with, by variety (the rest: not decided yet) */
export const SEED_LIST: Record<string, { wholesale: number | null; retail: number | null }> =
  Object.fromEntries(SEED.varieties.filter((v) => v.list).map((v) => [v.id, v.list!]));

export const PARAM_KEYS = SEED_PARAMS.map((p) => p.key);
export const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const monthKey = (m: number) => `temp_${String(m + 1).padStart(2, '0')}`;

export function paramsByKey(list: Param[]): Params {
  return Object.fromEntries(list.map((p) => [p.key, p]));
}
const val = (p: Params, k: string): number => {
  const v = p[k]?.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Parametro mancante: ${k}`);
  return v;
};

export const mid = (r: Range) => (r.min + r.max) / 2;

/** Pubblico: dall'ordine della balla alla prima raccolta (spedizione + incubazione + primi funghi). */
export function daysToFirstHarvest(v: Pick<Variety, 'shipDays' | 'incubationDays' | 'firstHarvestDays'>): Range | null {
  if (!v.shipDays || !v.incubationDays || !v.firstHarvestDays) return null;
  return {
    min: v.shipDays.min + v.incubationDays.min + v.firstHarvestDays.min,
    max: v.shipDays.max + v.incubationDays.max + v.firstHarvestDays.max,
  };
}

export type MonthNeed = 'ok' | 'heat' | 'cool';
export type MonthEnergy = { month: number; temp: number; need: MonthNeed; kwh: number; eur: number };

/**
 * Energia del locale di fruttificazione in un mese, per tutto il locale.
 * Umidificatore, luce e ventola sempre; il riscaldatore solo se il locale è sotto la minima della varietà.
 * Sopra la massima servirebbe raffrescare: non lo mettiamo nei costi, quel mese è "fuori stagione".
 */
export function monthEnergy(v: Variety, p: Params, month: number): MonthEnergy {
  const temp = val(p, monthKey(month));
  const days = 30;
  let kwh = (val(p, 'humidifier_w') * val(p, 'humidifier_h') + val(p, 'led_w') * val(p, 'led_h') + val(p, 'fan_w') * val(p, 'fan_h')) * days / 1000;
  let need: MonthNeed = 'ok';
  const t = v.fruiting.t;
  if (t && temp < t.min) {
    need = 'heat';
    const hours = Math.min(24, (t.min - temp) * val(p, 'heater_h_per_c'));
    kwh += val(p, 'heater_w') * hours * days / 1000;
  } else if (t && temp > t.max) {
    need = 'cool';
  }
  return { month, temp, need, kwh, eur: kwh * val(p, 'energy_eur_kwh') };
}

/** I mesi in cui la varietà si può coltivare senza raffrescare (con o senza riscaldamento). */
export function season(v: Variety, p: Params): MonthEnergy[] {
  return MONTHS.map((_, m) => monthEnergy(v, p, m)).filter((e) => e.need !== 'cool');
}

export type Missing = { field: string; label: string };
export type Cost = {
  supply: SupplyMode;
  /** kg di substrato comprati per una balla (o 1 kg all'ingrosso) */
  substrateKg: number;
  substrateEur: number;
  shippingEur: number;
  /** energia e acqua del locale, la quota di questa balla per i mesi del ciclo */
  energyEur: number;
  cycleMonths: number;
  /** media mensile della stagione (tutto il locale), per mostrarla */
  spaceEnergyEurMonth: number;
  seasonMonths: number[];
  heatMonths: number[];
  kgSold: Range & { expected: number };
  /** €/kg: con la resa attesa, e il campo con la resa minima (peggio) e massima (meglio) */
  costPerKg: { expected: number; worst: number; best: number };
  minWholesale: number;
  minRetail: number;
};
export type Verdict = 'conveniente' | 'al_limite' | 'non_conveniente' | 'senza_mercato';
export type Pricing = { ok: true; cost: Cost; verdict: Verdict } | { ok: false; missing: Missing[] };

const roundUp10 = (n: number) => Math.ceil(n * 10 - 1e-9) / 10;

/** Costo per kg e prezzi minimi, o l'elenco dei dati che mancano per calcolarli. */
export function priceVariety(v: Variety, p: Params): Pricing {
  const missing: Missing[] = [];
  const s = v.supply;
  const bulk = s.mode === 'ingrosso';
  if (bulk && s.bulkEurPerKg === null) missing.push({ field: 'supply.bulkEurPerKg', label: 'prezzo del substrato all\'ingrosso' });
  if (!bulk) {
    if (s.baleKg === null) missing.push({ field: 'supply.baleKg', label: 'peso della balla' });
    if (s.balePrice === null) missing.push({ field: 'supply.balePrice', label: 'prezzo della balla' });
    if (s.shippingPerOrder === null) missing.push({ field: 'supply.shippingPerOrder', label: 'costo della spedizione' });
  }
  if (!v.yieldPct) missing.push({ field: 'yieldPct', label: 'resa' });
  if (!v.firstHarvestDays) missing.push({ field: 'firstHarvestDays', label: 'giorni alla prima raccolta' });
  if (!v.fruitingDays) missing.push({ field: 'fruitingDays', label: 'durata della produzione' });
  if (!v.fruiting.t) missing.push({ field: 'fruiting.t', label: 'temperatura di fruttificazione' });
  if (missing.length) return { ok: false, missing };

  const months = season(v, p);
  if (!months.length) return { ok: false, missing: [{ field: 'fruiting.t', label: 'un mese in cui il locale stia nella temperatura giusta senza raffrescare' }] };

  const substrateKg = bulk ? 1 : s.baleKg!;
  const substrateEur = bulk ? s.bulkEurPerKg! : s.balePrice!;
  const shippingEur = bulk ? 0 : s.shippingPerOrder! / Math.max(1, s.balesPerOrder);
  const spaceEnergyEurMonth = months.reduce((a, e) => a + e.eur, 0) / months.length;
  // giorni in cui la balla occupa il locale: incubazione rimasta + attesa dei primi funghi + produzione
  const cycleDays = (v.incubationDays ? mid(v.incubationDays) : 0) + mid(v.firstHarvestDays!) + mid(v.fruitingDays!);
  const cycleMonths = cycleDays / 30;
  const share = substrateKg / val(p, 'space_kg');
  const energyEur = (spaceEnergyEurMonth + val(p, 'water_eur_month')) * cycleMonths * share;

  const keep = 1 - val(p, 'loss_pct') / 100;
  const y = v.yieldPct!;
  const kgSold = { min: substrateKg * y.min / 100 * keep, max: substrateKg * y.max / 100 * keep, expected: substrateKg * mid(y) / 100 * keep };
  const perBale = substrateEur + shippingEur + energyEur;
  const pack = val(p, 'packaging_eur_kg');
  const costPerKg = { expected: perBale / kgSold.expected + pack, worst: perBale / kgSold.min + pack, best: perBale / kgSold.max + pack };
  const minWholesale = roundUp10(costPerKg.expected * (1 + val(p, 'margin_wholesale_pct') / 100));
  const minRetail = roundUp10(costPerKg.expected * (1 + val(p, 'margin_retail_pct') / 100));

  const cost: Cost = {
    supply: s.mode, substrateKg, substrateEur, shippingEur, energyEur, cycleMonths, spaceEnergyEurMonth,
    seasonMonths: months.map((e) => e.month), heatMonths: months.filter((e) => e.need === 'heat').map((e) => e.month),
    kgSold, costPerKg, minWholesale, minRetail,
  };
  return { ok: true, cost, verdict: verdict(minWholesale, v.market.wholesale) };
}

/**
 * Il mercato paga abbastanza? Si confronta il prezzo minimo all'ingrosso con i prezzi all'ingrosso trovati.
 * Sopra il massimo del mercato: non conveniente. Tra minimo e massimo: al limite.
 */
export function verdict(minWholesale: number, market: Range | null): Verdict {
  if (!market) return 'senza_mercato';
  if (minWholesale > market.max) return 'non_conveniente';
  if (minWholesale > market.min) return 'al_limite';
  return 'conveniente';
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  conveniente: 'Conveniente',
  al_limite: 'Al limite',
  non_conveniente: 'Non conveniente',
  senza_mercato: 'Prezzo di mercato mancante',
};

/** Il listino pubblicato è ancora uguale ai prezzi minimi calcolati adesso? */
export function listUpToDate(list: ListPrice, pr: Pricing): boolean {
  if (!pr.ok) return true;
  return list.wholesale === pr.cost.minWholesale && list.retail === pr.cost.minRetail;
}

/** Controlli sui dati di una varietà prima di salvarla (gli stessi li fa variety_save nel database). */
export function validateVariety(v: Variety): string[] {
  const e: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(v.id)) e.push('Codice non valido: solo lettere minuscole, numeri e trattini.');
  if (!v.commonName.trim()) e.push('Indica il nome comune.');
  if (!v.scientificName.trim()) e.push('Indica il nome scientifico.');
  if (v.public && v.legal !== 'ammesso') e.push('Una specie che non è nell\'elenco di quelle vendibili non può stare nel catalogo pubblico.');
  const ranges: Array<[string, Range | null]> = [
    ['giorni di spedizione', v.shipDays], ['giorni di incubazione', v.incubationDays], ['giorni alla prima raccolta', v.firstHarvestDays],
    ['giorni di produzione', v.fruitingDays], ['resa', v.yieldPct], ['temperatura di incubazione', v.incubation.t],
    ['umidità di incubazione', v.incubation.rh], ['temperatura di fruttificazione', v.fruiting.t], ['umidità di fruttificazione', v.fruiting.rh],
    ['prezzo all\'ingrosso di mercato', v.market.wholesale], ['prezzo al dettaglio di mercato', v.market.retail],
  ];
  for (const [label, r] of ranges) {
    if (!r) continue;
    if (!Number.isFinite(r.min) || !Number.isFinite(r.max)) e.push(`${cap(label)}: indica minimo e massimo.`);
    else if (r.min > r.max) e.push(`${cap(label)}: il minimo è più alto del massimo.`);
    else if (r.min < 0 && !label.startsWith('temperatura')) e.push(`${cap(label)}: non può essere negativo.`);
  }
  if (v.yieldPct && v.yieldPct.max > 100) e.push('Resa: non può superare il 100% del peso della balla.');
  for (const [label, n] of [['peso della balla', v.supply.baleKg], ['prezzo della balla', v.supply.balePrice], ['costo della spedizione', v.supply.shippingPerOrder], ['prezzo del substrato all\'ingrosso', v.supply.bulkEurPerKg]] as const) {
    if (n !== null && !(n >= 0)) e.push(`${cap(label)}: deve essere un numero, zero o più.`);
  }
  if (v.supply.baleKg === 0) e.push('Peso della balla: deve essere più di 0.');
  if (!(v.supply.balesPerOrder >= 1)) e.push('Balle per ordine: almeno 1.');
  return e;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function validateParam(key: string, value: number, source: string): string[] {
  const e: string[] = [];
  if (!PARAM_KEYS.includes(key)) e.push('Parametro sconosciuto.');
  if (!Number.isFinite(value)) e.push('Indica un numero.');
  else if (value < 0 && !key.startsWith('temp_')) e.push('Il valore non può essere negativo.');
  if (!source.trim()) e.push('Indica la fonte (anche "ipotesi" o "misura mia").');
  return e;
}

/** Solo i campi pubblici di una varietà, come li restituisce catalog_public() nel database. */
export function toPublic(r: VarietyRow): PublicVariety {
  const v = r.variety;
  return {
    id: v.id, commonName: v.commonName, scientificName: v.scientificName, otherNames: v.otherNames, kitchen: v.kitchen, photo: v.photo,
    shipDays: v.shipDays, incubationDays: v.incubationDays, firstHarvestDays: v.firstHarvestDays, list: { ...r.list },
  };
}
