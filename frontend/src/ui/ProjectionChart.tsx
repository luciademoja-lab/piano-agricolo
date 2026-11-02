// Running balance over 36 months: the base scenario as a line, the band from pessimistic to
// optimistic around it. One hue (identity is the scenario, not a category), zero line marked,
// crosshair tooltip with the three values. The same numbers are in the tables next to it.
import { useLayoutEffect, useRef, useState } from 'react';
import { monthLabel } from '../lib/dates';
import { eur, eurShort } from '../lib/format';
import type { MonthRow } from '../lib/projection';

const H = 280, L = 64, R = 14, T = 14, B = 30;

function niceStep(span: number, ticks = 5): number {
  const raw = span / ticks, mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
}

export function ProjectionChart({ months, title }: { months: MonthRow[]; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // drawn at the real width of its box, so labels keep their size on any screen
  const [W, setW] = useState(720);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => setW(Math.max(320, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  if (!months.length) return null;
  const vals = months.flatMap((m) => [m.cumulative.pess, m.cumulative.opt, m.cumulative.base, 0]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { hi += 100; lo -= 100; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = (i: number) => L + (i / Math.max(1, months.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = (pts: Array<[number, number]>) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
  const band = line(months.map((m, i) => [x(i), y(m.cumulative.opt)])) + [...months.keys()].reverse().map((i) => `L${x(i).toFixed(1)},${y(months[i].cumulative.pess).toFixed(1)}`).join('') + 'Z';
  const base = line(months.map((m, i) => [x(i), y(m.cumulative.base)]));
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  const every = W < 520 ? 12 : 6;
  const xTicks = months.map((m, i) => ({ m, i })).filter(({ i }) => (i % every === 0 && months.length - 1 - i >= every / 2) || i === months.length - 1);
  const last = months[months.length - 1];

  const onMove = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (months.length - 1));
    setHover(Math.max(0, Math.min(months.length - 1, i)));
  };
  const h = hover !== null ? months[hover] : null;

  return (
    <figure className="pchart">
      <figcaption className="pchart-legend">
        <span><i className="sw line" /> Saldo cumulato, scenario base</span>
        <span><i className="sw band" /> Tra pessimista e ottimista</span>
      </figcaption>
      <div className="pchart-box" ref={box} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: dopo ${months.length} mesi il saldo cumulato va da ${eur(last.cumulative.pess)} (pessimista) a ${eur(last.cumulative.opt)} (ottimista), base ${eur(last.cumulative.base)}.`}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'zero' : 'grid'} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="tick">{eurShort(v)}</text>
            </g>
          ))}
          {xTicks.map(({ m, i }) => <text key={m.month} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === months.length - 1 ? 'end' : 'middle'} className="tick">{monthLabel(m.month, true)}</text>)}
          <path d={band} className="band" />
          <path d={base} className="base" />
          <circle cx={x(months.length - 1)} cy={y(last.cumulative.base)} r={4} className="dot" />
          {hover !== null && (<>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="cross" />
            <circle cx={x(hover)} cy={y(months[hover].cumulative.base)} r={5} className="dot" />
          </>)}
        </svg>
        {h && hover !== null && (
          <div className="pchart-tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
            <b>{monthLabel(h.month)}</b>
            <span>Saldo cumulato</span>
            <span className="row"><span>Ottimista</span><span className="mono">{eur(h.cumulative.opt)}</span></span>
            <span className="row"><span>Base</span><b className="mono">{eur(h.cumulative.base)}</b></span>
            <span className="row"><span>Pessimista</span><span className="mono">{eur(h.cumulative.pess)}</span></span>
            <span className="row sub"><span>Nel mese (base)</span><span className="mono">{eur(h.income.base)} − {eur(h.cost.base)}</span></span>
          </div>
        )}
      </div>
    </figure>
  );
}
