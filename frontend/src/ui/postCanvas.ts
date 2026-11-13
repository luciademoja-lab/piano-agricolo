// Disegna un post per i social su un canvas: foto, testi del fungo o dell'offerta, logo in basso.
// I testi vengono da lib/stories.ts e lib/brand.ts, cioè dalle stesse frasi già controllate del sito.
import { PALETTE, wrapLines, type PostTemplate } from '../lib/brandkit';
import type { PostOffer } from '../lib/brandkit';
import type { Story } from '../lib/stories';
import { SANS, SERIF } from './brandFonts';

const C = Object.fromEntries(PALETTE.map((c) => [c.id, c.hex])) as Record<string, string>;
const M = 72, FOOT = 170;

export type PostInput = {
  template: PostTemplate;
  width: number;
  height: number;
  name: string | null;
  story: Story | null;
  offer: PostOffer | null;
  photo: HTMLImageElement | null;
  /** who took the photo, printed on it (the catalogue photos are under a free licence that asks for it) */
  credit: string | null;
  logo: HTMLImageElement;
  mark: HTMLImageElement;
};

type Line = { text: string; font: string; size: number; lh: number; color: string; tracking?: number; gap?: number };
type Item = { text: string; font: 'serif' | 'sans'; weight: 400 | 600 | 700; size: number; lh: number; color: string; maxLines?: number; tracking?: number; gap?: number; upper?: boolean };

const fontOf = (i: { font: 'serif' | 'sans'; weight: number }, size: number) => `${i.weight} ${size}px ${i.font === 'serif' ? SERIF : SANS}`;

/** Lays out the items in a column `width` wide; shrinks everything until it fits in `maxHeight`. */
function layout(ctx: CanvasRenderingContext2D, items: Item[], width: number, maxHeight: number): { lines: Line[]; height: number } {
  for (let k = 1; k > 0.5; k -= 0.05) {
    const lines: Line[] = [];
    let height = 0;
    for (const it of items) {
      const size = Math.round(it.size * k), lh = Math.round(it.lh * k), tracking = (it.tracking ?? 0) * k;
      ctx.font = fontOf(it, size);
      ctx.letterSpacing = `${tracking}px`;
      const text = it.upper ? it.text.toLocaleUpperCase('it') : it.text;
      let wrapped = wrapLines(text, width, (s) => ctx.measureText(s).width);
      if (it.maxLines && wrapped.length > it.maxLines) {
        wrapped = wrapped.slice(0, it.maxLines);
        let last = wrapped[it.maxLines - 1];
        while (last.includes(' ') && ctx.measureText(`${last}…`).width > width) last = last.replace(/\s+\S+$/, '');
        wrapped[it.maxLines - 1] = `${last}…`;
      }
      wrapped.forEach((text, i) => lines.push({ text, font: fontOf(it, size), size, lh, color: it.color, tracking, gap: i === 0 ? Math.round((it.gap ?? 0) * k) : 0 }));
      height += Math.round((it.gap ?? 0) * k) + wrapped.length * lh;
    }
    ctx.letterSpacing = '0px';
    if (height <= maxHeight) return { lines, height };
  }
  return layout(ctx, items.map((i) => ({ ...i, maxLines: 1 })), width, Infinity);
}

function drawLines(ctx: CanvasRenderingContext2D, lines: Line[], x: number, y: number) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let at = y;
  for (const l of lines) {
    at += (l.gap ?? 0) + l.lh;
    ctx.font = l.font;
    ctx.letterSpacing = `${l.tracking ?? 0}px`;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, x, at - (l.lh - l.size) / 2 - l.size * 0.2);
  }
  ctx.letterSpacing = '0px';
}

/** Draws the photo so it covers the box, cropped in the middle; with no photo, the mark on cream. */
function cover(ctx: CanvasRenderingContext2D, p: PostInput, x: number, y: number, w: number, h: number, markAt = 0.5) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (p.photo) {
    const s = Math.max(w / p.photo.naturalWidth, h / p.photo.naturalHeight);
    const dw = p.photo.naturalWidth * s, dh = p.photo.naturalHeight * s;
    ctx.drawImage(p.photo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = C.crema; ctx.fillRect(x, y, w, h);
    const m = Math.min(w, h) * (markAt === 0.5 ? 0.42 : 0.3);
    ctx.drawImage(p.mark, x + (w - m) / 2, y + h * markAt - m / 2, m, m);
  }
  ctx.restore();
}

