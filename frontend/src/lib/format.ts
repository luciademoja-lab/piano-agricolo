// Numbers as they are written in Italy: 1.234,5 · € 1.234 · 12 m².
const nf = (digits: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: digits, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);

export const num = (n: number, digits = 1) => nf(digits).format(n);
export const m2 = (n: number) => `${num(n, 2)} m²`;
export const eur = (n: number) => `€ ${nf(0).format(Math.round(n))}`;
/** "€ 200–500", or one number when both ends match */
export const eurRange = (min: number, max: number) => (Math.round(min) === Math.round(max) ? eur(min) : `€ ${nf(0).format(Math.round(min))}–${nf(0).format(Math.round(max))}`);
/** short, for chart axes: € 12k, € -3k */
export function eurShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `€ ${num(n / 1_000_000, 1)}M`;
  if (a >= 1000) return `€ ${num(n / 1000, a >= 10_000 ? 0 : 1)}k`;
  return eur(n);
}
export const hoursRange = (min: number, max: number) => (Math.abs(min - max) < 0.05 ? `${num(min)} h` : `${num(min)}–${num(max)} h`);
