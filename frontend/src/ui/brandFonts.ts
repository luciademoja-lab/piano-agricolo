// I caratteri del marchio, dentro l'app (non da Google): servono a trasformare in tracciati le
// scritte del logo, e a scrivere sui post e sui fogli da stampare anche senza connessione.
import { parse } from 'opentype.js';
import serif700 from '@fontsource/fraunces/files/fraunces-latin-700-normal.woff?url';
import sans400 from '@fontsource/public-sans/files/public-sans-latin-400-normal.woff?url';
import sans600 from '@fontsource/public-sans/files/public-sans-latin-600-normal.woff?url';
import sans700 from '@fontsource/public-sans/files/public-sans-latin-700-normal.woff?url';
import type { LogoFonts } from '../lib/brandkit';

/** The families to use in canvas and CSS once the fonts are loaded. */
export const SERIF = '"Brand Serif", "Fraunces", Georgia, serif';
export const SANS = '"Brand Sans", "Public Sans", Arial, sans-serif';

let loading: Promise<LogoFonts> | null = null;

export function loadBrandFonts(): Promise<LogoFonts> {
  loading ??= (async () => {
    const files = await Promise.all([serif700, sans400, sans600, sans700].map(async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error('Non riesco a caricare i caratteri del marchio. Ricarica la pagina.');
      return r.arrayBuffer();
    }));
    const [s700, p400, p600, p700] = files;
    const fonts = { serif: parse(s700.slice(0)), sans: parse(p600.slice(0)) };
    const faces = [
      new FontFace('Brand Serif', s700.slice(0), { weight: '700' }),
      new FontFace('Brand Sans', p400.slice(0), { weight: '400' }),
      new FontFace('Brand Sans', p600.slice(0), { weight: '600' }),
      new FontFace('Brand Sans', p700.slice(0), { weight: '700' }),
    ];
    await Promise.all(faces.map((f) => f.load()));
    for (const f of faces) document.fonts.add(f);
    return fonts;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}
