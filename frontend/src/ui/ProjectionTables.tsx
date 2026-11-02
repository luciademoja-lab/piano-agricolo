import { monthLabel } from '../lib/dates';
import { eur } from '../lib/format';
import { HORIZONS, SCENARIOS, totals, type Missing, type Projection } from '../lib/projection';

const horizonLabel = (n: number) => (n === 1 ? '1 mese' : n < 12 ? `${n} mesi` : n === 12 ? '1 anno' : `${n / 12} anni`);
const SHORT = { pess: 'Pess.', base: 'Base', opt: 'Ottim.' } as const;
const cls = (v: number) => (v < -0.5 ? 'neg' : v > 0.5 ? 'pos' : '');

/** Income, costs and balance over 1, 3, 6 months and 1, 2, 3 years, in the three scenarios. */
export function HorizonTable({ pr }: { pr: Projection }) {
  return (
    <div className="tablewrap">
      <table className="numtable">
        <caption className="sr-only">Prospetto per orizzonte, da 1 mese a 3 anni</caption>
        <thead>
          <tr><th rowSpan={2}>Orizzonte</th><th colSpan={3}>Ricavi</th><th colSpan={3}>Spese</th><th colSpan={3}>Saldo</th></tr>
          <tr>{[0, 1, 2].flatMap((g) => SCENARIOS.map((s) => <th key={g + s} className="sc">{SHORT[s]}</th>))}</tr>
        </thead>
        <tbody>
          {HORIZONS.map((n) => {
            const t = totals(pr, n);
            return (
              <tr key={n}>
                <th scope="row">{horizonLabel(n)}</th>
                {SCENARIOS.map((s) => <td key={'i' + s} className="mono">{eur(t.income[s])}</td>)}
                {SCENARIOS.map((s) => <td key={'c' + s} className="mono">{eur(t.cost[s])}</td>)}
                {SCENARIOS.map((s) => <td key={'n' + s} className={'mono ' + cls(t.net[s])}>{eur(t.net[s])}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">Pess. = ricavi minimi, spese massime, avvio più lento · Base = valori medi · Ottim. = ricavi massimi, spese minime, avvio più rapido.</p>
    </div>
  );
}

/** Month by month, base scenario with the range. */
export function MonthTable({ pr }: { pr: Projection }) {
  return (
    <div className="tablewrap">
      <table className="numtable">
        <caption className="sr-only">Prospetto mese per mese</caption>
        <thead><tr><th>Mese</th><th>Ricavi (base)</th><th>Spese (base)</th><th>Saldo del mese</th><th>Saldo cumulato (base)</th><th>Cumulato: pess. – ottim.</th></tr></thead>
        <tbody>
          {pr.months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{monthLabel(m.month)}</th>
              <td className="mono">{eur(m.income.base)}</td>
              <td className="mono">{eur(m.cost.base)}</td>
              <td className={'mono ' + cls(m.net.base)}>{eur(m.net.base)}</td>
              <td className={'mono ' + cls(m.cumulative.base)}>{eur(m.cumulative.base)}</td>
              <td className="mono sub">{eur(m.cumulative.pess)} – {eur(m.cumulative.opt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What the projections cannot count because the schema does not say it. */
export function MissingList({ missing }: { missing: Missing[] }) {
  if (!missing.length) return <p className="note">Nessun dato mancante per le colture nel piano.</p>;
  const byCrop = new Map<string, string[]>();
  for (const m of missing) byCrop.set(m.crop, [...new Set([...(byCrop.get(m.crop) || []), m.what])]);
  return (
    <ul className="missing">
      {[...byCrop].map(([crop, what]) => <li key={crop}><b>{crop}</b>: {what.join(', ')}</li>)}
    </ul>
  );
}
