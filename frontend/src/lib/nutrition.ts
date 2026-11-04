// Cosa porta in tavola un fungo: valori per 100 g e le sole indicazioni che la legge permette.
//
// Indicazioni nutrizionali: Reg. (CE) 1924/2006, allegato (soglie qui sotto).
// Indicazioni sulla salute: Reg. (UE) 432/2012, solo quelle autorizzate e solo se l'alimento è almeno
// "fonte di" quel nutriente (15% del valore nutritivo di riferimento per 100 g, Reg. (UE) 1169/2011 all. XIII).
// Niente "rinforza le difese", "antitumorale", "abbassa il colesterolo": per i funghi non sono autorizzate.
// Le frasi si calcolano dai numeri, così un dato cambiato non lascia in giro una frase non più vera.
import type { DateStr } from './dates';

export type Nutrients = {
  kcal: number | null;
  protein: number | null; // g
  fat: number | null; // g
  fiber: number | null; // g
  potassium: number | null; // mg
  phosphorus: number | null; // mg
  copper: number | null; // mg
  selenium: number | null; // µg
  niacin: number | null; // mg
  riboflavin: number | null; // mg
  pantothenic: number | null; // mg
  folate: number | null; // µg
  b6: number | null; // mg
};
export type Nutrition = { per100g: Nutrients; source: { text: string; url?: string; date?: DateStr }; approximate?: boolean };

/** Valori nutritivi di riferimento (Reg. UE 1169/2011, allegato XIII), stesse unità di Nutrients. */
export const NRV: Partial<Record<keyof Nutrients, number>> = {
  potassium: 2000, phosphorus: 700, copper: 1, selenium: 55,
  niacin: 16, riboflavin: 1.4, pantothenic: 6, folate: 200, b6: 1.4,
};
const NAME: Partial<Record<keyof Nutrients, string>> = {
  potassium: 'potassio', phosphorus: 'fosforo', copper: 'rame', selenium: 'selenio',
  niacin: 'vitamina B3 (niacina)', riboflavin: 'vitamina B2 (riboflavina)', pantothenic: 'vitamina B5 (acido pantotenico)',
  folate: 'folato', b6: 'vitamina B6',
};
/** Una sola frase autorizzata per nutriente (Reg. UE 432/2012), nella forma italiana. */
const HEALTH: Partial<Record<keyof Nutrients, string>> = {
  protein: 'Le proteine contribuiscono al mantenimento della massa muscolare.',
  niacin: 'La niacina contribuisce alla riduzione della stanchezza e dell\'affaticamento.',
  riboflavin: 'La riboflavina contribuisce al mantenimento di pelle normale.',
  pantothenic: 'L\'acido pantotenico contribuisce alla normale prestazione mentale.',
  folate: 'Il folato contribuisce alla normale funzione del sistema immunitario.',
  b6: 'La vitamina B6 contribuisce alla normale funzione del sistema immunitario.',
  potassium: 'Il potassio contribuisce al mantenimento di una pressione sanguigna normale.',
  copper: 'Il rame contribuisce alla normale funzione del sistema immunitario.',
  phosphorus: 'Il fosforo contribuisce al mantenimento di ossa normali.',
  selenium: 'Il selenio contribuisce alla normale funzione del sistema immunitario.',
};
/** Accompagna sempre le indicazioni sulla salute (Reg. CE 1924/2006, art. 10). */
export const VARIED_DIET = 'Una dieta varia ed equilibrata e uno stile di vita sano sono importanti per la salute.';

export type Claims = {
  /** brevi, da mostrare come etichette: "Poche calorie", "Fonte di fibre", "Fonte di vitamina B3 (niacina)" */
  nutrition: string[];
  /** frasi autorizzate, nello stesso ordine */
  health: string[];
  /** nutriente -> % del valore di riferimento in 100 g, solo quelli che arrivano almeno al 15% */
  nrvPct: Partial<Record<keyof Nutrients, number>>;
};

const ok = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function claims(n: Nutrients): Claims {
  const nutrition: string[] = [];
  const health: string[] = [];
  const nrvPct: Claims['nrvPct'] = {};
  if (ok(n.kcal) && n.kcal <= 40) nutrition.push('Poche calorie');
  if (ok(n.fat) && n.fat <= 3) nutrition.push('Pochi grassi');
  if (ok(n.fiber) && (n.fiber >= 3 || (ok(n.kcal) && n.kcal > 0 && (n.fiber / n.kcal) * 100 >= 1.5))) nutrition.push('Fonte di fibre');
  if (ok(n.protein) && ok(n.kcal) && n.kcal > 0 && (n.protein * 4) / n.kcal >= 0.12) {
    nutrition.push('Fonte di proteine');
    health.push(HEALTH.protein!);
  }
  for (const k of Object.keys(NRV) as Array<keyof Nutrients>) {
    const v = n[k];
    if (!ok(v)) continue;
    const pct = (v / NRV[k]!) * 100;
    if (pct >= 15) {
      nrvPct[k] = Math.round(pct);
      nutrition.push(`Fonte di ${NAME[k]}`);
      health.push(HEALTH[k]!);
    }
  }
  return { nutrition, health, nrvPct };
}

export function validateNutrition(n: Nutrition | null | undefined): string[] {
  if (!n) return [];
  const e: string[] = [];
  for (const [k, v] of Object.entries(n.per100g)) if (v !== null && !(typeof v === 'number' && v >= 0)) e.push(`Valore nutrizionale non valido: ${k}.`);
  if (!n.source?.text?.trim()) e.push('I valori nutrizionali hanno bisogno di una fonte.');
  return e;
}
