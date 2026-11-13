import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, type Font } from 'opentype.js';
import qrcode from 'qrcode-generator';
import { BRAND } from './brand';
import { SEED_VARIETIES } from './pricing';
import {
  LOGO_DEFAULTS, PALETTE, POST_TEMPLATES, breaksRules, caption, logoSvg, markSvg, preorderUrl, qrSvg, shortUrl, wrapLines,
  type LogoFonts, type LogoLayout, type LogoVariant,
} from './brandkit';

const font = (file: string): Font => {
  const b = readFileSync(join(__dirname, '../../../node_modules/@fontsource', file));
  return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
let fonts: LogoFonts;
beforeAll(() => {
  fonts = { serif: font('fraunces/files/fraunces-latin-700-normal.woff'), sans: font('public-sans/files/public-sans-latin-600-normal.woff') };
});

describe('the logo', () => {
  const layouts: LogoLayout[] = ['orizzontale', 'verticale', 'simbolo'];
  const variants: LogoVariant[] = ['colore', 'negativo', 'mono'];
  it('comes in every layout and variant, with the letters turned into shapes', () => {
    for (const layout of layouts) for (const variant of variants) {
      const l = logoSvg(fonts, { layout, variant, ...LOGO_DEFAULTS });
      expect(l.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
      expect(l.svg).not.toMatch(/<text/);
      expect(l.width).toBeGreaterThan(60);
      expect(l.svg).toContain(`viewBox="0 0 ${l.width} ${l.height}"`);
      if (layout !== 'simbolo') expect(l.svg.match(/<path d="M/g)!.length).toBeGreaterThanOrEqual(4);
    }
  });
  it('is as wide as its longest line, and grows with the name', () => {
    const short = logoSvg(fonts, { layout: 'orizzontale', variant: 'colore', name: 'Lucia', tagline: '' });
    const long = logoSvg(fonts, { layout: 'orizzontale', variant: 'colore', name: 'Lucia De Mojà, funghi e uova', tagline: '' });
    expect(long.width).toBeGreaterThan(short.width + 150);
  });
  it('names itself for screen readers, safely', () => {
    const l = logoSvg(fonts, { layout: 'verticale', variant: 'mono', name: 'A & B <x>', tagline: 'Funghi' });
    expect(l.svg).toContain('aria-label="A &amp; B &lt;x&gt; · Funghi"');
  });
  it('uses only the colours of the kit', () => {
    const kit = new Set<string>(PALETTE.map((c) => c.hex));
    for (const variant of variants) {
      const used = logoSvg(fonts, { layout: 'orizzontale', variant, ...LOGO_DEFAULTS }).svg.match(/fill="(#[0-9a-f]{6})"/g)!.map((f) => f.slice(6, -1));
      for (const c of used) expect(kit.has(c), c).toBe(true);
    }
  });
  it('keeps two marks on one page apart (each mask has its own id)', () => {
    expect(markSvg('colore', 'a')).toContain('mask="url(#a)"');
    expect(markSvg('colore', 'b')).not.toContain('url(#a)');
  });
});

describe('the QR code', () => {
  it('encodes the address of the questionnaire, with its quiet zone', () => {
    const url = preorderUrl('https://piano-agricolo.vercel.app', '/');
    expect(url).toBe('https://piano-agricolo.vercel.app/#/interesse');
    expect(shortUrl(url)).toBe('piano-agricolo.vercel.app/#/interesse');
    const q = qrSvg(url);
    const n = (() => { const x = qrcode(0, 'M'); x.addData(url, 'Byte'); x.make(); return x.getModuleCount(); })();
    expect(q.width).toBe(n + 8);
    expect(q.svg).toContain('<rect width');
  });
});

describe('wrapping text', () => {
  it('breaks by whole words and keeps paragraphs', () => {
    const lines = wrapLines('uno due tre quattro\ncinque', 9, (s) => s.length);
    expect(lines).toEqual(['uno due', 'tre', 'quattro', 'cinque']);
  });
});

describe('the captions of the posts', () => {
  it('follow the rules for every mushroom and offer', () => {
    for (const v of SEED_VARIETIES) for (const t of POST_TEMPLATES) {
      const text = caption(t.id, v, BRAND.offers[0]);
      expect(breaksRules(text), `${t.id} ${v.id}`).toBe(false);
      expect(text).toContain('#cinquefrondi');
    }
    for (const o of BRAND.offers) expect(breaksRules(caption('offerta', null, o))).toBe(false);
  });
  it('tell the story of the mushroom', () => {
    const text = caption('storia', { id: 'cardoncello', commonName: 'Cardoncello' }, null);
    expect(text).toMatch(/^Il re dei pleurotus: Cardoncello\./);
    expect(text).toContain('#cardoncello');
  });
});
