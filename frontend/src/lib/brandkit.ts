// Il kit del marchio: logo, colori, QR code e testi dei post. Tutto qui è puro (niente browser),
// così i test lo controllano; caricare i caratteri e disegnare sul canvas sta in ui/BrandPage.tsx.
//
// Il logo è originale: un fungo il cui cappello, con le lamelle, è anche un sole che sorge
// ("raccolti stamattina"). Le scritte del logo diventano tracciati (con opentype.js), così il file
// SVG si apre uguale ovunque, anche dalla tipografia, senza installare i caratteri.
import type { Font } from 'opentype.js';
import qrcode from 'qrcode-generator';
import { BRAND } from './brand';
import { FORBIDDEN, storyOf } from './stories';
import { C, colors, markGroup, type LogoVariant } from './mark';

export { PALETTE, markSvg, type LogoVariant } from './mark';

export const TYPEFACES = [
  { name: 'Fraunces', role: 'Nome e titoli', url: 'https://fonts.google.com/specimen/Fraunces' },
  { name: 'Public Sans', role: 'Testi e sottotitoli', url: 'https://fonts.google.com/specimen/Public+Sans' },
] as const;

export type LogoLayout = 'orizzontale' | 'verticale' | 'simbolo';
export type LogoFonts = { serif: Font; sans: Font };
export type LogoOptions = { layout: LogoLayout; variant: LogoVariant; name: string; tagline: string };
export type Svg = { svg: string; width: number; height: number };

export const LOGO_DEFAULTS = { name: BRAND.name, tagline: 'Funghi di Cinquefrondi' };

/** Path data of a line of text, with extra space between the letters (`tracking`, in px). */
export function textPath(font: Font, text: string, x: number, baseline: number, size: number, tracking = 0): { d: string; width: number } {
  if (!tracking) {
    const width = font.getAdvanceWidth(text, size, { kerning: true });
    return { d: font.getPath(text, x, baseline, size, { kerning: true }).toPathData(2), width };
  }
  const scale = size / font.unitsPerEm;
  let at = x, d = '';
  const glyphs = font.stringToGlyphs(text);
  glyphs.forEach((g, i) => {
    d += g.getPath(at, baseline, size).toPathData(2);
    at += (g.advanceWidth ?? 0) * scale + (i < glyphs.length - 1 ? tracking : 0);
  });
  return { d, width: at - x };
}

/** The whole logo as a standalone SVG file: no fonts needed to open it. */
export function logoSvg(fonts: LogoFonts, o: LogoOptions, id = 'logo'): Svg {
  const k = colors(o.variant), pad = o.variant === 'negativo' ? 24 : 8;
  const name = o.name.trim() || LOGO_DEFAULTS.name;
  const tagline = o.tagline.trim().toLocaleUpperCase('it');
  let body: string, w: number, h: number;
  if (o.layout === 'simbolo') {
    w = h = 64 + 2 * pad;
    body = markGroup(pad, pad, 64, o.variant, `${id}-m`);
  } else if (o.layout === 'orizzontale') {
    const n = textPath(fonts.serif, name, 0, 0, 30), t = tagline ? textPath(fonts.sans, tagline, 0, 0, 11, 2.2) : null;
    const tx = pad + 78, nameY = pad + (t ? 34 : 42);
    const nameP = textPath(fonts.serif, name, tx, nameY, 30), tagP = t ? textPath(fonts.sans, tagline, tx, pad + 53, 11, 2.2) : null;
    w = tx + Math.max(n.width, t?.width ?? 0) + pad;
    h = 64 + 2 * pad;
    body = markGroup(pad, pad, 64, o.variant, `${id}-m`)
      + `<path d="${nameP.d}" fill="${k.name}"/>` + (tagP ? `<path d="${tagP.d}" fill="${k.tagline}"/>` : '');
  } else {
    const n = textPath(fonts.serif, name, 0, 0, 34), t = tagline ? textPath(fonts.sans, tagline, 0, 0, 12, 2.4) : null;
    w = Math.max(96, n.width, t?.width ?? 0) + 2 * pad;
    const nameP = textPath(fonts.serif, name, (w - n.width) / 2, pad + 96 + 40, 34);
    const tagP = t ? textPath(fonts.sans, tagline, (w - t.width) / 2, pad + 96 + 64, 12, 2.4) : null;
    h = pad + 96 + (t ? 74 : 50) + pad;
    body = markGroup((w - 96) / 2, pad, 96, o.variant, `${id}-m`)
      + `<path d="${nameP.d}" fill="${k.name}"/>` + (tagP ? `<path d="${tagP.d}" fill="${k.tagline}"/>` : '');
  }
  w = Math.ceil(w); h = Math.ceil(h);
  const bg = k.bg ? `<rect width="${w}" height="${h}" rx="${o.layout === 'simbolo' ? w / 2 : 12}" fill="${k.bg}"/>` : '';
  const title = `${name}${tagline ? ` · ${o.tagline.trim()}` : ''}`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${bg}${body}</svg>`,
    width: w, height: h,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A QR code as an SVG (dark squares on a white background, with the 4-square quiet zone it needs to be read). */
export function qrSvg(text: string, color = C.inchiostro): Svg {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount(), q = 4, size = n + 2 * q;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`,
    width: size, height: size,
  };
}

