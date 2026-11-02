// Prospetti: the whole plan, 1 month to 3 years, three scenarios; per crop and month by month.
import { cropById } from '../lib/catalog';
import { dateLabel, monthOf } from '../lib/dates';
import { eur } from '../lib/format';
import { THRESHOLDS, project, totals, yearTotals } from '../lib/projection';
import { ProjectionChart } from './ProjectionChart';
import { HorizonTable, MissingList, MonthTable } from './ProjectionTables';
import type { PageProps } from './shared';

export function ProjectionsPage({ farm, today, go }: PageProps) {
  const pr = project(farm.plantings, farm.catalog, farm.expenses, monthOf(today));
  const hasRecurring = farm.plantings.every((p) => cropById(farm.catalog, p.cropId)?.recurringMonthly);
  if (!farm.plantings.length) {
    return (
      <section className="page" aria-labelledby="pr-h">
        <div><div className="eyebrow">Piano d'azione</div><h2 id="pr-h">Prospetti</h2></div>
        <div className="panel emptystate"><p>I prospetti partono quando aggiungi una coltura.</p>
          <button className="btn primary" type="button" onClick={() => go({ tab: 'coltivazioni' })}>Vai a Coltivazioni</button></div>
      </section>
    );
  }
  return (
    <section className="page" aria-labelledby="pr-h">
      <div><div className="eyebrow">Piano d'azione</div><h2 id="pr-h">Prospetti</h2></div>
      <p className="banner warnbanner">
        I ricavi vengono dallo schema di Rendita Agricola (stime da case study dei corsisti), <b>da confermare</b>.
        {!hasRecurring && ' I costi ricorrenti mancano: il saldo qui sotto è più alto di quello reale.'}
      </p>
      <div className="panel">
        <h3>Saldo cumulato, da {dateLabel(today)}</h3>
        <ProjectionChart months={pr.months} title="Saldo cumulato del piano" />
        <HorizonTable pr={pr} />
      </div>

      <div className="panel">
        <h3>Anno per anno (scenario base)</h3>
        <div className="tablewrap">
          <table className="numtable">
            <thead><tr><th>Anno</th><th>Ricavi</th><th>Spese</th><th>Saldo</th><th>Esonero IVA (fino a € 7.000 di ricavi)</th></tr></thead>
            <tbody>
              {[0, 1, 2].map((k) => {
                const t = yearTotals(pr, k);
                return (
                  <tr key={k}>
                    <th scope="row">{k + 1}° anno</th>
                    <td className="mono">{eur(t.income.base)}</td><td className="mono">{eur(t.cost.base)}</td><td className="mono">{eur(t.net.base)}</td>
                    <td>{t.income.base <= THRESHOLDS.vatExemption ? 'dentro la soglia' : <b>sopra la soglia (esonero perso dall'anno dopo)</b>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Per coltura, primi 12 mesi</h3>
        <div className="tablewrap">
          <table className="numtable">
            <thead><tr><th>Coltura</th><th>Ricavi pess.</th><th>Ricavi base</th><th>Ricavi ottim.</th><th>Spese base</th></tr></thead>
            <tbody>
              {farm.plantings.map((p) => {
                const c = cropById(farm.catalog, p.cropId)!;
                const t = totals(project([p], farm.catalog, farm.expenses.filter((e) => e.plantingId === p.id), monthOf(today)), 12);
                return (
                  <tr key={p.id}>
                    <th scope="row"><a href={`#/coltura/${p.id}`} onClick={(e) => { e.preventDefault(); go({ tab: 'coltivazioni', planting: p.id }); }}>{c.name}</a></th>
                    {c.income ? <><td className="mono">{eur(t.income.pess)}</td><td className="mono">{eur(t.income.base)}</td><td className="mono">{eur(t.income.opt)}</td></> : <td colSpan={3}><span className="missing-tag">ricavo mancante</span></td>}
                    <td className="mono">{eur(t.cost.base)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Cosa manca ai prospetti</h3>
        <MissingList missing={pr.missing} />
      </div>

      <details className="panel">
        <summary>Mese per mese, 36 mesi</summary>
        <MonthTable pr={pr} />
      </details>
    </section>
  );
}
