// Il simbolo del marchio e i suoi colori, da soli: li usano anche le pagine pubbliche (intestazione),
// senza caricare il resto del kit. Un fungo il cui cappello, con le lamelle, è anche un sole che sorge.

export const PALETTE = [
  { id: 'terra', name: 'Terra', hex: '#a4532f', use: 'Il colore del marchio: il cappello del fungo, i titoli, i pulsanti' },
  { id: 'oliva', name: 'Oliva', hex: '#4f5d2f', use: 'Il gambo, i fondi pieni, la seconda tinta' },
  { id: 'inchiostro', name: 'Inchiostro', hex: '#2b241c', use: 'I testi' },
  { id: 'crema', name: 'Crema', hex: '#efe4d0', use: 'Riquadri e fondi chiari' },
  { id: 'carta', name: 'Carta', hex: '#f5efe4', use: 'Lo sfondo delle pagine e dei post' },
  { id: 'bianco', name: 'Bianco caldo', hex: '#fffaf2', use: 'I testi sui fondi scuri' },
] as const;
export const C = Object.fromEntries(PALETTE.map((c) => [c.id, c.hex])) as Record<(typeof PALETTE)[number]['id'], string>;

export type LogoVariant = 'colore' | 'negativo' | 'mono';

const r1 = (n: number) => Math.round(n * 100) / 100;

// The mark, in a 64 x 64 box: the cap (a half disc) with its gills as rays, and the stem.
const CAP = 'M8 36A24 24 0 0 1 56 36Z';
const STEM = 'M26.5 39H37.5L38.6 53Q38.8 56 35.8 56H28.2Q25.2 56 25.4 53Z';
const RAYS = [20, 40, 60, 80, 100, 120, 140, 160].map((deg) => {
  const a = (deg * Math.PI) / 180, x = (r: number) => r1(32 + r * Math.cos(a)), y = (r: number) => r1(36 - r * Math.sin(a));
  return `M${x(8)} ${y(8)}L${x(20)} ${y(20)}`;
}).join('');

export function colors(v: LogoVariant) {
  if (v === 'negativo') return { bg: C.oliva, cap: C.bianco, stem: C.crema, name: C.bianco, tagline: C.crema };
  if (v === 'mono') return { bg: null, cap: C.inchiostro, stem: C.inchiostro, name: C.inchiostro, tagline: C.inchiostro };
  return { bg: null, cap: C.terra, stem: C.oliva, name: C.inchiostro, tagline: C.oliva };
}

/** The mark alone, placed at (x, y) and scaled to `size`; the rays are cut out of the cap, so any background shows through. */
export function markGroup(x: number, y: number, size: number, v: LogoVariant, id: string): string {
  const k = colors(v), s = r1(size / 64);
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})">`
    + `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/>`
    + `<path d="${RAYS}" stroke="#000" stroke-width="2.4" stroke-linecap="round"/></mask>`
    + `<path d="${CAP}" fill="${k.cap}" mask="url(#${id})"/><path d="${STEM}" fill="${k.stem}"/></g>`;
}

/** The mark alone with no text and no fonts: for the site header and the browser tab icon. */
export function markSvg(v: LogoVariant = 'colore', id = 'mark'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${markGroup(0, 0, 64, v, id)}</svg>`;
}