function credit(ctx: CanvasRenderingContext2D, p: PostInput, x: number, bottom: number) {
  if (!p.photo || !p.credit) return;
  ctx.font = `400 22px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
  ctx.fillText(`Foto: ${p.credit}`, x, bottom);
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
}

function footer(ctx: CanvasRenderingContext2D, p: PostInput) {
  const { width: W, height: H } = p, y = H - FOOT;
  ctx.fillStyle = C.carta; ctx.fillRect(0, y, W, FOOT);
  ctx.fillStyle = C.crema; ctx.fillRect(0, y, W, 3);
  const lh = 84, lw = (lh * p.logo.naturalWidth) / p.logo.naturalHeight;
  ctx.drawImage(p.logo, M - 8, y + (FOOT - lh) / 2, lw, lh);
  ctx.textAlign = 'right';
  ctx.font = `700 32px ${SANS}`; ctx.fillStyle = C.terra;
  ctx.fillText('Preordina', W - M, y + FOOT / 2 - 4);
  ctx.font = `400 26px ${SANS}`; ctx.fillStyle = C.oliva;
  ctx.fillText('link nella bio', W - M, y + FOOT / 2 + 32);
  ctx.textAlign = 'left';
}

export function drawPost(ctx: CanvasRenderingContext2D, p: PostInput) {
  const { width: W, height: H } = p, area = H - FOOT, text = W - 2 * M;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.carta; ctx.fillRect(0, 0, W, H);

  if (p.template === 'storia') {
    const items: Item[] = [
      { text: p.story?.badge ?? 'Funghi di Cinquefrondi', font: 'sans', weight: 700, size: 30, lh: 40, color: C.terra, tracking: 4, upper: true },
      { text: (p.name ?? '').replace(/\s*\(.*\)\s*/, ' ').trim(), font: 'serif', weight: 700, size: 96, lh: 104, color: C.inchiostro, maxLines: 2, gap: 14 },
      { text: p.story?.hook ?? '', font: 'sans', weight: 400, size: 40, lh: 54, color: C.inchiostro, maxLines: 3, gap: 18 },
    ];
    const block = layout(ctx, items, text, area * 0.5);
    const top = area - block.height - 56 - 48;
    cover(ctx, p, 0, 0, W, top);
    credit(ctx, p, M, top - 24);
    drawLines(ctx, block.lines, M, top + 48);
  } else if (p.template === 'raccolta') {
    cover(ctx, p, 0, 0, W, area, 0.3);
    const g = ctx.createLinearGradient(0, area * 0.4, 0, area);
    g.addColorStop(0, 'rgba(24,18,10,0)'); g.addColorStop(1, 'rgba(24,18,10,.78)');
    ctx.fillStyle = g; ctx.fillRect(0, area * 0.4, W, area * 0.6);
    const block = layout(ctx, [
      { text: 'Raccolti stamattina.', font: 'serif', weight: 700, size: 112, lh: 118, color: C.bianco, maxLines: 2 },
      { text: p.name ?? '', font: 'sans', weight: 700, size: 46, lh: 58, color: C.crema, maxLines: 1, gap: 18 },
      { text: 'Cinquefrondi · dalla raccolta alla tavola in giornata', font: 'sans', weight: 400, size: 32, lh: 44, color: C.crema, maxLines: 2, gap: 6 },
    ], text, area * 0.5);
    drawLines(ctx, block.lines, M, area - block.height - 64);
    credit(ctx, p, M, area - 24);
  } else {
    ctx.fillStyle = C.oliva; ctx.fillRect(0, 0, W, area);
    const o = p.offer;
    const items: Item[] = o ? [
      { text: o.who, font: 'sans', weight: 700, size: 30, lh: 40, color: C.crema, tracking: 4, upper: true },
      { text: o.name, font: 'serif', weight: 700, size: 84, lh: 92, color: C.bianco, maxLines: 3, gap: 16 },
      { text: o.promise, font: 'sans', weight: 400, size: 40, lh: 54, color: C.crema, maxLines: 3, gap: 22 },
      ...o.points.map((pt, i): Item => ({ text: `—  ${pt}`, font: 'sans', weight: 400, size: 34, lh: 46, color: C.bianco, maxLines: 3, gap: i === 0 ? 34 : 12 })),
      { text: o.guarantee, font: 'sans', weight: 700, size: 34, lh: 46, color: C.crema, maxLines: 3, gap: 34 },
    ] : [];
    const block = layout(ctx, items, text, area - 2 * 80);
    drawLines(ctx, block.lines, M, (area - block.height) / 2);
  }
  footer(ctx, p);
}