/** Where the QR codes and the posts send people: the questionnaire of this same site. */
export function preorderUrl(origin: string, path = '/'): string {
  return `${origin.replace(/\/$/, '')}${path.endsWith('/') ? path : `${path}/`}#/interesse`;
}
/** The same address, short enough to print under a QR code. */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/#/, '/#');

/** Splits a text into lines no wider than `max`, by whole words. */
export function wrapLines(text: string, max: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > max) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

// ---- Post per i social ----

export type PostTemplate = 'storia' | 'raccolta' | 'offerta';
export const POST_TEMPLATES: ReadonlyArray<{ id: PostTemplate; label: string; note: string }> = [
  { id: 'storia', label: 'La storia di un fungo', note: 'Foto, etichetta e la frase che lo fa desiderare.' },
  { id: 'raccolta', label: 'Raccolti stamattina', note: 'Usalo solo il giorno in cui raccogli davvero, con una tua foto.' },
  { id: 'offerta', label: "Un'offerta", note: "L'abbonamento per i ristoranti o la cassetta per le famiglie." },
];
export const POST_FORMATS = [
  { id: 'verticale', label: 'Post verticale 4:5', width: 1080, height: 1350 },
  { id: 'quadrato', label: 'Post quadrato', width: 1080, height: 1080 },
  { id: 'storia', label: 'Storia 9:16', width: 1080, height: 1920 },
] as const;
export type PostFormat = (typeof POST_FORMATS)[number]['id'];

const HASHTAGS = ['#funghi', '#funghifreschi', '#cinquefrondi', '#pianadigioiatauro', '#calabria', '#kmzero'];
const tagOf = (name: string) => `#${name.toLocaleLowerCase('it').normalize('NFD').replace(/[^a-z0-9]/g, '')}`;

export type PostMushroom = { id: string; commonName: string };
export type PostOffer = (typeof BRAND.offers)[number];

/** The text to paste under the picture. It follows the rules of the stories: no health claims, nothing for sale yet. */
export function caption(t: PostTemplate, m: PostMushroom | null, offer: PostOffer | null): string {
  const tags = [...HASHTAGS, ...(m ? [tagOf(m.commonName)] : [])].join(' ');
  const cta = 'Preordina senza impegno: il link è nella bio.';
  let text: string;
  if (t === 'offerta' && offer) {
    text = [offer.name, offer.promise, offer.points.map((p) => `• ${p}`).join('\n'), [offer.guarantee, offer.limit].filter(Boolean).join(' '), cta].join('\n\n');
  } else if (t === 'raccolta' && m) {
    text = [`Raccolti stamattina: ${m.commonName}.`, 'Dalla raccolta alla tavola in giornata, coltivati a Cinquefrondi.', cta].join('\n\n');
  } else if (m) {
    const s = storyOf(m.id);
    text = s ? [`${s.badge}: ${m.commonName}.`, s.hook, s.story, s.why, cta].join('\n\n') : [m.commonName, cta].join('\n\n');
  } else text = cta;
  return `${text}\n\n${tags}`;
}

/** True when a text breaks the rules of what can be said (health claims, selling before the registration). */
export const breaksRules = (text: string) => FORBIDDEN.test(text);
